import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { trackingLimit } from '../../middleware/rateLimit';
import { env } from '../../config/env';

const router = Router();

// Apply dedicated tracking rate limit to all tracking routes
router.use(trackingLimit);

// 1x1 transparent GIF (43 bytes)
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function anonymiseIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return parts.slice(0, 3).join('.');
  // IPv6 — keep first 3 groups
  const v6parts = ip.split(':');
  return v6parts.slice(0, 3).join(':') + ':*';
}

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
    : req.socket.remoteAddress || '';
  return anonymiseIp(raw);
}

function getDeviceType(ua: string): string {
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'mobile';
  if (/tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

async function upsertSession(
  prisma: ReturnType<typeof getPrisma>,
  {
    businessId, sessionId, visitorId, affiliateCode,
    entryUrl, entryChannel, entryContentId, funnelStage,
  }: {
    businessId: string; sessionId: string; visitorId?: string;
    affiliateCode?: string; entryUrl?: string; entryChannel?: string;
    entryContentId?: string; funnelStage: string;
  },
) {
  const existing = await prisma.visitorSession.findUnique({ where: { sessionId } });
  if (existing) {
    const stages = existing.stages.includes(funnelStage)
      ? existing.stages
      : [...existing.stages, funnelStage];
    await prisma.visitorSession.update({
      where: { sessionId },
      data: { lastSeenAt: new Date(), eventCount: { increment: 1 }, stages },
    });
  } else {
    await prisma.visitorSession.create({
      data: {
        businessId, sessionId,
        visitorId: visitorId || null,
        affiliateCode: affiliateCode || null,
        entryUrl: entryUrl || null,
        entryChannel: entryChannel || null,
        entryContentId: entryContentId || null,
        eventCount: 1,
        stages: [funnelStage],
      },
    });
  }
}

// GET /track/ref/:code — affiliate link click + redirect
router.get('/ref/:code', async (req: Request, res: Response) => {
  const code = (String(req.params['code'] || '')).toUpperCase().trim();
  const channel = (req.query['ch'] as string) || 'unknown';
  const contentRunId = (req.query['cid'] as string) || undefined;
  const ua = req.headers['user-agent'] || '';

  // Read or set visitorId cookie (1-year)
  let visitorId = req.cookies?.['_an_vid'] as string | undefined;
  if (!visitorId) {
    visitorId = uuidv4();
  }
  const sessionId = uuidv4();

  // Set cookie
  res.cookie('_an_vid', visitorId, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
  });

  // Async tracking — never block redirect
  setImmediate(async () => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code } });
      if (!affiliate) return;

      const businessId = affiliate.businessId;
      const config = await prisma.businessConfig.findUnique({ where: { businessId } });
      const landingUrl = config?.landingPageUrl || env.APP_URL;

      await prisma.funnelEvent.create({
        data: {
          businessId,
          sessionId,
          visitorId,
          affiliateCode: code,
          contentRunId: contentRunId || null,
          eventType: 'click',
          channel,
          funnelStage: 'interest',
          referrerUrl: req.headers['referer'] || null,
          deviceType: getDeviceType(ua),
          userAgent: ua.slice(0, 255),
          ipPrefix: getIp(req),
          utmSource: (req.query['utm_source'] as string) || null,
          utmMedium: (req.query['utm_medium'] as string) || null,
          utmCampaign: (req.query['utm_campaign'] as string) || null,
        },
      });

      await upsertSession(prisma, {
        businessId, sessionId, visitorId,
        affiliateCode: code,
        entryChannel: channel,
        entryContentId: contentRunId,
        funnelStage: 'interest',
      });
    } catch (err) {
      logger.warn({ err }, 'Funnel tracking error on ref click');
    }
  });

  // Immediate redirect
  const prisma = getPrisma();
  let landingUrl = env.APP_URL;
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { code } });
    if (affiliate) {
      const config = await prisma.businessConfig.findUnique({ where: { businessId: affiliate.businessId } });
      if (config?.landingPageUrl) landingUrl = config.landingPageUrl;
    }
  } catch {}

  const dest = `${landingUrl}?ref=${encodeURIComponent(code)}&sid=${sessionId}&vid=${visitorId}`;
  res.redirect(302, dest);
});

// POST /track/event — general funnel event from tracking script
router.post('/event', async (req: Request, res: Response) => {
  // Always return 200 quickly
  res.json({ ok: true });

  setImmediate(async () => {
    try {
      const {
        businessId,
        sessionId, visitorId, affiliateCode,
        eventType, channel = 'direct', funnelStage = 'awareness',
        url, pageTitle, referrerUrl, contentFormat, variantId,
        conversionType, conversionValue, utmSource, utmMedium, utmCampaign, utmContent,
      } = req.body as Record<string, string | number | undefined>;

      if (!sessionId || !eventType || !businessId) return;

      const prisma = getPrisma();
      const ua = req.headers['user-agent'] || '';

      await prisma.funnelEvent.create({
        data: {
          businessId: String(businessId),
          sessionId: String(sessionId),
          visitorId: visitorId ? String(visitorId) : null,
          affiliateCode: affiliateCode ? String(affiliateCode) : null,
          eventType: String(eventType),
          channel: String(channel),
          funnelStage: String(funnelStage),
          url: url ? String(url).slice(0, 1000) : null,
          pageTitle: pageTitle ? String(pageTitle).slice(0, 255) : null,
          referrerUrl: referrerUrl ? String(referrerUrl).slice(0, 1000) : null,
          contentFormat: contentFormat ? String(contentFormat) : null,
          variantId: variantId ? String(variantId) : null,
          utmSource: utmSource ? String(utmSource) : null,
          utmMedium: utmMedium ? String(utmMedium) : null,
          utmCampaign: utmCampaign ? String(utmCampaign) : null,
          utmContent: utmContent ? String(utmContent) : null,
          deviceType: getDeviceType(String(ua)),
          userAgent: String(ua).slice(0, 255),
          ipPrefix: getIp(req),
          conversionType: conversionType ? String(conversionType) : null,
          conversionValue: conversionValue ? Number(conversionValue) : null,
        },
      });

      await upsertSession(prisma, {
        businessId: String(businessId),
        sessionId: String(sessionId),
        visitorId: visitorId ? String(visitorId) : undefined,
        affiliateCode: affiliateCode ? String(affiliateCode) : undefined,
        funnelStage: String(funnelStage),
      });
    } catch (err) {
      logger.warn({ err }, 'Funnel event tracking error');
    }
  });
});

// GET /track/pixel.gif — email open pixel
router.get('/pixel.gif', async (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(TRACKING_PIXEL.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(TRACKING_PIXEL);

  setImmediate(async () => {
    try {
      const { cid, sid, bid } = req.query as Record<string, string>;
      if (!bid || !sid) return;
      if (!sid) return;
      const prisma = getPrisma();
      await prisma.funnelEvent.create({
        data: {
          businessId: String(bid),
          sessionId: String(sid),
          eventType: 'open',
          channel: 'email',
          funnelStage: 'awareness',
          campaignId: cid || null,
          ipPrefix: getIp(req),
        },
      });
      await upsertSession(prisma, {
        businessId: String(bid),
        sessionId: String(sid),
        funnelStage: 'awareness',
      });
    } catch (err) {
      logger.warn({ err }, 'Email pixel tracking error');
    }
  });
});

// GET /track/click/:trackingId — email click redirect
router.get('/click/:trackingId', async (req: Request, res: Response) => {
  const rawUrl = req.query['url'] as string;
  const { sid, bid, cid } = req.query as Record<string, string>;

  // Redirect immediately
  let dest = '/';
  try {
    if (rawUrl) dest = decodeURIComponent(rawUrl);
  } catch {}
  res.redirect(302, dest);

  setImmediate(async () => {
    try {
      if (!sid) return;
      const prisma = getPrisma();
      await prisma.funnelEvent.create({
        data: {
          businessId: String(bid),
          sessionId: String(sid),
          eventType: 'click',
          channel: 'email',
          funnelStage: 'interest',
          campaignId: cid || null,
          url: dest.slice(0, 1000),
          ipPrefix: getIp(req),
        },
      });
      await upsertSession(prisma, {
        businessId: String(bid),
        sessionId: String(sid),
        funnelStage: 'interest',
      });
    } catch (err) {
      logger.warn({ err }, 'Email click tracking error');
    }
  });
});

// POST /track/conversion — server-side conversion webhook
router.post('/conversion', async (req: Request, res: Response, next: NextFunction) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  const expectedSecret = process.env['TRACKING_PIXEL_SECRET'] || '';
  if (expectedSecret && secret !== expectedSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.json({ ok: true });

  setImmediate(async () => {
    try {
      const {
        businessId,
        sessionId, visitorId, affiliateCode,
        conversionType = 'unknown', conversionValue = 0,
        contentRunId, campaignId, referrerUrl,
        utmSource, utmMedium, utmCampaign,
      } = req.body as Record<string, string | number | undefined>;

      if (!businessId || !sessionId) return;

      const prisma = getPrisma();

      await prisma.conversionEvent.create({
        data: {
          businessId: String(businessId),
          affiliateCode: affiliateCode ? String(affiliateCode) : null,
          sessionId: sessionId ? String(sessionId) : null,
          visitorId: visitorId ? String(visitorId) : null,
          conversionType: String(conversionType),
          conversionValue: Number(conversionValue),
          contentRunId: contentRunId ? String(contentRunId) : null,
          campaignId: campaignId ? String(campaignId) : null,
          referrerUrl: referrerUrl ? String(referrerUrl) : null,
          utmSource: utmSource ? String(utmSource) : null,
          utmMedium: utmMedium ? String(utmMedium) : null,
          utmCampaign: utmCampaign ? String(utmCampaign) : null,
        },
      });

      // Session stitching: mark all sessions with this visitorId as converted
      if (visitorId) {
        await prisma.visitorSession.updateMany({
          where: { visitorId: String(visitorId), convertedAt: null },
          data: {
            convertedAt: new Date(),
            conversionType: String(conversionType),
            conversionValue: Number(conversionValue),
          },
        });
      } else if (sessionId) {
        await prisma.visitorSession.updateMany({
          where: { sessionId: String(sessionId), convertedAt: null },
          data: {
            convertedAt: new Date(),
            conversionType: String(conversionType),
            conversionValue: Number(conversionValue),
          },
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Conversion webhook tracking error');
    }
  });
});

// GET /track/tracker.js?bid=<businessId> — serve per-tenant tracking script
router.get('/tracker.js', (req: Request, res: Response) => {
  const bid = (req.query['bid'] as string) || '';
  const endpoint = `${env.APP_URL}/track/event`;
  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(buildTrackerScript(bid, endpoint));
});

function buildTrackerScript(bid: string, endpoint: string): string {
  return `
(function(){
  var ENDPOINT='${endpoint}';
  var BID='${bid}';
  var sid,vid,ref;

  function getCookie(n){var m=document.cookie.match('(^|;)\\\\s*'+n+'\\\\s*=\\\\s*([^;]+)');return m?m.pop():null}
  function setCookie(n,v,days){var d=new Date();d.setTime(d.getTime()+days*86400000);document.cookie=n+'='+v+';expires='+d.toUTCString()+';path=/;SameSite=Lax'}
  function uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c=='x'?r:r&0x3|0x8).toString(16)})}
  function getParam(k){return new URLSearchParams(location.search).get(k)}

  function init(){
    vid=getCookie('_an_vid');
    if(!vid){vid=uuid();setCookie('_an_vid',vid,365);}
    sid=sessionStorage.getItem('_an_sid');
    if(!sid){sid=uuid();sessionStorage.setItem('_an_sid',sid);}
    ref=getParam('ref')||sessionStorage.getItem('_an_ref')||null;
    if(getParam('ref'))sessionStorage.setItem('_an_ref',getParam('ref'));
  }

  function send(data){
    try{
      var payload=Object.assign({
        businessId:BID,sessionId:sid,visitorId:vid,affiliateCode:ref,
        url:location.href,referrerUrl:document.referrer,pageTitle:document.title,
        utmSource:getParam('utm_source'),utmMedium:getParam('utm_medium'),
        utmCampaign:getParam('utm_campaign'),utmContent:getParam('utm_content'),
        deviceType:/mobile|android|iphone|ipad/i.test(navigator.userAgent)?'mobile':'desktop'
      },data);
      if(navigator.sendBeacon){navigator.sendBeacon(ENDPOINT,JSON.stringify(payload));}
      else{fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(function(){});}
    }catch(e){}
  }

  function onLoad(){
    send({eventType:'pageview',channel:'direct',funnelStage:'awareness'});

    var depths=[25,50,75,100],fired={};
    window.addEventListener('scroll',function(){
      var pct=Math.round((window.scrollY+window.innerHeight)/document.body.scrollHeight*100);
      depths.forEach(function(d){if(pct>=d&&!fired[d]){fired[d]=true;send({eventType:'scroll_depth',channel:'direct',funnelStage:'interest',utmContent:String(d)});}});
    },{passive:true});

    document.addEventListener('focusin',function(e){
      if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){
        send({eventType:'form_start',channel:'direct',funnelStage:'consideration'});
      }
    },{once:true});

    document.addEventListener('submit',function(){
      send({eventType:'form_submit',channel:'direct',funnelStage:'conversion'});
    });
  }

  try{init();if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',onLoad);}else{onLoad();}}catch(e){}
})();
`.trim();
}

export default router;

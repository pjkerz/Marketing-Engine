import { getPrisma } from '../../lib/prisma';

export interface SpamScore {
  score: number;     // 0–100 (higher = more spammy)
  issues: string[];
  safe: boolean;     // true if score < 70
}

export interface Batch {
  subscriberIds: string[];
  sendAfter: Date;
}

// ── Layer 1: Content scoring ──────────────────────────────────────────────────

const SPAM_WORDS = [
  'free','winner','won','prize','cash','urgent','act now','limited time','offer expires',
  'click here','click below','guaranteed','no risk','risk-free','100% free','no cost',
  'earn money','make money','work from home','extra income','double your',
  'lose weight','amazing','incredible','miracle','revolutionary',
  'buy now','order now','purchase now','call now','sign up free',
  'unsubscribe','spam','this is not spam','not spam',
  '!!!','$$$','???','earn $','save $','$1000','$500',
  'congratulations','you have been selected','dear friend',
  'increase sales','increase traffic','cheap','discount',
  'credit card','no credit check','loan','mortgage','debt',
  'adult','xxx','sex','viagra','cialis','pharmacy',
  'bitcoin','crypto','investment opportunity','get rich',
  'multi-level','mlm','pyramid',
];

export function scoreContent(html: string, subject: string): SpamScore {
  const issues: string[] = [];
  let score = 0;

  const fullText = (subject + ' ' + html).toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Check spam trigger words
  const triggeredWords: string[] = [];
  for (const word of SPAM_WORDS) {
    if (fullText.includes(word.toLowerCase())) {
      triggeredWords.push(word);
    }
  }
  if (triggeredWords.length > 0) {
    const wordScore = Math.min(40, triggeredWords.length * 5);
    score += wordScore;
    issues.push(`Spam trigger words: ${triggeredWords.slice(0, 5).join(', ')}${triggeredWords.length > 5 ? ` +${triggeredWords.length - 5} more` : ''}`);
  }

  // Check subject line caps (>30% uppercase is spammy)
  const capsRatio = (subject.replace(/[^A-Z]/g, '').length / Math.max(subject.length, 1));
  if (capsRatio > 0.3) {
    score += 15;
    issues.push('Subject line has excessive capital letters');
  }

  // Check subject length
  if (subject.length > 70) {
    score += 5;
    issues.push(`Subject is too long (${subject.length} chars — keep under 70)`);
  }
  if (subject.length < 10) {
    score += 10;
    issues.push('Subject line is too short');
  }

  // Check exclamation marks in subject
  const exclamations = (subject.match(/!/g) || []).length;
  if (exclamations > 1) {
    score += exclamations * 5;
    issues.push(`Subject has ${exclamations} exclamation marks`);
  }

  // Check link count
  const linkMatches = html.match(/<a\s[^>]*href/gi) || [];
  if (linkMatches.length > 5) {
    score += 10;
    issues.push(`High link count: ${linkMatches.length} links (keep under 5)`);
  }

  // Check image:text ratio
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const imgCount = (html.match(/<img/gi) || []).length;
  if (imgCount > 0 && textContent.length < 100) {
    score += 15;
    issues.push('Low text content relative to images');
  }

  // Check missing plain text (penalise HTML-only)
  // (Caller checks — this is a flag)

  // Check unsubscribe link
  if (!html.toLowerCase().includes('unsubscribe')) {
    score += 20;
    issues.push('Missing unsubscribe link — required by CAN-SPAM/GDPR');
  }

  // Check missing preheader/preview text
  if (!html.includes('class="preheader"') && !html.includes('<!--[if')) {
    // Minor — not all templates use this
  }

  return {
    score: Math.min(100, score),
    issues,
    safe: score < 70,
  };
}

// ── Layer 2: Send throttling ──────────────────────────────────────────────────

export async function getThrottledBatches(
  subscriberIds: string[],
  businessId: string,
): Promise<Batch[]> {
  const prisma = getPrisma();
  const config = await prisma.businessConfig.findUnique({ where: { businessId } });
  const dailyCap = config?.dailySendCap ?? 500;

  const batches: Batch[] = [];
  const batchSize = Math.min(50, Math.floor(dailyCap / 10)); // ~10 batches per day
  const now = new Date();

  // Start sending at 8am if before then, otherwise now
  const startHour = 8;
  const startTime = new Date(now);
  if (now.getHours() < startHour) startTime.setHours(startHour, 0, 0, 0);

  let chunkStart = 0;
  let batchIndex = 0;

  while (chunkStart < subscriberIds.length) {
    const chunk = subscriberIds.slice(chunkStart, chunkStart + batchSize);
    const sendAfter = new Date(startTime.getTime() + batchIndex * 30 * 1000); // 30s apart
    batches.push({ subscriberIds: chunk, sendAfter });
    chunkStart += batchSize;
    batchIndex++;
  }

  return batches;
}

// ── Layer 3: Domain warm-up ───────────────────────────────────────────────────

export async function getDailyLimit(businessId: string): Promise<number> {
  const prisma = getPrisma();
  const warmup = await prisma.domainWarmup.findUnique({ where: { businessId } });
  if (!warmup || warmup.complete) return Infinity;

  // Auto-increment warmup day
  const daysSinceStart = Math.floor(
    (Date.now() - warmup.startedAt.getTime()) / (86400 * 1000)
  );
  if (daysSinceStart > warmup.currentDay) {
    const schedule = warmup.warmupSchedule as Array<{ day: number; limit: number }>;
    const nextEntry = schedule.find(s => s.day > warmup.currentDay);
    const newLimit = nextEntry?.limit ?? warmup.dailySendLimit;
    const isComplete = warmup.currentDay >= 30;

    await prisma.domainWarmup.update({
      where: { businessId },
      data: {
        currentDay: daysSinceStart,
        dailySendLimit: newLimit,
        complete: isComplete,
      },
    });
    return newLimit;
  }

  return warmup.dailySendLimit;
}

// ── Layer 4: List hygiene ─────────────────────────────────────────────────────

export async function getSuppressedSubscribers(listId: string): Promise<string[]> {
  const prisma = getPrisma();

  const nintyDaysAgo = new Date(Date.now() - 90 * 86400000);

  // Unsubscribed or bounced
  const suppressed = await prisma.emailSubscriber.findMany({
    where: {
      listId,
      status: { in: ['unsubscribed', 'bounced', 'complained'] },
    },
    select: { id: true },
  });

  // 90-day no-open (never opened any send event in 90 days)
  const noOpen = await prisma.emailSendEvent.groupBy({
    by: ['subscriberId'],
    where: {
      subscriber: { listId },
      openedAt: null,
      sentAt: { lt: nintyDaysAgo },
    },
    _count: { id: true },
    having: { id: { _count: { gt: 2 } } },
  });

  const suppressedIds = new Set(suppressed.map(s => s.id));
  noOpen.forEach(n => suppressedIds.add(n.subscriberId));

  return [...suppressedIds];
}

// ── Layer 5: Engagement ordering ─────────────────────────────────────────────

export async function orderByEngagement(
  subscriberIds: string[],
): Promise<string[]> {
  const prisma = getPrisma();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const recentOpens = await prisma.emailSendEvent.findMany({
    where: { subscriberId: { in: subscriberIds }, openedAt: { gte: thirtyDaysAgo } },
    select: { subscriberId: true },
    distinct: ['subscriberId'],
  });
  const olderOpens = await prisma.emailSendEvent.findMany({
    where: {
      subscriberId: { in: subscriberIds },
      openedAt: { gte: ninetyDaysAgo, lt: thirtyDaysAgo },
    },
    select: { subscriberId: true },
    distinct: ['subscriberId'],
  });

  const recent = new Set(recentOpens.map(e => e.subscriberId));
  const older = new Set(olderOpens.map(e => e.subscriberId));

  const tier1 = subscriberIds.filter(id => recent.has(id));
  const tier2 = subscriberIds.filter(id => !recent.has(id) && older.has(id));
  const tier3 = subscriberIds.filter(id => !recent.has(id) && !older.has(id));

  return [...tier1, ...tier2, ...tier3];
}

// ── Unsubscribe token helpers ─────────────────────────────────────────────────

import * as crypto from 'crypto';

export function generateUnsubToken(subscriberId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(subscriberId).digest('hex').slice(0, 32);
}

export function verifyUnsubToken(subscriberId: string, token: string, secret: string): boolean {
  const expected = generateUnsubToken(subscriberId, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch { return false; }
}

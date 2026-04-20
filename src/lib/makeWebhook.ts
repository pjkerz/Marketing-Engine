/**
 * makeWebhook.ts
 * Fires a payload to the Make.com custom webhook URL when content is approved.
 * No-ops silently if MAKE_WEBHOOK_URL is not configured.
 */
import { env } from '../config/env';
import { logger } from './logger';

export interface MakeContentPayload {
  event: 'content_approved';
  runId: string;
  affiliateCode: string;
  affiliateName: string;
  channel: string;
  content: string;
  refLink: string;
  approvedAt: string;
}

export async function fireMakeWebhook(payload: MakeContentPayload): Promise<void> {
  if (!env.MAKE_WEBHOOK_URL) return;

  try {
    const res = await fetch(env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.warn(
        { module: 'makeWebhook', runId: payload.runId, status: res.status },
        'Make webhook returned non-2xx',
      );
    } else {
      logger.info(
        { module: 'makeWebhook', runId: payload.runId, channel: payload.channel },
        'Make webhook fired',
      );
    }
  } catch (err) {
    // Never throw — webhook failure must not break the approval flow
    logger.error({ module: 'makeWebhook', runId: payload.runId, err: (err as Error).message }, 'Make webhook failed');
  }
}

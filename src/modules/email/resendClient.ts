import { env } from '../../config/env';
import { logger } from '../../lib/logger';

interface ResendSendParams {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

interface ResendSendResult {
  id: string;
  error?: string;
}

export async function sendEmail(params: ResendSendParams): Promise<ResendSendResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ module: 'resendClient' }, 'RESEND_API_KEY not configured — email not sent');
    throw new Error('RESEND_API_KEY not configured in environment');
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      ...(params.headers ? { headers: params.headers } : {}),
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error({ module: 'resendClient', status: resp.status, body }, 'Resend API error');
    throw new Error(`Resend API error ${resp.status}: ${body}`);
  }

  const data = await resp.json() as { id: string };
  return { id: data.id };
}

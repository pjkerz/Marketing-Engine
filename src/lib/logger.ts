import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  redact: {
    paths: [
      'GOOGLE_AI_API_KEY', 'V2_JWT_SECRET', 'V2_ENCRYPTION_KEY',
      'GROQ_API_KEY', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN',
      '*.access_token', '*.refresh_token', '*.password',
      'body.resumeText', 'body.base64Data',
    ],
    censor: '[REDACTED]',
  },
});

export function childLogger(fields: Record<string, unknown>) {
  return logger.child(fields);
}

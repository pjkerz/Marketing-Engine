import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.V2_ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

export function decrypt(ciphertext: string): string {
  const iv = Buffer.from(ciphertext.slice(0, 24), 'hex');
  const tag = Buffer.from(ciphertext.slice(24, 56), 'hex');
  const encrypted = Buffer.from(ciphertext.slice(56), 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

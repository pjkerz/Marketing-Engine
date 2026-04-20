"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env_1.env.V2_ENCRYPTION_KEY, 'hex');
function encrypt(plaintext) {
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv(24 hex) + tag(32 hex) + ciphertext(hex)
    return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}
function decrypt(ciphertext) {
    const iv = Buffer.from(ciphertext.slice(0, 24), 'hex');
    const tag = Buffer.from(ciphertext.slice(24, 56), 'hex');
    const encrypted = Buffer.from(ciphertext.slice(56), 'hex');
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
}
//# sourceMappingURL=encryption.js.map
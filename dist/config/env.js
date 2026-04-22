"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load .env file manually (no dotenv dependency)
function loadDotEnv() {
    const envPath = path.resolve(__dirname, '../../.env');
    if (!fs.existsSync(envPath))
        return;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && !(key in process.env)) {
            process.env[key] = val;
        }
    }
}
loadDotEnv();
const EnvSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(3457),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('production'),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: zod_1.z.string().min(1, 'REDIS_URL is required'),
    V2_JWT_SECRET: zod_1.z.string().min(32, 'V2_JWT_SECRET must be at least 32 chars'),
    V2_ENCRYPTION_KEY: zod_1.z.string().length(64, 'V2_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)'),
    GROQ_API_KEY: zod_1.z.string().min(1, 'GROQ_API_KEY is required'),
    GROQ_MODEL_EXTRACT: zod_1.z.string().default('llama-3.1-8b-instant'),
    GROQ_MODEL_CONTENT: zod_1.z.string().default('llama-3.3-70b-versatile'),
    GOOGLE_AI_API_KEY: zod_1.z.string().min(1, 'GOOGLE_AI_API_KEY is required'),
    GOOGLE_AI_IMAGE_BATCH_MODE: zod_1.z.coerce.boolean().default(true),
    GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN: zod_1.z.coerce.number().default(3),
    // Zoho WorkDrive (file storage)
    ZOHO_CLIENT_ID: zod_1.z.string().min(1),
    ZOHO_CLIENT_SECRET: zod_1.z.string().min(1),
    ZOHO_REFRESH_TOKEN: zod_1.z.string().min(1),
    ZOHO_FOLDER_ID: zod_1.z.string().min(1),
    ZOHO_AFFILIATES_FOLDER_ID: zod_1.z.string().min(1),
    CREDS_MD_PATH: zod_1.z.string().default('/Users/macmini/.openclaw/workspace/CREDS.md'),
    AFFILIATES_JSON_PATH: zod_1.z.string().default('/Users/macmini/.openclaw/businesses/alphaboost/affiliates.json'),
    // Comma-separated admin credentials: "user1:pass1,user2:pass2"
    ADMIN_USERS: zod_1.z.string().optional(),
    CONSOLE_PASSWORD: zod_1.z.string().optional(),
    // Make.com webhook — fires when content is approved for Sendible
    MAKE_WEBHOOK_URL: zod_1.z.string().url().optional(),
    // Resend email sending
    RESEND_API_KEY: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.string().default('AlphaBoost <noreply@alphaboost.app>'),
    RESEND_WEBHOOK_SECRET: zod_1.z.string().optional(),
    // Tracking pixel
    TRACKING_PIXEL_SECRET: zod_1.z.string().optional(),
    SESSION_STITCH_SECRET: zod_1.z.string().optional(),
});
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map
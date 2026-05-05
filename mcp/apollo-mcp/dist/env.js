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
exports.loadEnv = loadEnv;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function parseDotEnv(filePath) {
    if (!fs.existsSync(filePath))
        return;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env))
            process.env[key] = val;
    }
}
let _env = null;
function loadEnv() {
    if (_env)
        return _env;
    // Try env files in priority order
    const candidates = [
        path.join(os.homedir(), '.openclaw', 'v2', '.env'),
        path.resolve(__dirname, '../../../../.env'), // project root from dist/
        path.resolve(__dirname, '../../../.env'),
    ];
    for (const p of candidates)
        parseDotEnv(p);
    const DATABASE_URL = process.env['DATABASE_URL'];
    const APOLLO_API_KEY = process.env['APOLLO_API_KEY'];
    const APP_URL = process.env['APP_URL'] ?? 'https://alphanoetic.me';
    const V2_JWT_SECRET = process.env['V2_JWT_SECRET'] ?? '';
    if (!DATABASE_URL)
        throw new Error('DATABASE_URL not set — check ~/.openclaw/v2/.env');
    if (!APOLLO_API_KEY)
        throw new Error('APOLLO_API_KEY not set — add it to ~/.openclaw/v2/.env');
    _env = { DATABASE_URL, APOLLO_API_KEY, APP_URL, V2_JWT_SECRET };
    return _env;
}
//# sourceMappingURL=env.js.map
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
exports.getPool = getPool;
exports.getEnv = getEnv;
exports.resolveBusinessId = resolveBusinessId;
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
function parseDotEnv() {
    const candidates = [
        path.join(os.homedir(), '.openclaw', 'v2', '.env'),
        path.resolve(__dirname, '../../../../.env'),
        path.resolve(__dirname, '../../../.env'),
    ];
    for (const p of candidates) {
        if (!fs.existsSync(p))
            continue;
        const lines = fs.readFileSync(p, 'utf8').split('\n');
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
        break;
    }
}
parseDotEnv();
let pool = null;
function getPool() {
    if (!pool) {
        const url = process.env['DATABASE_URL'];
        if (!url)
            throw new Error('DATABASE_URL not set');
        pool = new pg_1.Pool({ connectionString: url, max: 5 });
    }
    return pool;
}
function getEnv(key, fallback) {
    const val = process.env[key] ?? fallback;
    if (!val)
        throw new Error(`${key} not set`);
    return val;
}
async function resolveBusinessId(slug) {
    const res = await getPool().query(`SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`, [slug]);
    if (!res.rows[0])
        throw new Error(`Tenant not found: "${slug}". Valid slugs: alphaboost, dolce, alphanoetic`);
    return res.rows[0].id;
}
//# sourceMappingURL=db.js.map
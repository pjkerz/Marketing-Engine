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
exports.saveLeads = saveLeads;
const pg_1 = require("pg");
const env_1 = require("../env");
const crypto = __importStar(require("crypto"));
let pool = null;
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({ connectionString: (0, env_1.loadEnv)().DATABASE_URL, max: 3 });
    }
    return pool;
}
async function saveLeads(input) {
    const { businessSlug, contacts } = input;
    // Resolve businessId
    const bizResult = await getPool().query(`SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`, [businessSlug]);
    if (!bizResult.rows[0])
        throw new Error(`Tenant not found: ${businessSlug}`);
    const businessId = bizResult.rows[0].id;
    let saved = 0, skipped = 0, errors = 0;
    for (const c of contacts) {
        try {
            await getPool().query(`INSERT INTO leads
           (id, "businessId", source, "apolloId", "firstName", "lastName", email, phone,
            title, company, location, "linkedinUrl", "openToWork", status, "createdAt")
         VALUES ($1,$2,'apollo',$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'new',NOW())
         ON CONFLICT ("apolloId") DO UPDATE SET
           email       = COALESCE(EXCLUDED.email, leads.email),
           phone       = COALESCE(EXCLUDED.phone, leads.phone),
           title       = COALESCE(EXCLUDED.title, leads.title),
           company     = COALESCE(EXCLUDED.company, leads.company),
           location    = COALESCE(EXCLUDED.location, leads.location),
           "linkedinUrl" = COALESCE(EXCLUDED."linkedinUrl", leads."linkedinUrl")`, [
                crypto.randomUUID(),
                businessId,
                c.apolloId,
                c.name.split(' ')[0] ?? null,
                c.name.split(' ').slice(1).join(' ') || null,
                c.email,
                c.phone,
                c.title,
                c.company,
                c.location,
                c.linkedinUrl,
            ]);
            saved++;
        }
        catch {
            errors++;
        }
    }
    return {
        saved,
        skipped,
        errors,
        note: `Saved ${saved} leads to tenant "${businessSlug}". ${errors > 0 ? `${errors} errors.` : ''}`,
    };
}
//# sourceMappingURL=saveLeads.js.map
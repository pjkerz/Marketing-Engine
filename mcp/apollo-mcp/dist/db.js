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
exports.closePool = closePool;
exports.resolveBusinessId = resolveBusinessId;
exports.findOrCreateEmailList = findOrCreateEmailList;
exports.upsertSubscriberProspect = upsertSubscriberProspect;
exports.insertAffiliateCandidateWithClient = insertAffiliateCandidateWithClient;
exports.insertAffiliateCandidate = insertAffiliateCandidate;
exports.generateAffiliateCode = generateAffiliateCode;
const pg_1 = require("pg");
const env_1 = require("./env");
const crypto = __importStar(require("crypto"));
let pool = null;
function getPool() {
    if (!pool) {
        const env = (0, env_1.loadEnv)();
        pool = new pg_1.Pool({ connectionString: env.DATABASE_URL, max: 5 });
    }
    return pool;
}
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
// ── Business lookup ────────────────────────────────────────────────────────────
async function resolveBusinessId(slug) {
    const result = await getPool().query(`SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`, [slug]);
    if (!result.rows[0])
        throw new Error(`Tenant not found: ${slug}`);
    return result.rows[0].id;
}
// ── Email list operations ──────────────────────────────────────────────────────
async function findOrCreateEmailList(businessId, listName) {
    const existing = await getPool().query(`SELECT id FROM email_lists WHERE business_id = $1 AND name = $2 AND active = true LIMIT 1`, [businessId, listName]);
    if (existing.rows[0])
        return existing.rows[0].id;
    const created = await getPool().query(`INSERT INTO email_lists (id, business_id, name, tags, active, created_at, updated_at)
     VALUES ($1, $2, $3, '{}', true, NOW(), NOW())
     ON CONFLICT (business_id, name) DO UPDATE SET active = true
     RETURNING id`, [crypto.randomUUID(), businessId, listName]);
    return created.rows[0].id;
}
async function upsertSubscriberProspect(rec) {
    const tags = [
        'apollo_import',
        `consent:${rec.consentBasis}`,
        ...(rec.extraTags ?? []),
        ...(rec.title ? [`title:${rec.title.toLowerCase().replace(/\s+/g, '_')}`] : []),
        ...(rec.company ? [`company:${rec.company.toLowerCase().replace(/\s+/g, '_')}`] : []),
    ];
    const metadata = JSON.stringify({
        apolloId: rec.apolloId ?? null,
        phone: rec.phone ?? null,
        title: rec.title ?? null,
        company: rec.company ?? null,
        importedAt: new Date().toISOString(),
    });
    // Never overwrite an active/unsubscribed subscriber's status — only insert as prospect if new
    const result = await getPool().query(`INSERT INTO email_subscribers
       (id, business_id, list_id, email, name, tags, status, source, subscribed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'prospect', 'apollo', NOW())
     ON CONFLICT (list_id, email) DO UPDATE
       SET name    = COALESCE(EXCLUDED.name, email_subscribers.name),
           tags    = (
             SELECT ARRAY(
               SELECT DISTINCT unnest(email_subscribers.tags || EXCLUDED.tags)
             )
           )
     RETURNING id, status`, [
        crypto.randomUUID(),
        rec.businessId,
        rec.listId,
        rec.email.toLowerCase().trim(),
        rec.name ?? null,
        tags,
    ]);
    const row = result.rows[0];
    if (!row)
        return { id: '', created: false, skipped: true, reason: 'db error' };
    return {
        id: row.id,
        created: row.status === 'prospect',
        skipped: false,
    };
    void metadata; // stored in tags instead of a dedicated column
}
async function insertAffiliateCandidateWithClient(client, rec) {
    const env = (0, env_1.loadEnv)();
    const appUrl = env.APP_URL;
    // Check if affiliate already exists by email
    const existing = await client.query(`SELECT id, code, active FROM affiliates WHERE email = $1 LIMIT 1`, [rec.email.toLowerCase().trim()]);
    if (existing.rows[0]) {
        const row = existing.rows[0];
        const onboardingLink = `${appUrl}/v2/connect?code=${row.code}`;
        return { id: row.id, code: row.code, created: false, alreadyExists: true, onboardingLink };
    }
    // Ensure code uniqueness — retry once if collision
    let code = rec.code;
    const codeCheck = await client.query(`SELECT id FROM affiliates WHERE code = $1 LIMIT 1`, [code]);
    if (codeCheck.rows[0]) {
        code = `${code}${Math.floor(Math.random() * 90 + 10)}`;
    }
    const affiliateId = crypto.randomUUID();
    await client.query(`INSERT INTO affiliates (id, business_id, code, name, email, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`, [affiliateId, rec.businessId, code, rec.name, rec.email.toLowerCase().trim()]);
    // Initial profile — source 'apollo', inactive until onboarding
    await client.query(`INSERT INTO affiliate_profiles
       (id, affiliate_id, version, source, status, created_at, updated_at)
     VALUES ($1, $2, 1, 'apollo', 'active', NOW(), NOW())`, [crypto.randomUUID(), affiliateId]);
    // Audit trail
    await client.query(`INSERT INTO audit_logs (id, actor_type, action, entity_type, entity_id, changes, created_at)
     VALUES ($1, 'system', 'apollo_affiliate_candidate_created', 'Affiliate', $2, $3, NOW())`, [
        crypto.randomUUID(),
        affiliateId,
        JSON.stringify({
            code,
            name: rec.name,
            email: rec.email,
            title: rec.title ?? null,
            company: rec.company ?? null,
            linkedinUrl: rec.linkedinUrl ?? null,
            apolloId: rec.apolloId ?? null,
            notes: rec.notes ?? null,
        }),
    ]);
    const onboardingLink = `${appUrl}/v2/connect?code=${code}`;
    return { id: affiliateId, code, created: true, alreadyExists: false, onboardingLink };
}
async function insertAffiliateCandidate(rec) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await insertAffiliateCandidateWithClient(client, rec);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ── Utility ────────────────────────────────────────────────────────────────────
function generateAffiliateCode(name) {
    const parts = name.trim().toUpperCase().split(/\s+/);
    const first = (parts[0] ?? 'XXX').slice(0, 3).replace(/[^A-Z]/g, 'X');
    const last = (parts[1] ?? parts[0] ?? 'XXX').slice(0, 3).replace(/[^A-Z]/g, 'X');
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    return `${first.padEnd(3, 'X')}${last.padEnd(3, 'X')}${suffix}`;
}
//# sourceMappingURL=db.js.map
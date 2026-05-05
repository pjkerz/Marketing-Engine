"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPeople = searchPeople;
exports.enrichPerson = enrichPerson;
const https_1 = __importDefault(require("https"));
const env_1 = require("./env");
const APOLLO_HOST = 'api.apollo.io';
const APOLLO_BASE = '/api/v1';
// ── HTTP helper ────────────────────────────────────────────────────────────────
function apolloPost(path, body) {
    const env = (0, env_1.loadEnv)();
    const bodyStr = JSON.stringify({ ...body, api_key: env.APOLLO_API_KEY });
    return new Promise((resolve, reject) => {
        const req = https_1.default.request({
            hostname: APOLLO_HOST,
            path: `${APOLLO_BASE}${path}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Content-Length': Buffer.byteLength(bodyStr),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                if (res.statusCode === 429) {
                    reject(new Error('Apollo rate limit hit — wait 60 seconds before retrying'));
                    return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`Apollo API ${res.statusCode}: ${data.slice(0, 300)}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`Apollo returned non-JSON: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}
// ── Public API ─────────────────────────────────────────────────────────────────
async function searchPeople(filters) {
    const body = {
        page: filters.page ?? 1,
        per_page: filters.perPage ?? 25,
    };
    if (filters.titles?.length)
        body['person_titles'] = filters.titles;
    if (filters.locations?.length)
        body['person_locations'] = filters.locations;
    if (filters.seniorities?.length)
        body['person_seniorities'] = filters.seniorities;
    if (filters.industries?.length)
        body['q_organization_keyword_tags'] = filters.industries;
    // email_status filter: only return contacts where email is obtainable
    if (filters.emailRequired) {
        body['contact_email_status'] = ['verified', 'guessed'];
    }
    // Open-to-work signal: Apollo doesn't expose LinkedIn's badge directly.
    // Best proxy: filter for people who changed jobs recently (employment signals).
    // We mark these in the result metadata rather than filtering out at API level.
    if (filters.openToWork) {
        // Use person_changed_job_recently signal if available in the plan
        body['person_changed_job_recently'] = true;
    }
    return apolloPost('/mixed_people/search', body);
}
async function enrichPerson(params) {
    const body = {
        reveal_personal_emails: false,
        reveal_phone_number: true,
    };
    if (params.personId)
        body['id'] = params.personId;
    if (params.email)
        body['email'] = params.email;
    if (params.linkedinUrl)
        body['linkedin_url'] = params.linkedinUrl;
    if (params.name)
        body['name'] = params.name;
    if (params.organizationName)
        body['organization_name'] = params.organizationName;
    return apolloPost('/people/match', body);
}
//# sourceMappingURL=apolloClient.js.map
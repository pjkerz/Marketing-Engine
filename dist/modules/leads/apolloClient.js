"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchOpenToWork = searchOpenToWork;
exports.extractPhone = extractPhone;
const logger_1 = require("../../lib/logger");
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
async function searchOpenToWork(params) {
    const { titles, page, perPage = 100, apiKey } = params;
    const body = {
        person_titles: titles,
        // USA only
        person_locations: ['United States'],
        // Open to work / actively looking filter
        currently_in_market: true,
        person_seniority: [],
        per_page: perPage,
        page,
    };
    const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        logger_1.logger.error({ module: 'apolloClient', status: res.status, body: text }, 'Apollo API error');
        throw new Error(`Apollo API ${res.status}: ${text}`);
    }
    return res.json();
}
function extractPhone(person) {
    const mobile = person.phone_numbers?.find(p => p.type === 'mobile');
    const direct = person.phone_numbers?.find(p => p.type === 'direct');
    const any = person.phone_numbers?.[0];
    return mobile?.raw_number ?? direct?.raw_number ?? any?.raw_number ?? null;
}
//# sourceMappingURL=apolloClient.js.map
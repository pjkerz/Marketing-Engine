"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichContact = enrichContact;
const apolloClient_1 = require("../apolloClient");
function summarise(p) {
    const phone = p.phone_numbers?.find(ph => ph.type === 'mobile' || ph.type === 'work');
    const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
    return {
        apolloId: p.id,
        name: p.name,
        title: p.title,
        email: p.email,
        emailStatus: p.email_status,
        phone: phone?.sanitized_number ?? null,
        location: loc || null,
        company: p.organization?.name ?? null,
        industry: p.organization?.industry ?? null,
        linkedinUrl: p.linkedin_url,
        seniority: p.seniority,
    };
}
async function enrichContact(input) {
    if (!input.personId && !input.email && !input.linkedinUrl) {
        return { found: false, person: null, note: 'Provide at least one of: personId, email, or linkedinUrl.' };
    }
    const params = {
        personId: input.personId,
        email: input.email,
        linkedinUrl: input.linkedinUrl,
        name: input.name,
        organizationName: input.organizationName,
    };
    const res = await (0, apolloClient_1.enrichPerson)(params);
    if (!res.person) {
        return { found: false, person: null, note: 'No match found in Apollo database.' };
    }
    const person = summarise(res.person);
    const notes = [];
    if (!person.email)
        notes.push('No email found — try with a verified LinkedIn URL.');
    if (!person.phone)
        notes.push('No phone found.');
    return {
        found: true,
        person,
        note: notes.length ? notes.join(' ') : 'Contact enriched successfully.',
    };
}
//# sourceMappingURL=enrichContact.js.map
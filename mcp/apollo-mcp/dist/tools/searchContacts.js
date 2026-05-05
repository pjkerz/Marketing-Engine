"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchContacts = searchContacts;
const apolloClient_1 = require("../apolloClient");
function summarisePerson(p) {
    const city = p.city ?? '';
    const state = p.state ?? '';
    const country = p.country ?? '';
    const locationParts = [city, state, country].filter(Boolean);
    const primaryPhone = p.phone_numbers.find(ph => ph.type === 'mobile' || ph.type === 'work');
    // Open-to-work signal: Apollo's changed_job_recently or intent signals
    const openToWorkSignal = p.show_intent && (p.intent_strength === 'strong' || p.intent_strength === 'very_strong');
    return {
        apolloId: p.id,
        name: p.name,
        title: p.title,
        email: p.email,
        emailStatus: p.email_status,
        phone: primaryPhone?.sanitized_number ?? null,
        location: locationParts.join(', ') || null,
        company: p.organization?.name ?? null,
        industry: p.organization?.industry ?? null,
        linkedinUrl: p.linkedin_url,
        seniority: p.seniority,
        departments: p.departments ?? [],
        openToWorkSignal,
    };
}
async function searchContacts(input) {
    const filters = {
        titles: input.titles,
        locations: input.locations,
        industries: input.industries,
        seniorities: input.seniorities,
        openToWork: input.openToWork,
        emailRequired: input.emailRequired,
        page: input.page ?? 1,
        perPage: input.perPage ?? 25,
    };
    const response = await (0, apolloClient_1.searchPeople)(filters);
    const contacts = response.people.map(summarisePerson);
    const withEmail = contacts.filter(c => c.email).length;
    const withPhone = contacts.filter(c => c.phone).length;
    const openToWorkHits = contacts.filter(c => c.openToWorkSignal).length;
    return {
        contacts,
        pagination: {
            page: response.pagination.page,
            perPage: response.pagination.per_page,
            totalEntries: response.pagination.total_entries,
            totalPages: response.pagination.total_pages,
        },
        filters: input,
        note: [
            `Found ${contacts.length} contacts (${withEmail} with email, ${withPhone} with phone).`,
            openToWorkHits > 0 ? `${openToWorkHits} show open-to-work signals.` : '',
            !input.emailRequired && withEmail < contacts.length
                ? `Use apollo_enrich_contact on specific people to reveal additional emails (costs Apollo credits).`
                : '',
        ].filter(Boolean).join(' '),
    };
}
//# sourceMappingURL=searchContacts.js.map
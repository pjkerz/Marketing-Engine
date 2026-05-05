"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const searchContacts_1 = require("./tools/searchContacts");
const enrichContact_1 = require("./tools/enrichContact");
const saveLeads_1 = require("./tools/saveLeads");
const leadStatus_1 = require("./tools/leadStatus");
const server = new index_js_1.Server({ name: 'apollo-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
// ── Tool definitions ───────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: 'apollo_search_contacts',
        description: 'Search Apollo.io for open-to-work professionals in the USA. Returns contacts with email, phone, title, company, and LinkedIn URL. Use this to find job seekers by role.',
        inputSchema: {
            type: 'object',
            properties: {
                titles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Job titles to search for. e.g. ["Business Analyst", "Software Developer"]',
                },
                locations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Locations to filter by. Defaults to ["United States"]',
                },
                openToWork: {
                    type: 'boolean',
                    description: 'Filter for people showing open-to-work signals. Default true.',
                },
                emailRequired: {
                    type: 'boolean',
                    description: 'Only return contacts with a known email address.',
                },
                page: { type: 'number', description: 'Page number. Default 1.' },
                perPage: { type: 'number', description: 'Results per page. Max 100. Default 25.' },
            },
        },
    },
    {
        name: 'apollo_enrich_contact',
        description: 'Enrich a single contact by LinkedIn URL, email, or Apollo ID. Returns full contact details including phone and verified email. Costs Apollo credits.',
        inputSchema: {
            type: 'object',
            properties: {
                personId: { type: 'string', description: 'Apollo person ID' },
                email: { type: 'string', description: 'Email address to look up' },
                linkedinUrl: { type: 'string', description: 'LinkedIn profile URL' },
                name: { type: 'string', description: 'Full name (helps match accuracy)' },
                organizationName: { type: 'string', description: 'Company name (helps match accuracy)' },
            },
        },
    },
    {
        name: 'apollo_save_leads',
        description: 'Save a list of Apollo contacts into the leads database for a given tenant. Deduplicates by apolloId.',
        inputSchema: {
            type: 'object',
            required: ['businessSlug', 'contacts'],
            properties: {
                businessSlug: {
                    type: 'string',
                    description: 'Tenant slug e.g. "alphaboost", "dolce", "alphanoetic"',
                },
                contacts: {
                    type: 'array',
                    description: 'Array of contact summaries from apollo_search_contacts',
                    items: { type: 'object' },
                },
            },
        },
    },
    {
        name: 'apollo_lead_status',
        description: 'Check the status of lead pull jobs and total leads in the database for a tenant.',
        inputSchema: {
            type: 'object',
            required: ['businessSlug'],
            properties: {
                businessSlug: {
                    type: 'string',
                    description: 'Tenant slug e.g. "alphaboost"',
                },
                jobId: {
                    type: 'string',
                    description: 'Optional: check a specific pull job by ID',
                },
            },
        },
    },
];
// ── Handlers ───────────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        let result;
        switch (name) {
            case 'apollo_search_contacts':
                result = await (0, searchContacts_1.searchContacts)(args);
                break;
            case 'apollo_enrich_contact':
                result = await (0, enrichContact_1.enrichContact)(args);
                break;
            case 'apollo_save_leads':
                result = await (0, saveLeads_1.saveLeads)(args);
                break;
            case 'apollo_lead_status':
                result = await (0, leadStatus_1.getLeadStatus)(args);
                break;
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            isError: true,
        };
    }
});
// ── Start ──────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('Apollo MCP server running\n');
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
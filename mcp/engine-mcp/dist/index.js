"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const affiliates_1 = require("./tools/affiliates");
const email_1 = require("./tools/email");
const dashboard_1 = require("./tools/dashboard");
const content_1 = require("./tools/content");
const seo_1 = require("./tools/seo");
const intelligence_1 = require("./tools/intelligence");
const llmPresence_1 = require("./tools/llmPresence");
const tenants_1 = require("./tools/tenants");
const server = new index_js_1.Server({ name: 'engine-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
// ── Tool registry ──────────────────────────────────────────────────────────────
const TOOLS = [
    // ── Dashboard
    {
        name: 'engine_dashboard',
        description: 'Get a full performance dashboard snapshot for a tenant — funnel metrics, top affiliates, recent campaigns, lead count.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string', description: 'Tenant slug: alphaboost | dolce | alphanoetic' },
                days: { type: 'number', description: 'Lookback window in days. Default 30.' },
            } },
    },
    {
        name: 'engine_funnel',
        description: 'Get funnel breakdown by stage and channel for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                days: { type: 'number' },
            } },
    },
    // ── Affiliates
    {
        name: 'engine_affiliates',
        description: 'List all affiliates for a tenant with click and conversion counts.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                activeOnly: { type: 'boolean', description: 'Only return active affiliates. Default true.' },
            } },
    },
    {
        name: 'engine_affiliate_leaderboard',
        description: 'Get affiliate leaderboard ranked by conversions for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                days: { type: 'number', description: 'Lookback window. Default 30.' },
            } },
    },
    {
        name: 'engine_commissions',
        description: 'Get commission records for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                status: { type: 'string', description: 'Filter by status: pending | paid | rejected' },
            } },
    },
    // ── Email
    {
        name: 'engine_email_lists',
        description: 'Get all email lists and subscriber counts for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    {
        name: 'engine_campaigns',
        description: 'Get email campaigns with open rates and click rates for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                status: { type: 'string', description: 'Filter: draft | scheduled | sent | failed' },
            } },
    },
    {
        name: 'engine_email_health',
        description: 'Check email sending health — warmup status, bounce rate, daily send cap for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    {
        name: 'engine_drip_sequences',
        description: 'Get drip email sequences and enrollment counts for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    // ── Content
    {
        name: 'engine_content_runs',
        description: 'Get content generation runs with approval status for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                status: { type: 'string', description: 'Filter: pending | generating | scored | approved | dispatched' },
            } },
    },
    {
        name: 'engine_pending_content',
        description: 'Get content pieces awaiting human approval for a tenant, ranked by score.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    {
        name: 'engine_content_performance',
        description: 'Get content performance by platform — clicks, pieces published, average score.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                days: { type: 'number' },
            } },
    },
    // ── SEO
    {
        name: 'engine_seo_audits',
        description: 'Get SEO audits with scores and issue counts for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                limit: { type: 'number', description: 'Max results. Default 10.' },
            } },
    },
    {
        name: 'engine_seo_gaps',
        description: 'Get keyword gap opportunities ranked by opportunity score for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    {
        name: 'engine_seo_content',
        description: 'Get SEO content pieces and their publication status for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                status: { type: 'string', description: 'Filter by status' },
            } },
    },
    // ── Intelligence
    {
        name: 'engine_recommendations',
        description: 'Get AI optimisation recommendations ranked by impact for a tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                status: { type: 'string', description: 'Filter: new | applied | dismissed. Default: new.' },
            } },
    },
    {
        name: 'engine_intelligence_feed',
        description: 'Get the intelligence feed events for a tenant (cross-channel insights).',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                unreadOnly: { type: 'boolean', description: 'Only unread items. Default true.' },
            } },
    },
    {
        name: 'engine_system_health',
        description: 'Check system health — worker errors, pending jobs, recent conversions.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    // ── LLM Presence & Keywords
    {
        name: 'engine_llm_presence',
        description: 'Get LLM presence audit results — how often the brand is mentioned by ChatGPT, Claude, Gemini, Perplexity.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
                limit: { type: 'number' },
            } },
    },
    {
        name: 'engine_keyword_intelligence',
        description: 'Get paid keyword intelligence data — CPCs, competition, search volumes.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    // ── Tenants
    {
        name: 'engine_list_tenants',
        description: 'List all configured tenants with their plan, domain, and config status.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'engine_tenant_config',
        description: 'Get full configuration for a specific tenant.',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
    {
        name: 'engine_team_users',
        description: 'List team login users for a tenant (usernames and emails only — no passwords).',
        inputSchema: { type: 'object', required: ['businessSlug'], properties: {
                businessSlug: { type: 'string' },
            } },
    },
];
// ── Dispatch ───────────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {});
    try {
        let result;
        switch (name) {
            // Dashboard
            case 'engine_dashboard':
                result = await (0, dashboard_1.getDashboardSnapshot)(a);
                break;
            case 'engine_funnel':
                result = await (0, dashboard_1.getFunnelBreakdown)(a);
                break;
            // Affiliates
            case 'engine_affiliates':
                result = await (0, affiliates_1.getAffiliates)(a);
                break;
            case 'engine_affiliate_leaderboard':
                result = await (0, affiliates_1.getAffiliateLeaderboard)(a);
                break;
            case 'engine_commissions':
                result = await (0, affiliates_1.getCommissions)(a);
                break;
            // Email
            case 'engine_email_lists':
                result = await (0, email_1.getEmailLists)(a);
                break;
            case 'engine_campaigns':
                result = await (0, email_1.getCampaigns)(a);
                break;
            case 'engine_email_health':
                result = await (0, email_1.getEmailHealth)(a);
                break;
            case 'engine_drip_sequences':
                result = await (0, email_1.getDripSequences)(a);
                break;
            // Content
            case 'engine_content_runs':
                result = await (0, content_1.getContentRuns)(a);
                break;
            case 'engine_pending_content':
                result = await (0, content_1.getPendingContent)(a);
                break;
            case 'engine_content_performance':
                result = await (0, content_1.getContentPerformance)(a);
                break;
            // SEO
            case 'engine_seo_audits':
                result = await (0, seo_1.getSeoAudits)(a);
                break;
            case 'engine_seo_gaps':
                result = await (0, seo_1.getSeoKeywordGaps)(a);
                break;
            case 'engine_seo_content':
                result = await (0, seo_1.getSeoContent)(a);
                break;
            // Intelligence
            case 'engine_recommendations':
                result = await (0, intelligence_1.getRecommendations)(a);
                break;
            case 'engine_intelligence_feed':
                result = await (0, intelligence_1.getIntelligenceFeed)(a);
                break;
            case 'engine_system_health':
                result = await (0, intelligence_1.getSystemHealth)(a);
                break;
            // LLM & Keywords
            case 'engine_llm_presence':
                result = await (0, llmPresence_1.getLlmAudits)(a);
                break;
            case 'engine_keyword_intelligence':
                result = await (0, llmPresence_1.getKeywordIntelligence)(a);
                break;
            // Tenants
            case 'engine_list_tenants':
                result = await (0, tenants_1.listTenants)();
                break;
            case 'engine_tenant_config':
                result = await (0, tenants_1.getTenantConfig)(a);
                break;
            case 'engine_team_users':
                result = await (0, tenants_1.getTeamUsers)(a);
                break;
            default:
                return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
});
// ── Start ──────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('Engine MCP server running — 23 tools across 8 modules\n');
}
main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
//# sourceMappingURL=index.js.map
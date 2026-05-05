import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';

import { getAffiliates, getAffiliateLeaderboard, getCommissions } from './tools/affiliates';
import { getEmailLists, getCampaigns, getEmailHealth, getDripSequences } from './tools/email';
import { getDashboardSnapshot, getFunnelBreakdown } from './tools/dashboard';
import { getContentRuns, getPendingContent, getContentPerformance } from './tools/content';
import { getSeoAudits, getSeoKeywordGaps, getSeoContent } from './tools/seo';
import { getRecommendations, getIntelligenceFeed, getSystemHealth } from './tools/intelligence';
import { getLlmAudits, getKeywordIntelligence } from './tools/llmPresence';
import { listTenants, getTenantConfig, getTeamUsers } from './tools/tenants';

const server = new Server(
  { name: 'engine-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ── Tool registry ──────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // ── Dashboard
  {
    name: 'engine_dashboard',
    description: 'Get a full performance dashboard snapshot for a tenant — funnel metrics, top affiliates, recent campaigns, lead count.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string', description: 'Tenant slug: alphaboost | dolce | alphanoetic' },
      days: { type: 'number', description: 'Lookback window in days. Default 30.' },
    }},
  },
  {
    name: 'engine_funnel',
    description: 'Get funnel breakdown by stage and channel for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      days: { type: 'number' },
    }},
  },
  // ── Affiliates
  {
    name: 'engine_affiliates',
    description: 'List all affiliates for a tenant with click and conversion counts.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      activeOnly: { type: 'boolean', description: 'Only return active affiliates. Default true.' },
    }},
  },
  {
    name: 'engine_affiliate_leaderboard',
    description: 'Get affiliate leaderboard ranked by conversions for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      days: { type: 'number', description: 'Lookback window. Default 30.' },
    }},
  },
  {
    name: 'engine_commissions',
    description: 'Get commission records for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      status: { type: 'string', description: 'Filter by status: pending | paid | rejected' },
    }},
  },
  // ── Email
  {
    name: 'engine_email_lists',
    description: 'Get all email lists and subscriber counts for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  {
    name: 'engine_campaigns',
    description: 'Get email campaigns with open rates and click rates for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      status: { type: 'string', description: 'Filter: draft | scheduled | sent | failed' },
    }},
  },
  {
    name: 'engine_email_health',
    description: 'Check email sending health — warmup status, bounce rate, daily send cap for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  {
    name: 'engine_drip_sequences',
    description: 'Get drip email sequences and enrollment counts for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  // ── Content
  {
    name: 'engine_content_runs',
    description: 'Get content generation runs with approval status for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      status: { type: 'string', description: 'Filter: pending | generating | scored | approved | dispatched' },
    }},
  },
  {
    name: 'engine_pending_content',
    description: 'Get content pieces awaiting human approval for a tenant, ranked by score.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  {
    name: 'engine_content_performance',
    description: 'Get content performance by platform — clicks, pieces published, average score.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      days: { type: 'number' },
    }},
  },
  // ── SEO
  {
    name: 'engine_seo_audits',
    description: 'Get SEO audits with scores and issue counts for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      limit: { type: 'number', description: 'Max results. Default 10.' },
    }},
  },
  {
    name: 'engine_seo_gaps',
    description: 'Get keyword gap opportunities ranked by opportunity score for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  {
    name: 'engine_seo_content',
    description: 'Get SEO content pieces and their publication status for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      status: { type: 'string', description: 'Filter by status' },
    }},
  },
  // ── Intelligence
  {
    name: 'engine_recommendations',
    description: 'Get AI optimisation recommendations ranked by impact for a tenant.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      status: { type: 'string', description: 'Filter: new | applied | dismissed. Default: new.' },
    }},
  },
  {
    name: 'engine_intelligence_feed',
    description: 'Get the intelligence feed events for a tenant (cross-channel insights).',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      unreadOnly: { type: 'boolean', description: 'Only unread items. Default true.' },
    }},
  },
  {
    name: 'engine_system_health',
    description: 'Check system health — worker errors, pending jobs, recent conversions.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
  // ── LLM Presence & Keywords
  {
    name: 'engine_llm_presence',
    description: 'Get LLM presence audit results — how often the brand is mentioned by ChatGPT, Claude, Gemini, Perplexity.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
      limit: { type: 'number' },
    }},
  },
  {
    name: 'engine_keyword_intelligence',
    description: 'Get paid keyword intelligence data — CPCs, competition, search volumes.',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
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
    }},
  },
  {
    name: 'engine_team_users',
    description: 'List team login users for a tenant (usernames and emails only — no passwords).',
    inputSchema: { type: 'object', required: ['businessSlug'], properties: {
      businessSlug: { type: 'string' },
    }},
  },
];

// ── Dispatch ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    let result: unknown;
    switch (name) {
      // Dashboard
      case 'engine_dashboard':         result = await getDashboardSnapshot(a as Parameters<typeof getDashboardSnapshot>[0]); break;
      case 'engine_funnel':            result = await getFunnelBreakdown(a as Parameters<typeof getFunnelBreakdown>[0]); break;
      // Affiliates
      case 'engine_affiliates':        result = await getAffiliates(a as Parameters<typeof getAffiliates>[0]); break;
      case 'engine_affiliate_leaderboard': result = await getAffiliateLeaderboard(a as Parameters<typeof getAffiliateLeaderboard>[0]); break;
      case 'engine_commissions':       result = await getCommissions(a as Parameters<typeof getCommissions>[0]); break;
      // Email
      case 'engine_email_lists':       result = await getEmailLists(a as Parameters<typeof getEmailLists>[0]); break;
      case 'engine_campaigns':         result = await getCampaigns(a as Parameters<typeof getCampaigns>[0]); break;
      case 'engine_email_health':      result = await getEmailHealth(a as Parameters<typeof getEmailHealth>[0]); break;
      case 'engine_drip_sequences':    result = await getDripSequences(a as Parameters<typeof getDripSequences>[0]); break;
      // Content
      case 'engine_content_runs':      result = await getContentRuns(a as Parameters<typeof getContentRuns>[0]); break;
      case 'engine_pending_content':   result = await getPendingContent(a as Parameters<typeof getPendingContent>[0]); break;
      case 'engine_content_performance': result = await getContentPerformance(a as Parameters<typeof getContentPerformance>[0]); break;
      // SEO
      case 'engine_seo_audits':        result = await getSeoAudits(a as Parameters<typeof getSeoAudits>[0]); break;
      case 'engine_seo_gaps':          result = await getSeoKeywordGaps(a as Parameters<typeof getSeoKeywordGaps>[0]); break;
      case 'engine_seo_content':       result = await getSeoContent(a as Parameters<typeof getSeoContent>[0]); break;
      // Intelligence
      case 'engine_recommendations':   result = await getRecommendations(a as Parameters<typeof getRecommendations>[0]); break;
      case 'engine_intelligence_feed': result = await getIntelligenceFeed(a as Parameters<typeof getIntelligenceFeed>[0]); break;
      case 'engine_system_health':     result = await getSystemHealth(a as Parameters<typeof getSystemHealth>[0]); break;
      // LLM & Keywords
      case 'engine_llm_presence':      result = await getLlmAudits(a as Parameters<typeof getLlmAudits>[0]); break;
      case 'engine_keyword_intelligence': result = await getKeywordIntelligence(a as Parameters<typeof getKeywordIntelligence>[0]); break;
      // Tenants
      case 'engine_list_tenants':      result = await listTenants(); break;
      case 'engine_tenant_config':     result = await getTenantConfig(a as Parameters<typeof getTenantConfig>[0]); break;
      case 'engine_team_users':        result = await getTeamUsers(a as Parameters<typeof getTeamUsers>[0]); break;
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Engine MCP server running — 23 tools across 8 modules\n');
}

main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });

/**
 * aiArchitek as an MCP server: the NATA and B.Arch tools, callable from
 * ChatGPT (connectors / apps), Claude and any other assistant that speaks the
 * Model Context Protocol. Students who ask a chatbot get our numbers, from the
 * official allotment lists, and a link back to aiArchitek in every answer.
 *
 * Read-only and AI-free: each tool runs the same code as Aintra (Tools app)
 * (lib/ask/tools.ts) on day-cached public data, so a call costs no Gemini spend
 * and touches no personal data. Stateless JSON-RPC over Streamable HTTP; the
 * route (app/api/mcp/route.ts) handles transport, rate limits and logging.
 */
import { BOARD_CONFIG } from '@neram/tools-core/cutoff';
import { cardSummary, type AskCard } from '@/lib/ask/cards';
import { ASK_TOOL_DECLARATIONS, runAskTool, type AskToolDeps } from '@/lib/ask/tools';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const MCP_SERVER_INFO = { name: 'aiarchitek', title: 'aiArchitek: NATA and B.Arch tools', version: '1.0.0' };
export const SITE = 'https://app.neramclasses.com';

/** Colleges per safe/target/reach group in a connector answer; the full list is a link away. */
export const MCP_PER_TIER = 3;

export const MCP_INSTRUCTIONS =
  'Tools from aiArchitek by Neram Classes for students in India preparing for NATA and B.Arch admission. ' +
  'Use them for the NATA cutoff out of 400, which B.Arch colleges a score or rank got last year (TNEA, KEAM, JoSAA), ' +
  'counselling rank, NATA test cities, Council of Architecture approval, NATA cost, eligibility and exam dates. ' +
  'Numbers come from the official allotment lists and each board’s real maximum marks; do not replace them with estimates. ' +
  'Every result includes a link to the full result on aiArchitek: always show it to the student.';

/** The connector's tools: the Ask tools minus the chat-only ones, with names an assistant can pick by. */
const EXPOSED: Array<{ name: string; tool: string; title: string; description?: string }> = [
  { name: 'nata_cutoff_calculator', tool: 'calculate_cutoff', title: 'NATA cutoff calculator' },
  { name: 'barch_college_predictor', tool: 'predict_colleges', title: 'B.Arch college predictor' },
  { name: 'barch_rank_predictor', tool: 'predict_rank', title: 'TNEA and KEAM B.Arch rank predictor' },
  { name: 'nata_exam_centres', tool: 'find_exam_centres', title: 'NATA test cities near a city' },
  { name: 'coa_approval_check', tool: 'check_coa_approval', title: 'Council of Architecture approval check' },
  { name: 'nata_cost_estimate', tool: 'estimate_cost', title: 'NATA cost estimate' },
  { name: 'nata_eligibility_check', tool: 'check_eligibility', title: 'NATA and B.Arch eligibility check' },
  { name: 'nata_exam_dates', tool: 'exam_dates', title: 'NATA exam dates' },
];

const BY_NAME = new Map(EXPOSED.map((e) => [e.name, e]));

export function mcpTools() {
  return EXPOSED.map((e) => {
    const decl = ASK_TOOL_DECLARATIONS.find((d) => d.name === e.tool)!;
    // The chat's wording mentions "remembered details"; a connector has no memory.
    const description = (e.description ?? decl.description).replace(/ Leave out anything[^.]*\./, '').replace(/ Call calculate_cutoff first[^.]*\./, ' Work out the cutoff with nata_cutoff_calculator first if it is not known.');
    return {
      name: e.name,
      title: e.title,
      description: `${description} From aiArchitek by Neram Classes; the result includes a link to show the student.`,
      inputSchema: { ...(decl.parameters as Record<string, unknown>), additionalProperties: false },
      annotations: { title: e.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    };
  });
}

/** Where the student continues, tagged so the visit shows as assistant traffic. */
export function trackedUrl(href: string): string {
  const url = new URL(href, SITE);
  url.searchParams.set('utm_source', 'ai-assistant');
  url.searchParams.set('utm_medium', 'mcp');
  return url.toString();
}

/** The text an assistant reads and repeats: the facts, the source, the link. */
export function resultText(card: AskCard | undefined, result: Record<string, unknown>): string {
  if (!card) return JSON.stringify(result);
  const lines = [cardSummary(card)];
  if (card.kind === 'colleges') {
    const d = card.data;
    for (const tier of ['safe', 'target', 'reach'] as const) {
      if (!d.groups[tier].length) continue;
      const shown = d.groups[tier].map((r) => `${r.name}${r.city ? ` (${r.city})` : ''}: ${d.basis === 'mark' ? `closing ${r.closing}` : `closing rank ${r.closing}`}`);
      const more = d.counts[tier] - d.groups[tier].length;
      lines.push(`${tier[0].toUpperCase()}${tier.slice(1)}: ${shown.join('; ')}${more > 0 ? ` (+${more} more)` : ''}`);
    }
    lines.push(`Source: ${d.source}.`);
  }
  if (card.kind === 'cutoff') lines.push(`Board: ${card.data.boardLabel}, ${card.data.marks}/${card.data.boardMax}. ${card.data.boardEligible ? 'Meets' : 'Below'} the 45% rule.`);
  lines.push(`Full result on aiArchitek: ${trackedUrl(card.href)}`);
  return lines.join('\n');
}

type Json = Record<string, unknown>;
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Json;
}

const ok = (id: JsonRpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0' as const, id: id ?? null, result });
const fail = (id: JsonRpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } });

/**
 * One JSON-RPC message. Returns the response, or null for a notification
 * (no id), which gets no reply.
 */
export async function handleMcpMessage(
  msg: JsonRpcRequest,
  deps: AskToolDeps,
  onCall?: (name: string, args: Json, okay: boolean) => void
): Promise<ReturnType<typeof ok> | ReturnType<typeof fail> | null> {
  const isNotification = msg.id === undefined;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid request');

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? (msg.params.protocolVersion as string) : '';
      const version = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return ok(msg.id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, { tools: mcpTools() });
    case 'tools/call': {
      const name = typeof msg.params?.name === 'string' ? (msg.params.name as string) : '';
      const entry = BY_NAME.get(name);
      if (!entry) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? (msg.params.arguments as Json) : {};
      const outcome = await runAskTool(entry.tool, args, { guest: false, facts: {}, perTier: MCP_PER_TIER }, deps);
      onCall?.(name, args, outcome.ok);
      if (!outcome.ok) {
        const askFor = Array.isArray(outcome.result.ask_for) ? ` Ask the student for: ${(outcome.result.ask_for as string[]).join(', ')}.` : '';
        return ok(msg.id, {
          content: [{ type: 'text', text: `No result: ${String(outcome.result.error ?? 'error')}.${askFor}` }],
          structuredContent: outcome.result,
          isError: true,
        });
      }
      return ok(msg.id, {
        content: [{ type: 'text', text: resultText(outcome.card, outcome.result) }],
        structuredContent: { ...outcome.result, ...(outcome.card ? { url: trackedUrl(outcome.card.href), card: outcome.card } : {}) },
      });
    }
    default:
      if (isNotification) return null;
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** For the connect page: the boards the cutoff tool knows, in plain words. */
export const MCP_BOARDS = Object.values(BOARD_CONFIG).map((b) => b.label);

// JSON-RPC answers are per call and must never be cached.
export const dynamic = 'force-dynamic';

/**
 * The aiArchitek MCP server (Model Context Protocol, Streamable HTTP,
 * stateless). Add https://app.neramclasses.com/api/mcp as a connector in
 * ChatGPT, Claude or any MCP client; see /connect for the steps.
 *
 *   POST  one JSON-RPC message or a batch; notifications get 202
 *   GET   405: this server never opens a server-to-client stream
 *
 * Logic lives in lib/mcp/server.ts. Here: transport, CORS (browser-based MCP
 * inspectors call it directly), a per-IP limit, and a usage row per tool call
 * in tool_usage_logs (tool_name mcp_<name>) so Admin can see connector traffic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logToolUsage } from '@neram/database';
import { ipFromHeaders, hashClientKey } from '@neram/ai';
import { defaultAskToolDeps } from '@/lib/ask/tools';
import { handleMcpMessage, MCP_PROTOCOL_VERSIONS, type JsonRpcRequest } from '@/lib/mcp/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

/**
 * Calls per IP per window, per server instance. A soft guard against a script
 * hammering the endpoint: the tools read day-cached data, so a burst costs
 * function time, not database reads or AI spend.
 */
const LIMIT = 120;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

function overLimit(key: string, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...extra } });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Use POST. This server does not open an event stream.' } }, 405, { Allow: 'POST, OPTIONS' });
}

export async function POST(request: NextRequest) {
  const ip = ipFromHeaders(request.headers);
  const key = hashClientKey(ip) ?? 'unknown';
  if (overLimit(key)) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32029, message: 'Too many requests. Please try again in a few minutes.' } }, 429, { 'Retry-After': '600' });
  }

  const raw = await request.text();
  if (raw.length > 64_000) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  const messages = (Array.isArray(payload) ? payload : [payload]).slice(0, 20) as JsonRpcRequest[];
  const deps = await defaultAskToolDeps();
  const calls: Array<{ name: string; args: Record<string, unknown>; ok: boolean }> = [];
  const responses = [];
  for (const msg of messages) {
    const res = await handleMcpMessage(msg, deps, (name, args, ok) => calls.push({ name, args, ok }));
    if (res) responses.push(res);
  }

  // Usage rows, one per tool call. Best effort: a logging failure never fails the call.
  await Promise.all(
    calls.map((c) =>
      logToolUsage({
        toolName: `mcp_${c.name}`,
        sessionId: key,
        inputData: c.args,
        resultData: { ok: c.ok },
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(() => null)
    )
  );

  const version = request.headers.get('mcp-protocol-version');
  const headers: Record<string, string> = version && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(version) ? { 'Mcp-Protocol-Version': version } : {};
  // Only notifications: accepted, nothing to say.
  if (responses.length === 0) return new NextResponse(null, { status: 202, headers: CORS });
  return json(Array.isArray(payload) ? responses : responses[0], 200, headers);
}

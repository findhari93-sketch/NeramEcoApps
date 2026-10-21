/**
 * Tools App: the aiArchitek MCP server (/api/mcp) and its setup page (/connect).
 *
 *   AC1: initialize negotiates the protocol and names the server
 *   AC2: tools/list offers only read-only tools
 *   AC3: tools/call answers a cutoff with numbers and a tracked link back
 *   AC4: notifications get 202, GET gets 405, CORS preflight works
 *   AC5: /connect shows the URL to paste and the steps, server-rendered
 *
 * Request-only except AC5; no AI is called (the tools are pure or day-cached).
 * Run: pnpm test:e2e tests/e2e/app-mcp-connector.spec.ts --project=app-chrome --no-deps
 */
import { test, expect } from '@playwright/test';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';
const MCP = `${APP_URL}/api/mcp`;

test.use({ storageState: { cookies: [], origins: [] } });

const rpc = (method: string, params?: unknown) => ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });
/** A notification has no id, so the server owes no reply. */
const notification = (method: string) => ({ jsonrpc: '2.0', method });

test.describe('aiArchitek MCP connector', () => {
  test('AC1: initialize', async ({ request }) => {
    const res = await request.post(MCP, { data: rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } }) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.serverInfo.name).toBe('aiarchitek');
    expect(body.result.instructions).toContain('always show it to the student');
  });

  test('AC2: only read-only tools', async ({ request }) => {
    const body = await (await request.post(MCP, { data: rpc('tools/list') })).json();
    const tools = body.result.tools as Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['nata_cutoff_calculator', 'barch_college_predictor', 'nata_exam_centres', 'nata_exam_dates'])
    );
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
  });

  test('AC3: a cutoff answer with a link back', async ({ request }) => {
    const body = await (
      await request.post(MCP, {
        data: rpc('tools/call', { name: 'nata_cutoff_calculator', arguments: { board: 'TN_STATE', board_marks: 540, nata_scores: [110, 128] } }),
      })
    ).json();
    const text: string = body.result.content[0].text;
    expect(text).toContain('Cutoff 308/400');
    expect(text).toContain('https://app.neramclasses.com/tools/nata/cutoff-calculator?board=TN_STATE&max=600&marks=540');
    expect(text).toContain('utm_medium=mcp');
    expect(body.result.structuredContent.url).toContain('utm_source=ai-assistant');
  });

  test('AC4: transport details', async ({ request }) => {
    const note = await request.post(MCP, { data: notification('notifications/initialized') });
    expect(note.status()).toBe(202);
    const get = await request.get(MCP, { failOnStatusCode: false });
    expect(get.status()).toBe(405);
    const pre = await request.fetch(MCP, { method: 'OPTIONS', failOnStatusCode: false });
    expect(pre.status()).toBe(204);
    expect(pre.headers()['access-control-allow-origin']).toBe('*');
    // Raw bytes: a string would be JSON-encoded into valid JSON.
    const bad = await request.post(MCP, { data: Buffer.from('{not json'), headers: { 'Content-Type': 'application/json' }, failOnStatusCode: false });
    expect((await bad.json()).error.code).toBe(-32700);
  });

  test('AC5: the setup page', async ({ page, request }) => {
    const html = await (await request.get(`${APP_URL}/connect`)).text();
    expect(html).toContain('Use aiArchitek inside ChatGPT or Claude');
    expect(html).toContain('https://app.neramclasses.com/api/mcp');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URL}/connect`);
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});

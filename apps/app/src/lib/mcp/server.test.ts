import { describe, it, expect } from 'vitest';
import { handleMcpMessage, mcpTools, trackedUrl } from './server';
import type { AskToolDeps } from '@/lib/ask/tools';
import type { CutoffCollege } from '@/lib/tools/data/facts';

const tnea = (name: string, oc: number): CutoffCollege => ({
  system: 'TNEA_BARCH',
  code: name,
  name,
  city: 'Chennai',
  district: null,
  citySlug: null,
  stateSlug: 'tamil-nadu',
  year: 2025,
  closingMarks: { OC: oc },
});

const deps: AskToolDeps = {
  loadCutoffColleges: async () => [tnea('A', 250), tnea('B', 252), tnea('C', 254), tnea('D', 256), tnea('E', 300)],
  loadJosaaClosing: async () => [],
  loadRankBands: async () => [],
  loadCentres: async () => [],
  loadCoaColleges: async () => [],
};

describe('aiArchitek MCP server', () => {
  it('negotiates the protocol version and names itself', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, deps)) as any;
    expect(res.result.protocolVersion).toBe('2025-03-26');
    expect(res.result.serverInfo.name).toBe('aiarchitek');
    expect(res.result.capabilities.tools).toBeDefined();
    const unknown = (await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, deps)) as any;
    expect(unknown.result.protocolVersion).toBe('2025-06-18');
  });

  it('lists only read-only tools, never the chat-only ones', async () => {
    const names = mcpTools().map((t) => t.name);
    expect(names).toContain('nata_cutoff_calculator');
    expect(names).toContain('barch_college_predictor');
    expect(names.some((n) => /save|open_tool|memory/.test(n))).toBe(false);
    for (const t of mcpTools()) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('answers a cutoff with the numbers and a tracked link back', async () => {
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nata_cutoff_calculator', arguments: { board: 'CBSE', board_marks: 450, nata_scores: [120] } } },
      deps
    )) as any;
    expect(res.result.isError).toBeUndefined();
    const text: string = res.result.content[0].text;
    expect(text).toContain('Cutoff 300/400');
    expect(text).toContain('https://app.neramclasses.com/tools/nata/cutoff-calculator?board=CBSE');
    expect(text).toContain('utm_source=ai-assistant');
    expect(res.result.structuredContent.cutoff_out_of_400).toBe(300);
  });

  it('shows three colleges per group with a count of the rest', async () => {
    const res = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'barch_college_predictor', arguments: { system: 'TNEA', cutoff: 262 } } },
      deps
    )) as any;
    const text: string = res.result.content[0].text;
    expect(text).toMatch(/Safe: .*\(\+1 more\)/);
    expect(text).toContain('Source: TNEA B.Arch 2025 allotment list.');
  });

  it('reports missing input as a tool error the assistant can act on', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nata_cutoff_calculator', arguments: {} } }, deps)) as any;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('Ask the student for');
  });

  it('rejects unknown tools and methods, and ignores notifications', async () => {
    expect(((await handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'save_my_details' } }, deps)) as any).error.code).toBe(-32602);
    expect(((await handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'resources/list' }, deps)) as any).error.code).toBe(-32601);
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps)).toBeNull();
  });

  it('tags links without losing their own query', () => {
    expect(trackedUrl('/tools/counseling/college-predictor?score=300&system=TNEA_BARCH')).toBe(
      'https://app.neramclasses.com/tools/counseling/college-predictor?score=300&system=TNEA_BARCH&utm_source=ai-assistant&utm_medium=mcp'
    );
  });
});

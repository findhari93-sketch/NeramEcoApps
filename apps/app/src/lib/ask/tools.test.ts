import { describe, it, expect } from 'vitest';
import { runAskTool, type AskToolDeps } from './tools';
import type { CutoffCollege } from '@/lib/tools/data/facts';

const tnea = (name: string, closingMarks: Record<string, number>): CutoffCollege => ({
  system: 'TNEA_BARCH',
  code: name,
  name,
  city: 'Chennai',
  district: null,
  citySlug: null,
  stateSlug: 'tamil-nadu',
  year: 2025,
  closingMarks,
});

const deps: AskToolDeps = {
  loadCutoffColleges: async () => [
    tnea('Top', { OC: 300 }),
    tnea('Good', { OC: 270, BC: 255 }),
    tnea('Fine', { OC: 240 }),
    tnea('Easy', { OC: 200 }),
  ],
  loadJosaaClosing: async () => [],
  loadRankBands: async () => [
    { code: 'TNEA_BARCH', year: 2025, total: 1399, bands: [{ from: 250, to: 260, bestRank: 200, worstRank: 260, count: 30 }] },
  ],
  loadCentres: async () => [],
  loadCoaColleges: async () => [
    { code: '1', name: 'School of Architecture Alpha', city: 'Chennai', citySlug: null, stateSlug: 'tamil-nadu', intake: 40, period: '2025-2026', checkedAt: null, since: null, university: null },
  ],
};

const guest = { guest: true, facts: {} };
const student = { guest: false, facts: {} };

describe('calculate_cutoff', () => {
  it('uses the board maximum and the best NATA attempt', async () => {
    const out = await runAskTool('calculate_cutoff', { board: 'TN_STATE', board_marks: 540, nata_scores: [110, 128] }, guest, deps);
    expect(out.ok).toBe(true);
    expect(out.card).toMatchObject({ kind: 'cutoff', data: { total: 308, board200: 180, nata: 128, boardEligible: true } });
    expect(out.card?.href).toBe('/tools/nata/cutoff-calculator?board=TN_STATE&max=600&marks=540');
    expect(out.factsPatch).toMatchObject({ board: 'TN_STATE', boardMarks: 540, nataScores: [110, 128], cutoff: 308 });
  });

  it('fills gaps from remembered details', async () => {
    const out = await runAskTool('calculate_cutoff', { nata_scores: [100] }, { guest: false, facts: { board: 'CBSE', boardMax: 500, boardMarks: 400 } }, deps);
    expect(out.card).toMatchObject({ data: { total: 260 } });
  });

  it('converts a percentage when that is all the student gave', async () => {
    const out = await runAskTool('calculate_cutoff', { board: 'CBSE', board_percent: 90, nata_part_a: 50, nata_part_b: 70 }, guest, deps);
    expect(out.card).toMatchObject({ data: { marks: 450, total: 300 } });
    expect(out.card?.href).toContain('a=50&b=70');
  });

  it('asks for what is missing instead of guessing', async () => {
    const out = await runAskTool('calculate_cutoff', { nata_scores: [120] }, guest, deps);
    expect(out).toMatchObject({ ok: false, result: { error: 'missing_input' } });
    expect(out.card).toBeUndefined();
  });

  it('refuses marks above the maximum and NATA above 200', async () => {
    expect((await runAskTool('calculate_cutoff', { board: 'CBSE', board_marks: 520, nata_scores: [100] }, guest, deps)).ok).toBe(false);
    expect((await runAskTool('calculate_cutoff', { board: 'CBSE', board_marks: 400, nata_scores: [260] }, guest, deps)).ok).toBe(false);
  });
});

describe('predict_colleges', () => {
  it('groups TNEA colleges for the community and limits a guest', async () => {
    const out = await runAskTool('predict_colleges', { system: 'TNEA', cutoff: 258, community: 'BC' }, guest, deps);
    expect(out.ok).toBe(true);
    const card = out.card as Extract<NonNullable<typeof out.card>, { kind: 'colleges' }>;
    expect(card.data.counts).toEqual({ safe: 2, target: 1, reach: 0 });
    expect(card.data.groups.safe).toHaveLength(1);
    expect(card.data.hidden).toBe(1);
    expect(card.data.source).toBe('TNEA B.Arch 2025 allotment list');
    expect(card.href).toContain('score=258');
  });

  it('shows a signed-in student every match', async () => {
    const out = await runAskTool('predict_colleges', { system: 'TNEA', cutoff: 258, community: 'BC' }, student, deps);
    const card = out.card as Extract<NonNullable<typeof out.card>, { kind: 'colleges' }>;
    expect(card.data.groups.safe.map((r) => r.name)).toEqual(['Fine', 'Easy']);
    expect(card.data.hidden).toBe(0);
  });

  it('needs a cutoff for TNEA and a rank for JoSAA', async () => {
    expect(await runAskTool('predict_colleges', { system: 'TNEA' }, guest, deps)).toMatchObject({ ok: false });
    expect(await runAskTool('predict_colleges', { system: 'JOSAA' }, guest, deps)).toMatchObject({ ok: false });
  });
});

describe('the other tools', () => {
  it('reads the rank band for a cutoff', async () => {
    const out = await runAskTool('predict_rank', { system: 'TNEA', cutoff: 255 }, guest, deps);
    expect(out.card).toMatchObject({ kind: 'rank', data: { bestRank: 200, worstRank: 260, totalRanked: 1399 } });
  });

  it('finds a COA approved college by name words', async () => {
    const out = await runAskTool('check_coa_approval', { query: 'alpha architecture' }, guest, deps);
    expect(out.result).toMatchObject({ matches: 1 });
  });

  it('remembers details in the memory shape', async () => {
    const out = await runAskTool('save_my_details', { community: 'MBC', exam_year: 2027 }, guest, deps);
    expect(out.factsPatch).toEqual({ community: 'MBC', examYear: 2027 });
  });

  it('links a tool page and rejects unknown tools', async () => {
    expect((await runAskTool('open_tool', { tool: 'nata-image-crop' }, guest, deps)).card).toMatchObject({ kind: 'tool', href: '/tools/nata/image-crop' });
    expect((await runAskTool('open_tool', { tool: 'rm -rf' }, guest, deps)).ok).toBe(false);
    expect((await runAskTool('nope', {}, guest, deps)).ok).toBe(false);
  });
});

describe('cost, eligibility and dates', () => {
  it('estimates the cost from the fee table and a remembered state', async () => {
    const out = await runAskTool('estimate_cost', { category: 'SC', attempts: 2 }, { guest: true, facts: { state: 'Tamil Nadu' } }, deps);
    expect(out.card).toMatchObject({ kind: 'cost', data: { category: 'SC/ST/EWS/PwD', totalFee: 2500, travel: 4000, state: 'Tamil Nadu' } });
  });

  it('checks eligibility with the CoA rules and needs an education status', async () => {
    const ok = await runAskTool(
      'check_eligibility',
      { education: 'Passed 10+2', subjects: ['Physics', 'Mathematics', 'Chemistry'], aggregate_percent: 72 },
      guest,
      deps
    );
    expect(ok.card).toMatchObject({ kind: 'eligibility', data: { nataEligible: true, purpose: 'B.Arch Admission' } });
    expect(await runAskTool('check_eligibility', {}, guest, deps)).toMatchObject({ ok: false, result: { error: 'missing_input' } });
  });

  it('gives the NATA calendar with an honest announced flag', async () => {
    const out = await runAskTool('exam_dates', {}, guest, deps);
    expect(out.card?.kind).toBe('dates');
    expect(out.result).toHaveProperty('nata_year');
  });
});

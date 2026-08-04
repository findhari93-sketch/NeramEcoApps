import { describe, it, expect, vi } from 'vitest';
import {
  resolveSectionGate,
  gateIsIncomplete,
  readGateSettings,
  FALLBACK_GATE_SETTINGS,
} from './recap-gate';

/**
 * The behaviour these lock down is the one that shipped broken: a checkpoint
 * whose gate columns are NULL used to serve the entire bank and demand every
 * answer correct, which no student can clear. Five such checkpoints were live in
 * production on a published recap.
 */

const SETTINGS = { questionsPerSegment: 10, passPercentage: 70 };

describe('resolveSectionGate', () => {
  it('honours what the teacher set, without touching it', () => {
    const gate = resolveSectionGate(
      { questions_to_serve: 8, min_questions_to_pass: 5 },
      15,
      SETTINGS,
    );
    expect(gate).toEqual({ serve: 8, minToPass: 5 });
  });

  it('fills a NULL pass mark from the percentage rather than demanding all of them', () => {
    // The regression. Before this, 15 questions with a NULL pass mark meant
    // 15 correct out of 15, on every checkpoint of the recap.
    const gate = resolveSectionGate(
      { questions_to_serve: null, min_questions_to_pass: null },
      15,
      SETTINGS,
    );
    expect(gate.serve).toBe(10);
    expect(gate.minToPass).toBe(7);
    expect(gate.minToPass).toBeLessThan(gate.serve);
  });

  it('never asks for more than the checkpoint actually holds', () => {
    // A bank of four cannot serve ten, and a pass mark computed against ten it
    // cannot serve is the same wall by another route.
    const gate = resolveSectionGate({ questions_to_serve: 10, min_questions_to_pass: 9 }, 4, SETTINGS);
    expect(gate.serve).toBe(4);
    expect(gate.minToPass).toBeLessThanOrEqual(4);
  });

  it('caps a declared pass mark at what is served', () => {
    const gate = resolveSectionGate({ questions_to_serve: 5, min_questions_to_pass: 99 }, 15, SETTINGS);
    expect(gate.minToPass).toBe(5);
  });

  it('treats zero and negative values as unset rather than as a gate', () => {
    // A 0 pass mark would pass everyone; a 0 serve would draw an empty paper.
    const gate = resolveSectionGate({ questions_to_serve: 0, min_questions_to_pass: 0 }, 15, SETTINGS);
    expect(gate.serve).toBe(10);
    expect(gate.minToPass).toBe(7);
  });

  it('survives NaN in either column', () => {
    const gate = resolveSectionGate(
      { questions_to_serve: Number.NaN, min_questions_to_pass: Number.NaN },
      15,
      SETTINGS,
    );
    expect(Number.isFinite(gate.serve)).toBe(true);
    expect(Number.isFinite(gate.minToPass)).toBe(true);
    expect(gate.minToPass).toBeGreaterThan(0);
  });

  it('handles a missing section without throwing', () => {
    const gate = resolveSectionGate(null, 15, SETTINGS);
    expect(gate.serve).toBe(10);
    expect(gate.minToPass).toBe(7);
  });

  it('always leaves something to answer, even with an empty bank', () => {
    const gate = resolveSectionGate(null, 0, SETTINGS);
    expect(gate.serve).toBeGreaterThanOrEqual(1);
    expect(gate.minToPass).toBeGreaterThanOrEqual(1);
    expect(gate.minToPass).toBeLessThanOrEqual(gate.serve);
  });

  it('defaults to the classroom fallback when no settings are supplied', () => {
    const gate = resolveSectionGate({ questions_to_serve: null, min_questions_to_pass: null }, 15);
    expect(gate.serve).toBe(FALLBACK_GATE_SETTINGS.questionsPerSegment);
  });

  it('is never harder than passing every served question', () => {
    // Property check across the plausible range: whatever the inputs, a student
    // who answers everything correctly must pass.
    for (const available of [1, 3, 4, 10, 15, 40]) {
      for (const serve of [null, 1, 5, 10, 15, 99]) {
        for (const pass of [null, 1, 7, 15, 99]) {
          const gate = resolveSectionGate(
            { questions_to_serve: serve, min_questions_to_pass: pass },
            available,
            SETTINGS,
          );
          expect(gate.minToPass).toBeLessThanOrEqual(gate.serve);
          expect(gate.minToPass).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

describe('gateIsIncomplete', () => {
  it('is false only when both columns carry a usable number', () => {
    expect(gateIsIncomplete({ questions_to_serve: 10, min_questions_to_pass: 7 })).toBe(false);
  });

  it('is true when either column is blank', () => {
    expect(gateIsIncomplete({ questions_to_serve: 10, min_questions_to_pass: null })).toBe(true);
    expect(gateIsIncomplete({ questions_to_serve: null, min_questions_to_pass: 7 })).toBe(true);
    expect(gateIsIncomplete(null)).toBe(true);
  });
});

describe('readGateSettings', () => {
  function fakeSupabase(rows: Record<string, any>) {
    return {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
            }),
          }),
        };
      },
    };
  }

  it("prefers the recap's own overrides", async () => {
    const supabase = fakeSupabase({
      nexus_settings: { value: { questions_per_segment: 10, pass_percentage: 70 } },
      nexus_class_recaps: { questions_per_segment: 6, pass_percentage: 50 },
    });
    const settings = await readGateSettings(supabase, 'recap-1');
    expect(settings).toEqual({ questionsPerSegment: 6, passPercentage: 50 });
  });

  it('falls back to the classroom defaults when the recap has none', async () => {
    const supabase = fakeSupabase({
      nexus_settings: { value: { questions_per_segment: 12, pass_percentage: 80 } },
      nexus_class_recaps: { questions_per_segment: null, pass_percentage: null },
    });
    const settings = await readGateSettings(supabase, 'recap-1');
    expect(settings).toEqual({ questionsPerSegment: 12, passPercentage: 80 });
  });

  it('falls back again when the settings row is missing', async () => {
    const settings = await readGateSettings(fakeSupabase({}), 'recap-1');
    expect(settings).toEqual(FALLBACK_GATE_SETTINGS);
  });

  it('does not throw when the database is unreachable', async () => {
    // A student mid-attempt must not be failed by an unreadable settings row.
    const exploding = {
      from() {
        throw new Error('connection refused');
      },
    };
    const settings = await readGateSettings(exploding, 'recap-1');
    expect(settings).toEqual(FALLBACK_GATE_SETTINGS);
  });

  it('skips the recap lookup entirely when there is no recap id', async () => {
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }));
    await readGateSettings({ from }, null);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('nexus_settings');
  });
});

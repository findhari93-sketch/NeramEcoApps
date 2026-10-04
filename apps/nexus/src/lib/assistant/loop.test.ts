// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { GeminiResult } from '@neram/ai';
import { MAX_TOOL_PAYLOAD, runModelLoop, toFunctionResponse } from './loop';
import { toGeminiDeclarations } from './registry';
import type { ToolDef } from './types';

const res = (over: Partial<GeminiResult>): GeminiResult => ({
  text: '', model: 'gemini-2.5-flash-lite', usage: { promptTokens: 100, outputTokens: 20, totalTokens: 120 }, costUsd: 0.00002,
  keyTier: 'paid', functionCalls: [], modelParts: [], finishReason: 'STOP', ...over,
});

const schedule: ToolDef = {
  name: 'my_schedule', description: 'Next classes.', parameters: { type: 'object', properties: {} }, audience: 'student', kind: 'read',
  run: async () => ({ ok: true }),
};

const base = (generate: any, runTool = vi.fn(async () => ({ ok: true, reply: 'Next: Perspective tomorrow 6 pm.', links: [{ label: 'Timetable', url: '/student/timetable' }] }))) => ({
  input: {
    feature: 'nexus.assistant-student' as const, system: 'SYS', contents: [{ role: 'user' as const, parts: [{ text: 'when is class' }] }],
    tools: [schedule], maxIterations: 4, maxOutputTokens: 400, actorId: 'u1', clientKey: 'k1', runTool,
  },
  generate, runTool,
});

describe('runModelLoop', () => {
  it('answers in one call when the model needs no tool', async () => {
    const generate = vi.fn(async (_o: unknown) => res({ text: 'Hello.' }));
    const { input } = base(generate);
    const out = await runModelLoop(input, generate);
    expect(out.text).toBe('Hello.');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({ feature: 'nexus.assistant-student', systemInstruction: 'SYS', responseMimeType: 'text/plain', maxOutputTokens: 400, actorId: 'u1', clientKey: 'k1' });
  });

  it('runs a tool, replays the model turn verbatim, sends the result back and returns the final text', async () => {
    const modelParts = [{ functionCall: { name: 'my_schedule', args: {} }, thoughtSignature: 'sig' }];
    const generate = vi.fn()
      .mockResolvedValueOnce(res({ functionCalls: [{ name: 'my_schedule', args: {} }], modelParts }))
      .mockResolvedValueOnce(res({ text: 'Your next class is Perspective tomorrow at 6 pm.' }));
    const { input, runTool } = base(generate);
    const out = await runModelLoop(input, generate);
    expect(runTool).toHaveBeenCalledWith('my_schedule', {});
    const second = generate.mock.calls[1][0].contents;
    expect(second[1]).toEqual({ role: 'model', parts: modelParts });
    expect(second[2]).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'my_schedule', response: { ok: true, summary: 'Next: Perspective tomorrow 6 pm.' } } }] });
    expect(out).toMatchObject({ text: 'Your next class is Perspective tomorrow at 6 pm.', toolCalls: [{ name: 'my_schedule', args: {}, ok: true }], links: [{ label: 'Timetable', url: '/student/timetable' }] });
    expect(out.usage).toEqual({ promptTokens: 200, outputTokens: 40 });
    expect(out.costUsd).toBeCloseTo(0.00004);
  });

  it('runs several calls of one round in parallel and answers them in one user turn', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(res({ functionCalls: [{ name: 'my_schedule', args: {} }, { name: 'my_schedule', args: { x: 1 } }] }))
      .mockResolvedValueOnce(res({ text: 'Done.' }));
    const { input } = base(generate);
    await runModelLoop(input, generate);
    const round = generate.mock.calls[1][0].contents;
    expect(round[1].parts).toHaveLength(2); // synthesised model parts when modelParts is empty
    expect(round[2].parts).toHaveLength(2);
  });

  it('withholds the tools on the last allowed call, forcing a text answer', async () => {
    const call = res({ functionCalls: [{ name: 'my_schedule', args: {} }] });
    const generate = vi.fn().mockResolvedValueOnce(call).mockResolvedValueOnce(call).mockResolvedValueOnce(call).mockResolvedValueOnce(res({ text: 'Final.' }));
    const { input } = base(generate);
    const out = await runModelLoop(input, generate);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(generate.mock.calls[3][0].tools).toBeUndefined();
    expect(generate.mock.calls[0][0].tools).toEqual(toGeminiDeclarations([schedule]));
    expect(out.text).toBe('Final.');
  });

  it('rethrows a budget refusal untouched', async () => {
    const { AiBlockedError } = await import('@neram/ai');
    const blocked = new AiBlockedError({ message: 'paused', reason: 'feature_off', feature: 'nexus.assistant-student', supportsManual: false, manualPrompt: null });
    const generate = vi.fn().mockRejectedValue(blocked);
    const { input } = base(generate);
    await expect(runModelLoop(input, generate)).rejects.toBe(blocked);
  });

  it('reports an unknown cost as null, never as zero', async () => {
    const generate = vi.fn(async () => res({ text: 'x', costUsd: null }));
    const { input } = base(generate);
    expect((await runModelLoop(input, generate)).costUsd).toBeNull();
  });
});

describe('toFunctionResponse', () => {
  it('keeps the summary and drops oversized data with a note', () => {
    const big = { ok: true, reply: 'Three classes.', data: Array.from({ length: 2000 }, (_, i) => ({ i, title: 'Perspective drawing class' })) };
    const out = toFunctionResponse(big);
    expect(out).toEqual({ ok: true, summary: 'Three classes.', note: 'The details were too long to include. Use the summary.' });
    expect(JSON.stringify(toFunctionResponse({ ok: true, data: { a: 1 } })).length).toBeLessThanOrEqual(MAX_TOOL_PAYLOAD);
  });

  it('passes an error through', () => {
    expect(toFunctionResponse({ ok: false, error: 'No such tool.' })).toEqual({ ok: false, error: 'No such tool.' });
  });
});

describe('toGeminiDeclarations', () => {
  it('omits parameters for a tool that takes none (Gemini rejects an empty OBJECT)', () => {
    expect(toGeminiDeclarations([schedule])).toEqual([{ functionDeclarations: [{ name: 'my_schedule', description: 'Next classes.' }] }]);
  });
});

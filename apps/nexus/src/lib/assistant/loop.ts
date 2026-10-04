/**
 * The model's side of a turn, modelled on runGeminiLoop in
 * apps/marketing/src/app/api/chat/route.ts: call, run the tools it asks for in
 * parallel, send the results back, repeat; the last allowed call goes without
 * tools so the model has to answer in words. Each round's model turn is
 * replayed exactly as Gemini sent it (thought signatures included, D5).
 * Server only.
 */
import { generateGemini, type AiFeatureId, type GeminiContent, type GeminiResult, type GenerateOptions } from '@neram/ai';
import { toGeminiDeclarations } from './registry';
import type { ToolDef, ToolLink, ToolResult } from './types';

export const MAX_TOOL_PAYLOAD = 6000;

export interface LoopToolCall { name: string; args: Record<string, unknown>; ok: boolean }

export interface LoopInput {
  feature: AiFeatureId;
  system: string;
  contents: GeminiContent[];
  tools: ToolDef[];
  maxIterations: number;
  maxOutputTokens: number;
  actorId: string;
  clientKey: string | null;
  /** Absolute epoch ms. Checked before every model call after the first; past it, the loop stops. */
  deadlineMs?: number;
  /** The clock the deadline is read against. Defaults to Date.now. */
  now?: () => number;
  runTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface LoopOutput {
  text: string;
  finishReason: string;
  model: string;
  usage: { promptTokens: number; outputTokens: number };
  costUsd: number | null;
  toolCalls: LoopToolCall[];
  links: ToolLink[];
}

/** What the model reads back from a tool: the templated sentence first, the data if it fits. */
export function toFunctionResponse(result: ToolResult): Record<string, unknown> {
  const base: Record<string, unknown> = { ok: result.ok };
  if (result.reply) base.summary = result.reply;
  if (result.error) base.error = result.error;
  if (result.data === undefined) return base;
  const full = { ...base, data: result.data };
  if (JSON.stringify(full).length <= MAX_TOOL_PAYLOAD) return full;
  return { ...base, note: 'The details were too long to include. Use the summary.' };
}

export async function runModelLoop(
  input: LoopInput,
  generate: (o: GenerateOptions) => Promise<GeminiResult> = generateGemini,
): Promise<LoopOutput> {
  const contents: GeminiContent[] = [...input.contents];
  const declarations = input.tools.length ? toGeminiDeclarations(input.tools) : null;
  const usage = { promptTokens: 0, outputTokens: 0 };
  let costUsd: number | null = 0;
  const toolCalls: LoopToolCall[] = [];
  const links: ToolLink[] = [];

  const clock = input.now ?? Date.now;
  let lastText = '';

  for (let i = 0; i < input.maxIterations; i++) {
    // Out of time: stop with whatever words we have. llm.ts turns an empty reply into the busy sentence.
    if (i > 0 && input.deadlineMs !== undefined && clock() >= input.deadlineMs) {
      return { text: lastText, finishReason: 'DEADLINE', model: '', usage, costUsd, toolCalls, links };
    }
    const last = i === input.maxIterations - 1;
    const res = await generate({
      feature: input.feature,
      systemInstruction: input.system,
      contents,
      ...(declarations && !last ? { tools: declarations } : {}),
      responseMimeType: 'text/plain',
      temperature: 0.3,
      maxOutputTokens: input.maxOutputTokens,
      actorId: input.actorId,
      clientKey: input.clientKey,
    });
    usage.promptTokens += res.usage.promptTokens;
    usage.outputTokens += res.usage.outputTokens;
    lastText = res.text || lastText;
    costUsd = costUsd === null || res.costUsd === null ? null : costUsd + res.costUsd;

    if (res.functionCalls.length === 0 || last) {
      return { text: res.text, finishReason: res.finishReason, model: res.model, usage, costUsd, toolCalls, links };
    }

    const calls = res.functionCalls.map((c) => ({
      name: c.name,
      args: (c.args && typeof c.args === 'object' ? c.args : {}) as Record<string, unknown>,
    }));
    contents.push({ role: 'model', parts: res.modelParts.length ? res.modelParts : calls.map((c) => ({ functionCall: c })) });
    const results = await Promise.all(calls.map((c) => input.runTool(c.name, c.args)));
    calls.forEach((c, k) => {
      toolCalls.push({ name: c.name, args: c.args, ok: results[k].ok });
      for (const l of results[k].links ?? []) if (!links.some((x) => x.url === l.url)) links.push(l);
    });
    // Gemini REST v1beta takes function responses as role 'user', all of one round together.
    contents.push({ role: 'user', parts: calls.map((c, k) => ({ functionResponse: { name: c.name, response: toFunctionResponse(results[k]) } })) });
  }
  // maxIterations < 1: nothing was asked.
  return { text: '', finishReason: 'NONE', model: '', usage, costUsd, toolCalls, links };
}

import type { ActionToolDef, AssistantCaller, Mode, ToolDef } from './types';
import { allowedTools } from './policy';

/**
 * Every tool the assistant knows. Filled by the tool modules at import time
 * through registerTools, so a module that is never imported never exists, and
 * tests can register fixtures without touching the real list.
 */
export const TOOLS: ToolDef[] = [];

export function registerTools(defs: ToolDef[]): void {
  for (const def of defs) {
    if (TOOLS.some((t) => t.name === def.name)) throw new Error(`Duplicate assistant tool: ${def.name}`);
    TOOLS.push(def);
  }
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function isActionTool(def: ToolDef | undefined): def is ActionToolDef {
  return !!def && def.kind === 'action' && typeof (def as ActionToolDef).execute === 'function';
}

export function findActionTool(kind: string): ActionToolDef | undefined {
  const def = findTool(kind);
  return isActionTool(def) ? def : undefined;
}

export function toolsFor(caller: AssistantCaller, mode: Mode): ToolDef[] {
  return allowedTools(TOOLS, caller, mode);
}

/** Gemini `functionDeclarations` shape, used from M2. Harmless here. */
export function toGeminiDeclarations(tools: ToolDef[]): Array<{ functionDeclarations: unknown[] }> {
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
}

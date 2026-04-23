import { getCollegeTool } from './get-college';
import { searchCollegesTool } from './search-colleges';
import { compareCollegesTool } from './compare-colleges';
import type { ToolName, ToolResult } from './types';

const TOOL_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    p,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const runner = (async (): Promise<ToolResult> => {
    switch (name as ToolName) {
      case 'get_college':
        return getCollegeTool(args as any);
      case 'search_colleges':
        return searchCollegesTool(args as any);
      case 'compare_colleges':
        return compareCollegesTool(args as any);
      default:
        return { ok: false, error: 'unknown_tool' };
    }
  })();

  const result = await withTimeout(runner, TOOL_TIMEOUT_MS);
  if (result === 'timeout') return { ok: false, error: 'timeout' };
  return result;
}

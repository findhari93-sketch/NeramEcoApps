import { NextResponse } from 'next/server';
import { NotConfiguredError } from './pipeline';
import { TransitionError } from './recommendations';

/** Map the agent's known errors to status codes; anything else is a 500 with the message logged. */
export function errorResponse(err: unknown, label: string) {
  if (err instanceof TransitionError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof NotConfiguredError) return NextResponse.json({ error: err.message, notConfigured: true }, { status: 412 });
  const message = err instanceof Error ? err.message : 'unknown error';
  console.error(`[marketing-ai] ${label}:`, message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

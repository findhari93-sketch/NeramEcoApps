/**
 * The Answer Pad screens' one way to call /api/pad.
 *
 * Every answer the routes give on a refusal carries a `code` (see rpc.ts), and
 * the screens branch on that code, never on the message: the message is for a
 * log, the code decides what the student or teacher sees.
 */

import type { PadHost } from './pad-host';

export class PadClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PadClientError';
  }

  /** No answer from the server at all: offline, a dropped connection, a timeout. */
  get offline(): boolean {
    return this.status === 0;
  }
}

export interface PadFetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

export async function padFetch<T>(host: PadHost, path: string, options: PadFetchOptions = {}): Promise<T> {
  let token: string;
  try {
    token = await host.getToken();
  } catch (err) {
    throw new PadClientError(401, 'NO_TOKEN', err instanceof Error ? err.message : 'Not signed in');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new PadClientError(0, 'OFFLINE', 'No connection');
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new PadClientError(
      response.status,
      typeof data.code === 'string' ? data.code : null,
      typeof data.error === 'string' ? data.error : `Request failed (${response.status})`,
      data,
    );
  }
  return data as T;
}

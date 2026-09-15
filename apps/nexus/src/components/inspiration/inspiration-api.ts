import type { GetToken } from '@/lib/nexus-swr';

async function send<T>(getToken: GetToken, url: string, method: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json as T;
}

export function setSaved(getToken: GetToken, itemId: string, saved: boolean) {
  return send<{ saved: boolean }>(getToken, `/api/inspiration/items/${itemId}/save`, saved ? 'POST' : 'DELETE');
}

export function patchItem(getToken: GetToken, itemId: string, patch: Record<string, unknown>) {
  return send<{ item: unknown }>(getToken, `/api/inspiration/items/${itemId}`, 'PATCH', patch);
}

export function deleteExemplarItem(getToken: GetToken, itemId: string) {
  return send<{ deleted: boolean }>(getToken, `/api/inspiration/items/${itemId}`, 'DELETE');
}

export function createExemplar(getToken: GetToken, body: Record<string, unknown>) {
  return send<{ id: string }>(getToken, '/api/inspiration/exemplars', 'POST', body);
}

export function prepareImages(getToken: GetToken) {
  return send<{ processed: number; remaining: number }>(getToken, '/api/inspiration/maintenance/images', 'POST');
}

export async function uploadInspirationImage(getToken: GetToken, file: File): Promise<{ url: string; path?: string }> {
  const token = await getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', 'drawing-references');
  const res = await fetch('/api/drawing/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Upload failed');
  return json as { url: string; path?: string };
}

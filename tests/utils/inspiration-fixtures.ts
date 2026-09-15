import { readFileSync } from 'node:fs';
import path from 'path';
import type { APIRequestContext } from '@playwright/test';
import { APP_URLS } from './credentials';

/**
 * A real Inspiration exemplar for E2E runs. Exemplar images must live in the
 * project's own storage (parseExemplarInput refuses any other address), so the
 * PNG is uploaded through /api/drawing/upload first, exactly as the Add
 * exemplar sheet does. Delete it with deleteInspirationExemplar in afterAll.
 */
const IMAGE_PATH = path.resolve(__dirname, '../../apps/nexus/public/icons/icon-512x512.png');

export type ExemplarFixture = { id: string; imageUrl: string } | { error: string };

export async function createInspirationExemplar(
  request: APIRequestContext,
  teacherToken: string,
  input: { title: string; brief: string },
): Promise<ExemplarFixture> {
  const nexus = APP_URLS.nexus;
  const headers = { Authorization: `Bearer ${teacherToken}` };

  const upload = await request.post(`${nexus}/api/drawing/upload`, {
    headers,
    multipart: {
      file: { name: 'inspiration-e2e.png', mimeType: 'image/png', buffer: readFileSync(IMAGE_PATH) },
      bucket: 'drawing-references',
    },
  });
  if (!upload.ok()) return { error: `upload ${upload.status()}: ${await upload.text()}` };
  const { url } = await upload.json();

  const create = await request.post(`${nexus}/api/inspiration/exemplars`, {
    headers,
    data: {
      image_url: url,
      title: input.title,
      brief: input.brief,
      type_slugs: ['3d_composition'],
      exam_types: ['NATA'],
      paper_years: [2025],
    },
  });
  if (create.status() !== 201) return { error: `create ${create.status()}: ${await create.text()}` };
  return { id: (await create.json()).id, imageUrl: url };
}

/** Deletes a fixture exemplar. 404 means it is already gone, which is fine. */
export async function deleteInspirationExemplar(request: APIRequestContext, teacherToken: string, id: string): Promise<number> {
  const res = await request.delete(`${APP_URLS.nexus}/api/inspiration/items/${id}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    failOnStatusCode: false,
  });
  return res.status();
}

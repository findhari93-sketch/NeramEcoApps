import type { ExemplarInput, InspirationItemPatch, InspirationSourceKind } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { INSPIRATION_TYPE_LABELS } from '@/lib/inspiration-types';
import { isProjectStorageUrl } from '@/lib/inspiration-storage-url';

const CURATIONS = new Set(['auto', 'shown', 'hidden']);
const EXAMS = new Set(['NATA', 'JEE_PAPER_2']);
const TITLE_MAX = 120;
const BRIEF_MAX = 600;

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function optionalText(value: unknown, max: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new ApiError(`${field} must be text.`, 400);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(`${field} can be ${max} characters at most.`, 400);
  return trimmed || null;
}

function typeSlugs(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(INSPIRATION_TYPE_LABELS, v))) {
    throw new ApiError('Pick drawing types from the list.', 400);
  }
  const unique = [...new Set(value as string[])];
  if (unique.length > 6) throw new ApiError('Pick up to 6 drawing types.', 400);
  return unique;
}

function examTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !EXAMS.has(v))) {
    throw new ApiError('Exam must be NATA or JEE Paper 2.', 400);
  }
  return [...new Set(value as string[])];
}

function paperYears(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v) || (v as number) < 2000 || (v as number) > 2100)) {
    throw new ApiError('Years must be between 2000 and 2100.', 400);
  }
  const unique = [...new Set(value as number[])];
  if (unique.length > 5) throw new ApiError('Add up to 5 years.', 400);
  return unique;
}

export function parseItemPatch(
  body: unknown,
  kind: InspirationSourceKind,
): { patch: InspirationItemPatch; hideAllByAuthor: boolean } {
  const b = asObject(body);
  const patch: InspirationItemPatch = {};

  if (b.curation !== undefined) {
    if (typeof b.curation !== 'string' || !CURATIONS.has(b.curation)) {
      throw new ApiError('curation must be auto, shown or hidden.', 400);
    }
    patch.curation = b.curation as InspirationItemPatch['curation'];
  }
  if (b.is_featured !== undefined) {
    if (typeof b.is_featured !== 'boolean') throw new ApiError('is_featured must be true or false.', 400);
    patch.is_featured = b.is_featured;
  }
  const title = optionalText(b.title_override, TITLE_MAX, 'Title');
  if (title !== undefined) patch.title_override = title;
  const brief = optionalText(b.brief_override, BRIEF_MAX, 'Brief');
  if (brief !== undefined) patch.brief_override = brief;

  const ownTags = b.type_slugs !== undefined || b.exam_types !== undefined || b.paper_years !== undefined;
  if (ownTags && kind !== 'exemplar') {
    throw new ApiError("A student drawing's types, exam and year come from its review. Change them there.", 400);
  }
  if (b.type_slugs !== undefined) patch.type_slugs = typeSlugs(b.type_slugs);
  if (b.exam_types !== undefined) patch.exam_types = examTypes(b.exam_types);
  if (b.paper_years !== undefined) patch.paper_years = paperYears(b.paper_years);

  const hideAllByAuthor = b.hide_all_by_author === true;
  if (!hideAllByAuthor && Object.keys(patch).length === 0) throw new ApiError('Nothing to change.', 400);
  return { patch, hideAllByAuthor };
}

export function parseExemplarInput(body: unknown): ExemplarInput {
  const b = asObject(body);
  const imageUrl = typeof b.image_url === 'string' ? b.image_url.trim() : '';
  // Only an image uploaded to this project's storage: the server fetches it for
  // a thumbnail and every student sees it.
  if (!/^https:\/\/\S+$/.test(imageUrl) || imageUrl.length > 1000 || !isProjectStorageUrl(imageUrl)) {
    throw new ApiError('Upload the drawing first.', 400);
  }
  const title = optionalText(b.title, TITLE_MAX, 'Title') ?? null;
  const brief = optionalText(b.brief, BRIEF_MAX, 'Brief') ?? null;
  if (!title && !brief) throw new ApiError('Add a title or a brief so students can find it.', 400);
  const types = typeSlugs(b.type_slugs ?? []);
  if (types.length === 0) throw new ApiError('Pick at least one drawing type.', 400);
  return {
    image_url: imageUrl,
    title,
    brief,
    type_slugs: types,
    exam_types: examTypes(b.exam_types ?? []),
    paper_years: paperYears(b.paper_years ?? []),
  };
}

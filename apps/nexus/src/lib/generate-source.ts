/**
 * Turn "what should the AI read?" into the parts of a Gemini call.
 *
 * SERVER ONLY. Three sources, one shape out, so the generate route is a thin
 * thing that does not care which of them the teacher picked:
 *
 *   topic      nothing to read. The prompt is the whole input.
 *   pdf        a study-material chapter, fetched from SharePoint as bytes.
 *   recording  a class transcript that has already been captured.
 *
 * The PDF half is lifted out of study-materials/files/[id]/test/generate so the
 * byte fetch, the MIME check and the 14 MB guard exist once. That route had the
 * only copy, which meant a second caller either duplicated the size limit or
 * quietly did without it, and doing without it fails as an opaque 500 from
 * Google rather than as a sentence a teacher can act on.
 */
import { getFileById } from '@neram/database';
import type { GeminiPart } from '@neram/ai';
import { getSharePointDownloadUrl, getSharePointStreamUrl } from '@/lib/sharepoint';
import { readStoredTranscript } from '@/lib/transcript-resolver';
import { TRANSCRIPT_SLICE_CHARS } from '@/lib/ai-question-cost';

export type GenerateSourceMode = 'topic' | 'pdf' | 'recording';

/**
 * Gemini caps an inline_data request near 20 MB and base64 costs a third on
 * top, so this is the largest file that fits with room for the prompt.
 */
export const MAX_PDF_BYTES = 14 * 1024 * 1024;

/** Carries its own HTTP status so the route does not have to guess one. */
export class GenerateSourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GenerateSourceError';
  }
}

export interface ResolvedSource {
  /** Prepended to the prompt part by the caller. Empty for a topic prompt. */
  parts: GeminiPart[];
  /** What the document or transcript is called, used as the title hint. */
  label: string | null;
  /** For the cost estimate, and for the usage record afterwards. */
  meta: { mode: GenerateSourceMode; bytes?: number; transcriptChars?: number };
}

/** A short line naming the source, appended to the prompt for a recording. */
function transcriptPrompt(text: string): string {
  return [
    'TRANSCRIPT OF THE CLASS',
    'Write the questions from what was actually taught below. Do not add material it does not cover.',
    '',
    text,
  ].join('\n');
}

export async function resolveGenerateSource(input: {
  mode: GenerateSourceMode;
  fileId?: string | null;
  classId?: string | null;
  supabase?: unknown;
}): Promise<ResolvedSource> {
  if (input.mode === 'topic') {
    return { parts: [], label: null, meta: { mode: 'topic' } };
  }

  if (input.mode === 'pdf') {
    if (!input.fileId) throw new GenerateSourceError('No chapter was chosen', 400);
    const file = await getFileById(input.fileId);
    if (!file) throw new GenerateSourceError('Chapter not found', 404);
    // file_type holds the MIME type the upload route recorded from the browser.
    if (file.file_type !== 'application/pdf') {
      throw new GenerateSourceError('Only a PDF can be turned into questions. This file is not one.', 400);
    }

    // Both resolvers are app-only, so this works without the teacher's Graph
    // token and would work from a cron.
    const downloadUrl = file.link_url
      ? await getSharePointStreamUrl(file.link_url)
      : await getSharePointDownloadUrl(String(file.sharepoint_item_id));
    const upstream = await fetch(downloadUrl, { redirect: 'follow' });
    if (!upstream.ok) throw new GenerateSourceError('Could not read the PDF from SharePoint', 502);

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_PDF_BYTES) {
      const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
      throw new GenerateSourceError(
        `This chapter is ${mb} MB. The model accepts up to 14 MB, so split it first.`,
        400,
      );
    }

    return {
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
      ],
      label: file.title ?? null,
      meta: { mode: 'pdf', bytes: bytes.byteLength },
    };
  }

  // recording
  if (!input.classId) throw new GenerateSourceError('No class was chosen', 400);
  const entries = await readStoredTranscript(input.supabase, input.classId);
  if (!entries || entries.length === 0) {
    // Deliberately not a fetch-it-now path. The wizard only offers a class
    // whose transcript is already captured (that is what the "transcript ready"
    // chip means), and a class without one is a different job with different
    // failure modes, handled where transcripts are captured.
    throw new GenerateSourceError(
      'That class has no transcript yet, so there is nothing to write questions from.',
      400,
    );
  }

  // Sliced to the same budget ai-generate.ts uses. A 46-minute class is far
  // more text than one call should carry, and the estimate is computed against
  // this same cap, so quoting a price on the raw length would overstate it.
  const text = entries
    .map((e: { text?: string }) => e.text || '')
    .join(' ')
    .slice(0, TRANSCRIPT_SLICE_CHARS);

  return {
    parts: [{ text: transcriptPrompt(text) }],
    label: null,
    meta: { mode: 'recording', transcriptChars: text.length },
  };
}

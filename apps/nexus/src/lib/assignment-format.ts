/**
 * Assignment submission format lock. Shared by the student upload API (issuing
 * signed URLs and recording the submission) and its unit tests. Pure and
 * framework-free.
 *
 *   'pdf'          -> exactly one PDF.
 *   'image'        -> one-to-many images only (e.g. recreate the JEE shape).
 *   'pdf_or_image' -> one PDF, OR one-to-many images (no mixing the two).
 */
export type AssignmentFormat = 'pdf' | 'image' | 'pdf_or_image';

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const PDF_MIME = 'application/pdf';
export const MAX_FILES = 12;
export const MAX_SIZE = 50 * 1024 * 1024; // 50 MB, matches the bucket limit

/** Returns an error string when the files violate the format lock, else null. */
export function validateSubmissionFormat(
  format: AssignmentFormat,
  files: { mime: string; size_bytes?: number }[],
): string | null {
  if (!files.length) return 'Add at least one file.';
  if (files.length > MAX_FILES) return `You can upload at most ${MAX_FILES} files.`;
  for (const f of files) {
    if (f.size_bytes && f.size_bytes > MAX_SIZE) return 'Each file must be under 50 MB.';
  }
  if (format === 'pdf') {
    if (files.length !== 1 || files[0].mime !== PDF_MIME) {
      return 'This assignment accepts a single PDF file.';
    }
    return null;
  }
  if (format === 'image') {
    if (!files.every((f) => IMAGE_MIMES.includes(f.mime))) {
      return 'This assignment accepts photos only (JPG, PNG or WEBP).';
    }
    return null;
  }
  // pdf_or_image
  const pdfs = files.filter((f) => f.mime === PDF_MIME);
  const images = files.filter((f) => IMAGE_MIMES.includes(f.mime));
  if (pdfs.length + images.length !== files.length) {
    return 'Only PDF or image files are allowed.';
  }
  if (pdfs.length > 0) {
    if (files.length !== 1) return 'Upload one PDF, or photos only. Do not mix.';
    return null;
  }
  return null; // images only
}

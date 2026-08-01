/**
 * Which files have to be converted before a student can read them in the app.
 *
 * The secure reader is pdf.js. It renders PDFs and nothing else, and that is not
 * an accident: the reader is what carries the per-student watermark, the
 * right-click and print blocking and the no-download rule. Serving a .pptx
 * straight through would hand the browser a file it can only download, which
 * defeats every one of those protections at once.
 *
 * So an Office file is converted to PDF on the way out (see
 * getSharePointPdfRendition) and everything downstream stays exactly as it is.
 *
 * Pure, and separate from the Graph call, so the classification can be tested
 * without a tenant.
 */

/** MIME types Graph will render as PDF and that we are willing to serve. */
const CONVERTIBLE_MIME = new Set([
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  // Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  // Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // OpenDocument, which Graph also renders
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
]);

/**
 * Extensions, checked when the MIME type is missing or wrong.
 *
 * Worth having: a file LINKED from SharePoint carries whatever mime Graph
 * reported, and an uploaded one carries whatever the browser guessed. Neither is
 * reliable enough on its own, and a deck that silently downloads instead of
 * opening is a bug a teacher would report as "the viewer is broken".
 */
const CONVERTIBLE_EXT = new Set([
  'pptx', 'ppt', 'ppsx',
  'docx', 'doc',
  'xlsx', 'xls',
  'odp', 'odt', 'rtf',
]);

/** The file extension in lower case, without the dot. Empty when there is none. */
export function fileExtension(fileName: string | null | undefined): string {
  const name = (fileName || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Does this file need converting to PDF before the reader can show it?
 *
 * False for PDFs and images, which the reader and the browser already handle.
 */
export function needsPdfRendition(
  fileType: string | null | undefined,
  fileName?: string | null,
): boolean {
  const mime = (fileType || '').toLowerCase().split(';')[0].trim();
  if (mime === 'application/pdf') return false;
  if (mime.startsWith('image/')) return false;
  if (CONVERTIBLE_MIME.has(mime)) return true;
  return CONVERTIBLE_EXT.has(fileExtension(fileName));
}

/**
 * Is this a slide deck, as opposed to a document or a sheet?
 *
 * Only used to pick the icon and the word shown on a card, so it is deliberately
 * generous: getting it wrong shows the wrong icon, nothing more.
 */
export function isPresentation(
  fileType: string | null | undefined,
  fileName?: string | null,
): boolean {
  const mime = (fileType || '').toLowerCase();
  if (mime.includes('presentation') || mime.includes('powerpoint')) return true;
  return ['pptx', 'ppt', 'ppsx', 'odp'].includes(fileExtension(fileName));
}

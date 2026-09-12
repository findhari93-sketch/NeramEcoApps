/**
 * What a teacher is told about a chapter's PowerPoint slides, in one place.
 *
 * Pure, with no server imports, so the chapter page in the browser and the
 * slides API route say exactly the same thing. Every message states the cause
 * and the fix. Modelled on recording-messages.ts, kept separate so the two
 * features can change wording independently.
 *
 * Library-only is a policy, as it is for recordings: Nexus can read a file in
 * a teacher's OneDrive, so the message never claims otherwise.
 */

export type SlidesMessageCode =
  | 'LINK_NOT_RECOGNISED'
  | 'NOT_FOUND'
  | 'NO_ACCESS'
  | 'GRAPH_UNAVAILABLE'
  | 'NOT_A_PRESENTATION'
  | 'SLIDES_IN_ONEDRIVE'
  | 'SOURCE_MISSING'
  | 'RENDITION_UNAVAILABLE'
  | 'TOO_LARGE'
  | 'SAVE_FAILED';

export const SLIDES_MESSAGE_CODES: SlidesMessageCode[] = [
  'LINK_NOT_RECOGNISED',
  'NOT_FOUND',
  'NO_ACCESS',
  'GRAPH_UNAVAILABLE',
  'NOT_A_PRESENTATION',
  'SLIDES_IN_ONEDRIVE',
  'SOURCE_MISSING',
  'RENDITION_UNAVAILABLE',
  'TOO_LARGE',
  'SAVE_FAILED',
];

export function slidesMessage(code: SlidesMessageCode, item?: { name?: string | null }): string {
  const named = item?.name ? `"${item.name}"` : 'This file';
  switch (code) {
    case 'SLIDES_IN_ONEDRIVE':
      return `${named} is in a personal OneDrive. Class slides have to live in the Neram SharePoint library, so they stay available whoever made them. Move it into the library, then pick it again.`;
    case 'NOT_A_PRESENTATION':
      return `${named} is not a PowerPoint file. Pick the .pptx deck for this chapter.`;
    case 'NOT_FOUND':
      return 'This PowerPoint could not be found in SharePoint. It may have been moved or deleted. Find it again in the Neram library.';
    case 'SOURCE_MISSING':
      return 'The PowerPoint is no longer in SharePoint, or was moved somewhere Nexus cannot reach. Students still see the last version. Replace it to update the slides.';
    case 'NO_ACCESS':
      return 'Nexus is not allowed to open this file. Move it into the Neram SharePoint library, then pick it again.';
    case 'RENDITION_UNAVAILABLE':
      return 'SharePoint could not turn this PowerPoint into pages. Open it in PowerPoint, save it again, then press Refresh now.';
    case 'TOO_LARGE':
      return 'These slides are over 50 MB once turned into pages, which is too large to show in the app. In PowerPoint, use Compress Pictures, save, then press Refresh now.';
    case 'LINK_NOT_RECOGNISED':
      return 'That link does not point at a file in SharePoint. Open the deck in SharePoint, choose Copy link, and paste that.';
    case 'SAVE_FAILED':
      return 'Nexus could not save the slides just now. Try again in a moment.';
    default:
      return 'SharePoint did not answer just now. Try again in a moment.';
  }
}

/**
 * Should a teacher be asked to fix this?
 *
 * SharePoint being busy is not something a teacher can act on and it clears on
 * its own, so it never turns a card amber.
 */
export function slidesNeedFix(problem: string | null | undefined): boolean {
  return !!problem && problem !== 'GRAPH_UNAVAILABLE';
}

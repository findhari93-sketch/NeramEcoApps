/**
 * Whether a student reads chapters as the PDF or as the PowerPoint slides,
 * remembered on this device.
 *
 * One choice for every chapter rather than one per chapter: a student who
 * studies from slides tends to do so throughout. A chapter without slides always
 * opens on its PDF and leaves the remembered choice alone.
 *
 * Storage can be missing or throw (private windows, blocked site data), so every
 * read and write is guarded and the PDF is the answer when in doubt.
 */

export type StudyReaderView = 'pdf' | 'slides';

export const READER_MODE_STORAGE_KEY = 'nexus:study-reader-mode';

export function parseReaderMode(value: string | null | undefined): StudyReaderView {
  return value === 'slides' ? 'slides' : 'pdf';
}

export function readReaderMode(): StudyReaderView {
  try {
    return parseReaderMode(window.localStorage.getItem(READER_MODE_STORAGE_KEY));
  } catch {
    return 'pdf';
  }
}

export function writeReaderMode(view: StudyReaderView): void {
  try {
    window.localStorage.setItem(READER_MODE_STORAGE_KEY, view);
  } catch {
    // Remembering is a convenience. The reader works without it.
  }
}

/** Which view a chapter opens on. */
export function initialReaderView(hasSlides: boolean, remembered: StudyReaderView): StudyReaderView {
  return hasSlides ? remembered : 'pdf';
}

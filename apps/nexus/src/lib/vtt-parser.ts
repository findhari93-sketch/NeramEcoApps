/**
 * WebVTT transcript parser
 * Parses VTT text into TranscriptEntry[] for section generation
 */

import type { TranscriptEntry } from '@neram/database';

/** Parse a VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds */
function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m) * 60 + parseFloat(s);
  }
  return 0;
}

/** Strip HTML/VTT formatting tags from text */
function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // HTML tags
    .replace(/\{[^}]+\}/g, '') // SSA/ASS style tags
    .trim();
}

/**
 * Parse WebVTT content into TranscriptEntry[]
 * Handles standard VTT format with timestamps and optional cue identifiers
 */
export function parseVTT(vttText: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Normalize line endings
  const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Skip WEBVTT header and any metadata
  let i = 0;
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Look for timestamp line: "00:05:38.000 --> 00:05:46.000"
    const match = line.match(
      /(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})/
    );

    if (match) {
      const start = parseTimestamp(match[1].replace(',', '.'));
      const end = parseTimestamp(match[2].replace(',', '.'));

      // Collect text lines until empty line or next timestamp
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        const stripped = stripTags(lines[i]);
        if (stripped) textLines.push(stripped);
        i++;
      }

      const text = textLines.join(' ').trim();
      if (text) {
        entries.push({ start, end, text });
      }
    } else {
      i++;
    }
  }

  return entries;
}

/** Format seconds to MM:SS display string */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

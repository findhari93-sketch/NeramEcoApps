/**
 * "Where in the video?" A student reporting a mistake types "2:15"; the
 * teacher reading the report taps it and lands on that moment.
 */
import { extractYouTubeId } from './youtube';

/**
 * Seconds from "2:15", "1:02:03" or "90". Null for a blank box (the field is
 * optional); undefined for something that is not a time, so the form can say so.
 */
export function parseVideoTime(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return undefined;
  const [, h, m, s] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds > 59 || (h !== undefined && minutes > 59)) return undefined;
  return Number(h ?? 0) * 3600 + minutes * 60 + seconds;
}

/** 135 as "2:15", 3723 as "1:02:03". */
export function formatVideoTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** The same video, opening at that second. Only YouTube links can do that. */
export function videoAtTime(url: string, seconds: number): string {
  if (!extractYouTubeId(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('t', `${Math.max(0, Math.floor(seconds))}s`);
    return parsed.toString();
  } catch {
    return url;
  }
}

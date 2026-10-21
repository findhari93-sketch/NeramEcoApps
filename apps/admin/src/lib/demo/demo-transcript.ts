/**
 * Reading a demo's Teams transcript (WEBVTT): the cues for the player beside
 * the recording, and who spoke how much, which is the transcript's half of the
 * evidence that the demo really happened. Pure, safe in client components.
 *
 * Teams writes one cue per utterance with the speaker in a voice tag:
 *
 *   0f6c1a2e-.../17-0
 *   00:03:21.480 --> 00:03:25.920
 *   <v Hari Babu>So the drawing test has three parts.</v>
 */

export interface DemoCue {
  /** Seconds from the start of the transcript. */
  start: number;
  end: number;
  speaker: string | null;
  text: string;
}

export interface DemoSpeaker {
  name: string;
  /** Neram staff, by the names Teams showed for the team. */
  staff: boolean;
  words: number;
  seconds: number;
}

export interface DemoTranscriptStats {
  /** First word to last word, in minutes. */
  minutes: number;
  cues: number;
  speakers: DemoSpeaker[];
  staffWords: number;
  guestWords: number;
}

const TIME = /(\d+):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(ts: string): number {
  const m = ts.match(TIME);
  if (!m) return NaN;
  if (m[1] !== undefined) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
  return Number(m[5]) * 60 + Number(m[6]) + Number(`0.${m[7]}`);
}

/** Every cue with words, in order. Anything that is not a cue (header, NOTE, ids) is skipped. */
export function parseDemoVtt(vtt: string): DemoCue[] {
  const cues: DemoCue[] = [];
  for (const block of vtt.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = seconds(a);
    const end = seconds(b);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const raw = lines.slice(at + 1).join(' ');
    const speaker = raw.match(/<v(?:\.[^\s>]+)?\s+([^>]+)>/)?.[1]?.trim() || null;
    const text = raw
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    // Teams splits one sentence into back-to-back cues; join them so the panel reads in turns.
    const prev = cues[cues.length - 1];
    if (prev && prev.speaker === speaker && start - prev.end < 1.5 && prev.text.length < 400) {
      prev.text = `${prev.text} ${text}`;
      prev.end = end;
    } else {
      cues.push({ start, end, speaker, text });
    }
  }
  return cues;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Who spoke and how much. `staffNames` are the team as Teams named them (attendance and hosts). */
export function demoTranscriptStats(cues: DemoCue[], staffNames: string[]): DemoTranscriptStats {
  const staff = new Set(staffNames.filter(Boolean).map(norm));
  const by = new Map<string, DemoSpeaker>();
  for (const c of cues) {
    const name = c.speaker || 'Unknown speaker';
    const s = by.get(name) ?? { name, staff: staff.has(norm(name)), words: 0, seconds: 0 };
    s.words += c.text.split(/\s+/).filter(Boolean).length;
    s.seconds += Math.max(0, c.end - c.start);
    by.set(name, s);
  }
  const speakers = [...by.values()].sort((a, b) => b.words - a.words);
  const span = cues.length ? cues[cues.length - 1].end - cues[0].start : 0;
  return {
    minutes: Math.round(span / 60),
    cues: cues.length,
    speakers,
    staffWords: speakers.filter((s) => s.staff).reduce((n, s) => n + s.words, 0),
    // An unnamed speaker is not counted for the student: it proves nothing about who was there.
    guestWords: speakers.filter((s) => !s.staff && s.name !== 'Unknown speaker').reduce((n, s) => n + s.words, 0),
  };
}

/** 754.2 -> "12:34", 3725 -> "1:02:05". */
export function cueClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

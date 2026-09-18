/**
 * What an AI is asked when it writes a class transcript from the video.
 *
 * WHY THIS EXISTS. Microsoft Stream cannot transcribe Tamil: it is not on
 * Stream's language list, so a Tamil class comes back as English-sounding
 * nonsense ("the settlements in the Vidalakati"), and checkpoints cut from that
 * test things the tutor never said. A model that watches the video follows the
 * Tamil and English mix, and writing the transcript in English matches the
 * checkpoints, which are always English (see rule 10 in ai-generate.ts).
 *
 * ONE SET OF RULES for both routes: the prompt a teacher copies into Google AI
 * Studio, and the call Nexus makes itself. If the two drifted, a transcript made
 * by hand and one made by Nexus would cut into differently shaped checkpoints.
 *
 * Copy here is read and pasted by teachers, so it keeps the site's punctuation
 * rule: no em dashes and no double dashes (the WEBVTT cue arrow aside).
 */

/**
 * The longest stretch asked for in one AI Studio answer.
 *
 * A two-hour transcript does not fit in one answer, and timestamps drift further
 * the longer the stretch, so a class is done in parts. Sixty-five minutes keeps an
 * ordinary one-hour class in a single part.
 */
export const AI_STUDIO_PART_MAX_SECONDS = 3900;

/** Parts overlap by a minute so no sentence falls between them. */
export const AI_STUDIO_PART_OVERLAP_SECONDS = 60;

export interface TranscriptPart {
  index: number;
  start: number;
  /** 0 when the video length is unknown, meaning "to the end". */
  end: number;
}

export function planAiStudioParts(durationSeconds: number): TranscriptPart[] {
  const duration = Math.max(0, Math.round(durationSeconds || 0));
  if (!duration) return [{ index: 0, start: 0, end: 0 }];

  const count = Math.max(1, Math.ceil(duration / AI_STUDIO_PART_MAX_SECONDS));
  const length = duration / count;
  const parts: TranscriptPart[] = [];
  for (let i = 0; i < count; i++) {
    const end = i === count - 1 ? duration : Math.ceil((i + 1) * length);
    const start = i === 0 ? 0 : parts[i - 1].end - AI_STUDIO_PART_OVERLAP_SECONDS;
    parts.push({ index: i, start, end });
  }
  return parts;
}

/** HH:MM:SS, as the SharePoint and AI Studio players show a position. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function taughtIn(spokenLanguage: string | null | undefined): string {
  return spokenLanguage === 'ta' || spokenLanguage === 'ta_en'
    ? 'The tutor teaches in Tamil mixed with English.'
    : 'The tutor teaches mostly in English and may use some Tamil.';
}

export function transcriptRules(input: {
  spokenLanguage: string | null | undefined;
  /**
   * 'video': count from the start of the whole video, which is what a person in
   * AI Studio can check against the player. 'clip': count from the start of the
   * stretch Nexus sent, for a model that was only shown that stretch.
   */
  timestamps: 'video' | 'clip';
}): string {
  const clock =
    input.timestamps === 'video'
      ? 'Write every timestamp as HH:MM:SS.mmm counted from the start of the whole video, as the video player shows it.'
      : 'Write every timestamp as HH:MM:SS.mmm counted from the start of the part you were given.';

  return `This video is a recorded class from an architecture entrance exam course (NATA and JEE Paper 2). ${taughtIn(input.spokenLanguage)}
Write a transcript of what the tutor says, as a WEBVTT file.

Rules:
1. Write the transcript in English. Translate Tamil into simple, natural English. Keep English words, and every technical, architectural and drawing term, exactly as the tutor said them.
2. Do not summarise, shorten or skip anything that was taught. Leave out long silences.
3. No speaker names, no sound labels such as [music], and no notes or comments of your own.
4. One sentence or short phrase per cue, no longer than about 8 seconds. End a cue where the tutor pauses.
5. Each timestamp must match the moment those words are spoken.
6. ${clock}
7. Reply with the WEBVTT file only. Start with the line WEBVTT and write nothing before or after it. Do not use code fences.`;
}

/** The prompt a teacher copies into Google AI Studio for one part of the video. */
export function buildAiStudioPrompt(input: {
  part: TranscriptPart;
  parts: TranscriptPart[];
  durationSeconds: number;
  spokenLanguage: string | null | undefined;
}): string {
  const { part, parts } = input;
  const rules = transcriptRules({ spokenLanguage: input.spokenLanguage, timestamps: 'video' });

  if (parts.length <= 1) {
    const length = input.durationSeconds > 0 ? ` The video is ${formatClock(input.durationSeconds)} long.` : '';
    return `${rules}\n\nTranscribe the whole video.${length}`;
  }

  const isLast = part.index === parts.length - 1;
  const range = isLast
    ? `from ${formatClock(part.start)} to the end of the video`
    : `from ${formatClock(part.start)} to ${formatClock(part.end)}`;
  return `${rules}\n\nThis is part ${part.index + 1} of ${parts.length}. The video is ${formatClock(input.durationSeconds)} long. Transcribe only ${range}.`;
}

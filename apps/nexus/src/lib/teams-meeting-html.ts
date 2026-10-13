/**
 * The Teams post announcing a scheduled class: one HTML body shared by the
 * channel post and the group-chat post.
 *
 * Lives outside the route so it can be tested (a route file may only export its
 * handlers). Every teacher-typed string is escaped: a title with "<" or "&" used
 * to go into the chatMessage raw, which Teams either mangled or rejected.
 */
import { escapeHtml } from './html-escape';
import { formatDuration } from './prewatch';

/** A "watch before class" video as the post lists it. */
export interface PostPrewatchLink {
  title: string;
  /** Absolute Nexus watch page, so the video plays inside Nexus. */
  url: string;
  durationSeconds?: number | null;
}

/** Tutor and scheduler names, plus any videos to watch first. */
export type PostMeta = {
  tutorName?: string;
  schedulerName?: string;
  prewatch?: PostPrewatchLink[];
};

export function buildMeetingHtml(
  scheduledClass: Record<string, unknown>,
  joinUrl: string,
  rsvpUrl?: string,
  meta?: PostMeta,
): string {
  const desc = (scheduledClass.description as string | null | undefined)?.trim();
  const tutorName = meta?.tutorName?.trim();
  const schedulerName = meta?.schedulerName?.trim();
  const tutorLine = tutorName
    ? `<p>👩‍🏫 <strong>Tutor:</strong> ${escapeHtml(tutorName)}${
        schedulerName && schedulerName !== tutorName
          ? ` &nbsp;·&nbsp; <strong>Scheduled by:</strong> ${escapeHtml(schedulerName)}`
          : ''
      }</p>`
    : '';
  return `<h3>📅 ${escapeHtml(String(scheduledClass.title ?? ''))}</h3>
<p><strong>Date:</strong> ${escapeHtml(String(scheduledClass.scheduled_date ?? ''))}<br/>
<strong>Time:</strong> ${escapeHtml(String(scheduledClass.start_time ?? ''))} to ${escapeHtml(String(scheduledClass.end_time ?? ''))} (IST)</p>
${tutorLine}${desc ? `<p>${escapeHtml(desc).replace(/\n/g, '<br/>')}</p>` : ''}${prewatchBlock(meta?.prewatch)}
<p><a href="${escapeHtml(joinUrl)}">🔗 Join Meeting</a></p>${
    rsvpUrl
      ? `\n<p>✋ Can't make it? <a href="${escapeHtml(rsvpUrl)}">Tap to RSVP</a> (you're marked attending by default).</p>`
      : ''
  }`;
}

/** "Watch before class" list, or nothing when the class has no videos. */
function prewatchBlock(items: PostPrewatchLink[] | undefined): string {
  if (!items?.length) return '';
  const lines = items
    .map((v) => {
      const length = formatDuration(v.durationSeconds);
      return `<li><a href="${escapeHtml(v.url)}">${escapeHtml(v.title)}</a>${length ? ` (${length})` : ''}</li>`;
    })
    .join('');
  return `\n<p>🎬 <strong>Watch before class</strong> (optional, opens in Nexus)</p><ul>${lines}</ul>`;
}

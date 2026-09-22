/**
 * The Answer Pad tab, as Teams stores it.
 *
 * Two paths create it: the configuration page saves it when a teacher adds the
 * pad by hand, and meeting-tab.ts pins it through Graph when Nexus adds the pad
 * to a class meeting. Both read this, so a tab added either way opens the same
 * page and carries the same entity id (which the in-meeting badge targets).
 */

export const ANSWER_PAD_ENTITY_ID = 'answer-pad';
export const ANSWER_PAD_TAB_NAME = 'Answer Pad';

export interface AnswerPadTab {
  entityId: string;
  /** What the meeting side panel loads. */
  contentUrl: string;
  /** Where "open in browser" goes: the room-code page. */
  websiteUrl: string;
  displayName: string;
}

/** The page the "Question N is open" pop-up shows: the student's answer buttons only. */
export function answerPopupUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/pad/teams/answer`;
}

/**
 * The teacher console in its own Teams window (the Pop out button), for a
 * teacher on one screen: a window they can move beside the question they are
 * sharing, which students never see. It opens the running session directly.
 */
export function consolePopOutUrl(origin: string, sessionId: string): string {
  return `${origin.replace(/\/+$/, '')}/pad/teams/console?session=${encodeURIComponent(sessionId)}`;
}

export function answerPadTab(origin: string): AnswerPadTab {
  const base = origin.replace(/\/+$/, '');
  return {
    entityId: ANSWER_PAD_ENTITY_ID,
    contentUrl: `${base}/pad/teams`,
    websiteUrl: `${base}/pad`,
    displayName: ANSWER_PAD_TAB_NAME,
  };
}

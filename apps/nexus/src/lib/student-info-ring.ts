/**
 * The student info ring: its name, its states, and the words it speaks.
 *
 * The ring around a student's avatar is the only thing in Nexus that says who
 * you are looking at without a click: their exam stage, whether they are
 * paused, and which language they speak at home. It reaches roughly 95 screens
 * through one session-wide lookup, so it is worth being able to name.
 *
 * NOTHING here holds its own copy of a colour, a label or a border style. Every
 * field is folded out of lib/student-stage.ts, so the legend that explains the
 * ring cannot drift from the rings it claims to explain, and a new stage shows
 * up in the legend the day it is added.
 *
 * JSX-free on purpose, exactly like student-stage.ts, so a route handler can
 * import it. Icon KEYS, never components: the key to component map is the one
 * job of StageGlyph.tsx.
 */
import {
  DORMANT_EXPLAINER,
  DORMANT_LABEL,
  DORMANT_MEANING,
  STAGE_ICON,
  STAGE_LABEL,
  STAGE_MEANING,
  STAGE_ORDER,
  STAGE_RING_STYLE,
  STAGE_TOOLTIP,
  dormantColor,
  stageColor,
  type StageIconKey,
  type StageKey,
} from './student-stage';

/**
 * What to call it, in copy and in conversation. Before this existed the code
 * called it three different things across the ESLint messages and the comments,
 * and nothing at all on screen, so nobody could ask for it by name and new
 * screens quietly shipped without it.
 */
export const INFO_RING_NAME = 'Student info ring';

/**
 * The ring's test id. Every test used to find the ring by matching its
 * aria-label against a regex copy-pasted into four files. The id is the stable
 * handle; the regex below stays for the cases that need the words themselves.
 */
export const INFO_RING_TESTID = 'info-ring';

/** Dormant is not a stage, so the ring has one more state than the stage list. */
export type InfoRingStateKey = StageKey | 'dormant';
export type InfoRingIconKey = StageIconKey | 'pause';

export interface InfoRingState {
  key: InfoRingStateKey;
  /** The short name, spoken first in the ring's aria-label. */
  label: string;
  /** One scannable line. The legend shows this, not the long explainer. */
  meaning: string;
  /** The full sentence, which is what the per-face tooltip says. */
  explainer: string;
  /** Solid for a recorded stage, dotted for "nobody has said", dashed for paused. */
  borderStyle: 'solid' | 'dotted' | 'dashed';
  icon: InfoRingIconKey;
  /** Paused faces are greyed, so the legend swatch has to be greyed too. */
  faded: boolean;
}

/**
 * Every state the ring can be in, in the order a legend should list them:
 * the stages by priority, then paused, which overrides all of them.
 */
export const INFO_RING_STATES: readonly InfoRingState[] = [
  ...STAGE_ORDER.map((key) => ({
    key,
    label: STAGE_LABEL[key],
    meaning: STAGE_MEANING[key],
    explainer: STAGE_TOOLTIP[key],
    borderStyle: STAGE_RING_STYLE[key],
    icon: STAGE_ICON[key],
    faded: false,
  })),
  {
    key: 'dormant' as const,
    label: DORMANT_LABEL,
    meaning: DORMANT_MEANING,
    explainer: DORMANT_EXPLAINER,
    borderStyle: 'dashed' as const,
    icon: 'pause' as const,
    faded: true,
  },
];

/** The ring's colour for one state. Dormant overrides whatever stage it has. */
export function infoRingColor(key: InfoRingStateKey, mode: 'light' | 'dark'): string {
  return key === 'dormant' ? dormantColor(mode) : stageColor(key, mode);
}

/** The ring's spoken name. Dormant wins, because paused outranks the stage. */
export function infoRingLabel(stage: StageKey, dormant = false): string {
  return dormant ? DORMANT_LABEL : STAGE_LABEL[stage];
}

/**
 * Everything the ring says, built in ONE place.
 *
 * The colon in the aria-label is load-bearing. The stage chip beside the avatar
 * announces the same words ending in a period, so the colon is the only thing
 * that tells a ring and a chip apart, for a screen reader and for every test
 * that looks for a ring. The tooltip deliberately uses a period instead: it is
 * read, not matched.
 *
 * The language sentence goes LAST, never before the stage, because
 * INFO_RING_LABEL_RE anchors on the label at the front.
 */
export function infoRingSpeech(args: {
  stage: StageKey;
  dormant: boolean;
  languageSentence: string | null;
}): { label: string; tooltip: string; ariaLabel: string; title: string } {
  const label = infoRingLabel(args.stage, args.dormant);
  const body = args.dormant ? DORMANT_EXPLAINER : STAGE_TOOLTIP[args.stage];
  const tooltip = `${body}${args.languageSentence ? ` ${args.languageSentence}` : ''}`;
  return { label, tooltip, ariaLabel: `${label}: ${tooltip}`, title: `${label}. ${tooltip}` };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds a ring by the words it speaks, for the cases where a test id will not
 * do: a Playwright sweep that has to prove a face on some other screen is
 * ringed, or a unit test that needs the label and the chip told apart.
 *
 * Built from the labels rather than written out, so renaming a stage cannot
 * leave five stale copies of this behind. It carries no `g` flag on purpose:
 * a shared regex with `g` would keep `lastIndex` between callers.
 */
export const INFO_RING_LABEL_RE = new RegExp(
  `(${[...STAGE_ORDER.map((key) => STAGE_LABEL[key]), DORMANT_LABEL].map(escapeForRegExp).join('|')}):`,
);

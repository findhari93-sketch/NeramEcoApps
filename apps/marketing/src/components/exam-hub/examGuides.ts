/**
 * Guide rails and closing CTAs for the exam hubs that use ExamSpokeLayout
 * (AAT 2026, PGETA 2026). Server-safe: no @neram/ui imports, icons are built
 * with createElement so this stays a plain .ts module.
 */
import { createElement, type ComponentType } from 'react';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { GuideNavProps } from '@/design-system';

export interface ExamSpoke {
  slug: string;
  label: string;
  Icon: ComponentType;
}

export interface ExamGuide {
  /** Hub path, e.g. '/aat-2026'. */
  hubHref: string;
  /** Rail heading, e.g. 'AAT 2026 guide'. */
  navTitle: string;
  spokes: ExamSpoke[];
  /** Closing CtaBand copy (kept from the hub page's final CTA). */
  cta: {
    title: string;
    lede: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string; external?: boolean };
  };
}

export const EXAM_GUIDES: Record<string, ExamGuide> = {
  '/aat-2026': {
    hubHref: '/aat-2026',
    navTitle: 'AAT 2026 guide',
    spokes: [
      { slug: 'schedule', label: 'Schedule and dates', Icon: CalendarTodayOutlinedIcon },
      { slug: 'eligibility', label: 'Eligibility', Icon: CheckCircleOutlineIcon },
      { slug: 'exam-pattern', label: 'Exam pattern', Icon: DashboardOutlinedIcon },
      { slug: 'syllabus', label: 'Syllabus', Icon: MenuBookOutlinedIcon },
      { slug: 'drawing-kit', label: 'Drawing kit checklist', Icon: BrushOutlinedIcon },
      { slug: 'centres', label: 'Examination centres', Icon: LocationOnOutlinedIcon },
      { slug: 'participating-iits', label: 'Participating IITs', Icon: AccountBalanceOutlinedIcon },
      { slug: 'preparation', label: 'Preparation strategy', Icon: TipsAndUpdatesOutlinedIcon },
    ],
    cta: {
      title: 'Preparing for AAT 2026?',
      lede: 'Neram coaches both NATA and AAT aspirants. Our drawing labs and architectural awareness modules cover the AAT pattern end-to-end.',
      primary: { label: 'Talk to a counsellor', href: '/apply' },
      secondary: { label: 'See coaching programs', href: '/courses' },
    },
  },
  '/pgeta-2026': {
    hubHref: '/pgeta-2026',
    navTitle: 'PGETA 2026 guide',
    spokes: [
      { slug: 'schedule', label: 'Schedule, three test dates', Icon: CalendarTodayOutlinedIcon },
      { slug: 'eligibility', label: 'Eligibility', Icon: CheckCircleOutlineIcon },
      { slug: 'exam-pattern', label: 'Exam pattern', Icon: DashboardOutlinedIcon },
      { slug: 'syllabus', label: 'Syllabus', Icon: MenuBookOutlinedIcon },
      { slug: 'fees', label: 'Fees and scholarships', Icon: PaymentsOutlinedIcon },
      { slug: 'participating-institutes', label: 'Participating institutes', Icon: AccountBalanceOutlinedIcon },
      { slug: 'score-validity', label: 'Score validity', Icon: EventAvailableOutlinedIcon },
      { slug: 'preparation', label: 'Preparation strategy', Icon: TipsAndUpdatesOutlinedIcon },
    ],
    cta: {
      title: 'Planning your M.Arch journey?',
      lede: 'Talk to a counsellor about preparing for PGETA, choosing a specialisation, and shortlisting M.Arch institutes.',
      primary: { label: 'Talk to a counsellor', href: '/apply' },
      secondary: { label: 'Register on PGETA portal', href: 'https://www.pgeta.in/', external: true },
    },
  },
};

/** The guide for a hub path, or undefined for hubs without one. */
export function getExamGuide(hubHref: string): ExamGuide | undefined {
  return EXAM_GUIDES[hubHref];
}

/** GuideNav props for a hub, with `spokeSlug` as the current page. */
export function examGuideNav(hubHref: string, spokeSlug?: string): GuideNavProps | undefined {
  const guide = getExamGuide(hubHref);
  if (!guide) return undefined;
  return {
    title: guide.navTitle,
    current: spokeSlug ? `${guide.hubHref}/${spokeSlug}` : guide.hubHref,
    items: [
      { label: 'Overview', href: guide.hubHref, icon: createElement(InfoOutlinedIcon) },
      ...guide.spokes.map((s) => ({ label: s.label, href: `${guide.hubHref}/${s.slug}`, icon: createElement(s.Icon) })),
    ],
  };
}

/**
 * Schedule rows ({ label, date, time }) as Timeline items. Dates that have
 * passed are 'done', the next one is 'now', later ones 'next'. Unparseable
 * dates count as upcoming. Pages are ISR (daily), so this stays current.
 */
export function scheduleTimeline(
  rows: ReadonlyArray<{ label: string; date: string; time?: string }>,
  now: number = Date.now(),
): Array<{ label: string; date: string; note?: string; state: 'done' | 'now' | 'next' }> {
  let nextFound = false;
  return rows.map((row) => {
    const parsed = Date.parse(row.date);
    // A day's milestone stays current until the end of that day.
    const past = !Number.isNaN(parsed) && parsed + 24 * 60 * 60 * 1000 <= now;
    let state: 'done' | 'now' | 'next' = 'next';
    if (past) state = 'done';
    else if (!nextFound) {
      state = 'now';
      nextFound = true;
    }
    return { label: row.label, date: row.date, note: row.time, state };
  });
}

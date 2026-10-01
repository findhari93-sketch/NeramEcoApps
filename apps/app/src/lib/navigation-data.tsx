'use client';

import type { SvgIconComponent } from '@mui/icons-material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';

// ── Tool catalog ─────────────────────────────────────────────────────────────
// One list drives the Tools hub, the sidebar, the breadcrumb on tool pages and
// recently used tools. Add a tool here and it appears everywhere.

export type ToolTrack = 'nata' | 'jee' | 'counseling';
export type ToolStage = 'prepare' | 'score' | 'colleges';

export interface ToolDef {
  id: string;
  /** Full name, used on the hub and in breadcrumbs */
  title: string;
  /** Short name for the sidebar, defaults to title */
  shortTitle?: string;
  /** One benefit-led line, written for a student on a phone */
  description: string;
  href: string;
  Icon: SvgIconComponent;
  track: ToolTrack;
  stage: ToolStage;
  comingSoon?: boolean;
  popular?: boolean;
  /** Extra words students search with */
  keywords?: string[];
}

export const TOOL_CATALOG: ToolDef[] = [
  // NATA
  {
    id: 'nata-cutoff-calculator',
    title: 'Cutoff Calculator',
    description: 'Combine your board marks and NATA score to see your final B.Arch cutoff out of 400.',
    href: '/tools/nata/cutoff-calculator',
    Icon: CalculateOutlinedIcon,
    track: 'nata',
    stage: 'score',
    popular: true,
    keywords: ['marks', 'score', 'aggregate', 'board', '400'],
  },
  {
    id: 'nata-exam-planner',
    title: 'Exam Planner',
    description: 'Choose your NATA sessions and keep every important date in one plan.',
    href: '/tools/nata/exam-planner',
    Icon: EventNoteOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['session', 'dates', 'attempt', 'schedule', 'calendar'],
  },
  {
    id: 'nata-exam-centers',
    title: 'Exam Centers',
    description: 'Find NATA test centers in your city and compare the nearest options.',
    href: '/tools/nata/exam-centers',
    Icon: LocationOnOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['centre', 'city', 'location', 'venue', 'map'],
  },
  {
    id: 'nata-eligibility-checker',
    title: 'Eligibility Checker',
    description: 'Check that your subjects and marks meet the NATA and B.Arch rules.',
    href: '/tools/nata/eligibility-checker',
    Icon: FactCheckOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['eligible', 'criteria', 'coa', 'subjects', 'maths'],
  },
  {
    id: 'nata-image-crop',
    title: 'Photo and Signature Crop',
    shortTitle: 'Image Crop',
    description: 'Resize your photo and signature to the exact size the NATA form accepts.',
    href: '/tools/nata/image-crop',
    Icon: CropOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['photo', 'signature', 'resize', 'upload', 'application form'],
  },
  {
    id: 'nata-cost-calculator',
    title: 'Cost Calculator',
    description: 'Add up exam fees, travel and stay before you book a session.',
    href: '/tools/nata/cost-calculator',
    Icon: AccountBalanceWalletOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['fees', 'budget', 'money', 'travel', 'expense'],
  },
  {
    id: 'nata-question-bank',
    title: 'Question Bank',
    description: 'Practice real NATA questions shared by students, with answers and discussion.',
    href: '/tools/nata/question-bank',
    Icon: QuizOutlinedIcon,
    track: 'nata',
    stage: 'prepare',
    keywords: ['questions', 'practice', 'previous year', 'papers', 'mock'],
  },
  {
    id: 'nata-seat-matrix',
    title: 'Seat Matrix',
    description: 'See B.Arch seats by college and category.',
    href: '/tools/nata/seat-matrix',
    Icon: TableChartOutlinedIcon,
    track: 'nata',
    stage: 'colleges',
    comingSoon: true,
  },
  {
    id: 'nata-college-reviews',
    title: 'College Reviews',
    description: 'Read what current students say about their architecture college.',
    href: '/tools/nata/college-reviews',
    Icon: RateReviewOutlinedIcon,
    track: 'nata',
    stage: 'colleges',
    comingSoon: true,
  },

  // JEE Paper 2
  {
    id: 'jee-rank-predictor',
    title: 'JEE Paper 2 Rank Predictor',
    shortTitle: 'Rank Predictor',
    description: 'Turn your Paper 2 percentile into an expected rank.',
    href: '/tools/jee/rank-predictor',
    Icon: EmojiEventsOutlinedIcon,
    track: 'jee',
    stage: 'score',
    comingSoon: true,
  },
  {
    id: 'jee-seat-matrix',
    title: 'JoSAA Seat Matrix',
    shortTitle: 'Seat Matrix',
    description: 'B.Arch seats at IITs, NITs and SPAs, by category.',
    href: '/tools/jee/seat-matrix',
    Icon: TableChartOutlinedIcon,
    track: 'jee',
    stage: 'colleges',
    comingSoon: true,
  },
  {
    id: 'jee-eligibility-checker',
    title: 'JEE Paper 2 Eligibility',
    shortTitle: 'Eligibility Checker',
    description: 'Check the JEE Main Paper 2 rules for your board and marks.',
    href: '/tools/jee/eligibility-checker',
    Icon: HowToRegOutlinedIcon,
    track: 'jee',
    stage: 'prepare',
    comingSoon: true,
  },

  // Counseling
  {
    id: 'counseling-college-predictor',
    title: 'College Predictor',
    description: 'Shortlist the colleges you can realistically get with your score or rank.',
    href: '/tools/counseling/college-predictor',
    Icon: SchoolOutlinedIcon,
    track: 'counseling',
    stage: 'colleges',
    popular: true,
    keywords: ['colleges', 'admission', 'tnea', 'keam', 'shortlist', 'chances'],
  },
  {
    id: 'counseling-josaa-predictor',
    title: 'JoSAA B.Arch Predictor',
    description: 'Your chances at IITs, NITs, SPAs and GFTIs from real JoSAA closing ranks.',
    href: '/tools/counseling/josaa-predictor',
    Icon: AccountBalanceOutlinedIcon,
    track: 'counseling',
    stage: 'colleges',
    popular: true,
    keywords: ['jee', 'nit', 'iit', 'spa', 'closing rank', 'josaa'],
  },
  {
    id: 'counseling-rank-predictor',
    title: 'Counseling Rank Predictor',
    shortTitle: 'Rank Predictor',
    description: 'Estimate your state counseling rank from your composite score.',
    href: '/tools/counseling/rank-predictor',
    Icon: TrendingUpIcon,
    track: 'counseling',
    stage: 'score',
    keywords: ['rank', 'tnea', 'keam', 'merit'],
  },
  {
    id: 'counseling-insights',
    title: 'Counseling Insights',
    shortTitle: 'Insights',
    description: 'How many applied, how many got seats, and which colleges fill first.',
    href: '/tools/counseling/insights',
    Icon: InsightsOutlinedIcon,
    track: 'counseling',
    stage: 'colleges',
    keywords: ['statistics', 'trends', 'allotment', 'competition'],
  },
  {
    id: 'counseling-coa-checker',
    title: 'COA Approval Checker',
    shortTitle: 'COA Checker',
    description: 'Confirm a college is approved by the Council of Architecture before you apply.',
    href: '/tools/counseling/coa-checker',
    Icon: VerifiedOutlinedIcon,
    track: 'counseling',
    stage: 'colleges',
    keywords: ['approved', 'council of architecture', 'recognised', 'fake'],
  },
];

export const TOOL_TRACKS: { id: ToolTrack; label: string; shortLabel: string; Icon: SvgIconComponent }[] = [
  { id: 'nata', label: 'NATA', shortLabel: 'NATA', Icon: ArchitectureIcon },
  { id: 'jee', label: 'JEE Paper 2', shortLabel: 'JEE', Icon: SquareFootIcon },
  { id: 'counseling', label: 'Counseling', shortLabel: 'Counseling', Icon: SchoolOutlinedIcon },
];

export const TOOL_STAGES: { id: ToolStage; title: string; description: string }[] = [
  {
    id: 'prepare',
    title: 'Get ready for the exam',
    description: 'Plan your sessions, check eligibility and get your documents in order.',
  },
  {
    id: 'score',
    title: 'Know your score and rank',
    description: 'See where your marks put you before counseling opens.',
  },
  {
    id: 'colleges',
    title: 'Choose your college',
    description: 'Compare colleges, check approvals and understand your real chances.',
  },
];

export const TOOLS_HOME_HREF = '/tools/all';

export function trackLabel(track: ToolTrack): string {
  return TOOL_TRACKS.find((t) => t.id === track)?.label ?? track;
}

/** The catalog entry for a pathname, matching nested routes like /question-bank/123 */
export function findToolByPath(pathname: string): ToolDef | undefined {
  return TOOL_CATALOG.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'));
}

export function trackFromPath(pathname: string): ToolTrack | null {
  if (pathname.startsWith('/tools/counseling')) return 'counseling';
  if (pathname.startsWith('/tools/jee')) return 'jee';
  if (pathname.startsWith('/tools/nata')) return 'nata';
  return null;
}

export function toolsForTrack(track: ToolTrack): ToolDef[] {
  return TOOL_CATALOG.filter((t) => t.track === track);
}

// ── Legacy shape, kept for the dashboard quick-access grid ──────────────────

export interface ToolNavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

const toNavItem = (t: ToolDef): ToolNavItem => ({
  title: t.shortTitle ?? t.title,
  href: t.href,
  icon: <t.Icon fontSize="small" />,
  comingSoon: t.comingSoon,
});

export const NATA_TOOLS: ToolNavItem[] = toolsForTrack('nata').map(toNavItem);
export const JEE_TOOLS: ToolNavItem[] = toolsForTrack('jee').map(toNavItem);
export const COUNSELING_TOOLS: ToolNavItem[] = toolsForTrack('counseling').map(toNavItem);

// ── App navigation ──────────────────────────────────────────────────────────

export interface AppNavItem {
  title: string;
  href: string;
  Icon: SvgIconComponent;
}

export const PRIMARY_NAV: AppNavItem[] = [
  { title: 'Home', href: '/dashboard', Icon: HomeOutlinedIcon },
  { title: 'All tools', href: TOOLS_HOME_HREF, Icon: GridViewOutlinedIcon },
];

export const ACCOUNT_NAV: AppNavItem[] = [
  { title: 'My applications', href: '/my-applications', Icon: DescriptionOutlinedIcon },
  { title: 'Saved colleges', href: '/saved-colleges', Icon: FavoriteBorderIcon },
  { title: 'Support', href: '/support', Icon: SupportAgentOutlinedIcon },
  { title: 'Profile', href: '/profile', Icon: PersonOutlineIcon },
];

export interface MobileNavTab {
  label: string;
  href: string;
  Icon: SvgIconComponent;
  /** Paths that also light this tab up */
  matchPrefix?: string;
}

export const MOBILE_NAV_TABS: MobileNavTab[] = [
  { label: 'Home', href: '/dashboard', Icon: HomeOutlinedIcon },
  { label: 'Tools', href: TOOLS_HOME_HREF, Icon: GridViewOutlinedIcon, matchPrefix: '/tools' },
  { label: 'Apply', href: '/my-applications', Icon: DescriptionOutlinedIcon },
  { label: 'Support', href: '/support', Icon: SupportAgentOutlinedIcon },
  { label: 'Profile', href: '/profile', Icon: PersonOutlineIcon },
];

export function isNavActive(pathname: string, href: string, matchPrefix?: string): boolean {
  if (matchPrefix) return pathname === matchPrefix || pathname.startsWith(matchPrefix + '/');
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

// ── Exam date helpers ───────────────────────────────────────────────────────

// NATA 2026 exam dates for countdown
export const NATA_EXAM_DATES = [
  new Date('2026-04-12'), // Session 1
  new Date('2026-06-14'), // Session 2
];

export function getNextExamDate(): Date | null {
  const now = new Date();
  for (const d of NATA_EXAM_DATES) {
    if (d > now) return d;
  }
  return null;
}

export function getDaysUntilExam(): number | null {
  const next = getNextExamDate();
  if (!next) return null;
  const diff = next.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

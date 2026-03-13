'use client';

import {
  DashboardIcon,
  AssignmentIcon,
  SchoolIcon,
  BookIcon,
  StarIcon,
  PersonIcon,
  HomeIcon,
} from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalculateIcon from '@mui/icons-material/Calculate';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CropIcon from '@mui/icons-material/Crop';
import TableChartIcon from '@mui/icons-material/TableChart';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GavelIcon from '@mui/icons-material/Gavel';
import VerifiedIcon from '@mui/icons-material/Verified';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AppsIcon from '@mui/icons-material/Apps';
import DescriptionIcon from '@mui/icons-material/Description';
import InsightsIcon from '@mui/icons-material/Insights';

export interface ToolNavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

export const NATA_TOOLS: ToolNavItem[] = [
  { title: 'Exam Planner', href: '/tools/nata/exam-planner', icon: <CalendarTodayIcon fontSize="small" /> },
  { title: 'Exam Centers', href: '/tools/nata/exam-centers', icon: <LocationOnIcon fontSize="small" /> },
  { title: 'Cutoff Calculator', href: '/tools/nata/cutoff-calculator', icon: <CalculateIcon fontSize="small" /> },
  { title: 'Question Bank', href: '/tools/nata/question-bank', icon: <BookIcon fontSize="small" /> },
  { title: 'Image Crop', href: '/tools/nata/image-crop', icon: <CropIcon fontSize="small" /> },
  { title: 'Eligibility Checker', href: '/tools/nata/eligibility-checker', icon: <CheckCircleOutlineIcon fontSize="small" /> },
  { title: 'Cost Calculator', href: '/tools/nata/cost-calculator', icon: <AccountBalanceWalletIcon fontSize="small" /> },
  { title: 'Seat Matrix', href: '/tools/nata/seat-matrix', icon: <TableChartIcon fontSize="small" />, comingSoon: true },
  { title: 'College Reviews', href: '/tools/nata/college-reviews', icon: <StarIcon fontSize="small" />, comingSoon: true },
];

export const JEE_TOOLS: ToolNavItem[] = [
  { title: 'Rank Predictor', href: '/tools/jee/rank-predictor', icon: <EmojiEventsIcon fontSize="small" />, comingSoon: true },
  { title: 'Seat Matrix', href: '/tools/jee/seat-matrix', icon: <TableChartIcon fontSize="small" />, comingSoon: true },
  { title: 'Eligibility Checker', href: '/tools/jee/eligibility-checker', icon: <CheckCircleOutlineIcon fontSize="small" />, comingSoon: true },
];

export const COUNSELING_TOOLS: ToolNavItem[] = [
  { title: 'Rank Predictor', href: '/tools/counseling/rank-predictor', icon: <TrendingUpIcon fontSize="small" /> },
  { title: 'College Predictor', href: '/tools/counseling/college-predictor', icon: <SchoolIcon fontSize="small" /> },
  { title: 'Insights', href: '/tools/counseling/insights', icon: <InsightsIcon fontSize="small" /> },
  { title: 'COA Checker', href: '/tools/counseling/coa-checker', icon: <VerifiedIcon fontSize="small" /> },
];

export interface GeneralNavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

export const SIDEBAR_BOTTOM_NAV: GeneralNavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: <DashboardIcon fontSize="small" /> },
  { title: 'My Applications', href: '/my-applications', icon: <AssignmentIcon fontSize="small" /> },
  { title: 'Support', href: '/support', icon: <HelpOutlineIcon fontSize="small" /> },
  { title: 'Profile', href: '/profile', icon: <PersonIcon fontSize="small" /> },
];

export interface MobileNavTab {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export const MOBILE_NAV_TABS: MobileNavTab[] = [
  { label: 'Home', href: '/dashboard', icon: <HomeIcon /> },
  { label: 'Tools', href: '/tools/nata/cutoff-calculator', icon: <AppsIcon /> },
  { label: 'Apply', href: '/my-applications', icon: <DescriptionIcon /> },
  { label: 'Support', href: '/support', icon: <HelpOutlineIcon /> },
  { label: 'Profile', href: '/profile', icon: <PersonIcon /> },
];

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

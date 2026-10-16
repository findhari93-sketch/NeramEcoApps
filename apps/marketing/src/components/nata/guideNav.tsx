import type { ReactElement } from 'react';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import type { GuideNavProps } from '@/design-system';
import { spokeMeta } from './data/spokeMeta';

const ICONS: Record<string, () => ReactElement> = {
  'how-to-apply': () => <AssignmentOutlinedIcon />,
  eligibility: () => <CheckCircleOutlineIcon />,
  syllabus: () => <MenuBookOutlinedIcon />,
  'exam-centers': () => <LocationOnOutlinedIcon />,
  'fee-structure': () => <PaymentsOutlinedIcon />,
  'exam-pattern': () => <DashboardOutlinedIcon />,
  'photo-signature-requirements': () => <CameraAltOutlinedIcon />,
  'important-dates': () => <CalendarTodayOutlinedIcon />,
  'scoring-and-results': () => <EmojiEventsOutlinedIcon />,
  'dos-and-donts': () => <RuleOutlinedIcon />,
  'cutoff-calculator': () => <CalculateOutlinedIcon />,
  'drawing-test': () => <BrushOutlinedIcon />,
  'preparation-tips': () => <TipsAndUpdatesOutlinedIcon />,
  'previous-year-papers': () => <HistoryEduOutlinedIcon />,
  'best-books': () => <AutoStoriesOutlinedIcon />,
  'admit-card': () => <BadgeOutlinedIcon />,
};

/** The *Outlined icon element for a NATA 2026 spoke (hub cards, rails), or undefined. */
export function nataSpokeIcon(slug: string): ReactElement | undefined {
  return ICONS[slug]?.();
}

/** The NATA 2026 guide rail (GuideNav props) with `slug` as the current page. */
export function nataGuideNav(slug: string): GuideNavProps {
  return {
    title: 'NATA 2026 guide',
    current: `/nata-2026/${slug}`,
    items: [
      { label: 'Overview', href: '/nata-2026' },
      ...spokeMeta.map((p) => ({ label: p.title, href: `/nata-2026/${p.slug}`, icon: ICONS[p.slug]?.() })),
    ],
  };
}

/** "Also read" tiles for NATA spokes, by slug, with each spoke's one-line description. */
export function nataRelated(slugs: string[]): Array<{ label: string; href: string; desc?: string }> {
  return slugs
    .map((slug) => spokeMeta.find((p) => p.slug === slug))
    .filter((p): p is (typeof spokeMeta)[number] => Boolean(p))
    .map((p) => ({ label: p.title, href: `/nata-2026/${p.slug}`, desc: p.desc }));
}

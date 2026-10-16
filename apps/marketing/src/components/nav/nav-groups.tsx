'use client';

import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CastForEducationOutlinedIcon from '@mui/icons-material/CastForEducationOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { NavAside, NavColumn, NavFooter, NavLink } from './MegaMenuPanel';

// ─── Nav group structure ────────────────────────────────────────────────────

export interface NavGroup {
  key: 'colleges' | 'examHub' | 'counseling' | 'about';
  labelKey: 'colleges' | 'examHubNav' | 'counselingNav' | 'aboutNav';
  icon: React.ReactNode;
  columns: NavColumn[];
  aside?: NavAside;
  footer?: NavFooter;
  /** 'cards': the desktop panel is a single column of icon cards. */
  variant?: 'columns' | 'cards';
  /** Under 1060px of header width the group moves into the More menu. */
  inMore?: boolean;
}

// Desktop shows each group as one MegaMenuPanel; the phone drawer lists every
// link of the group (columns, "more" links, side cards and the footer link).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'colleges',
    labelKey: 'colleges',
    icon: <SchoolOutlinedIcon fontSize="small" />,
    columns: [
      {
        title: 'By state',
        links: [
          { label: 'Tamil Nadu', href: '/colleges/tamil-nadu' },
          { label: 'Karnataka', href: '/colleges/karnataka' },
          { label: 'Maharashtra', href: '/colleges/maharashtra' },
          { label: 'Delhi NCR', href: '/colleges/delhi' },
          { label: 'Kerala', href: '/colleges/kerala' },
          { label: 'Telangana', href: '/colleges/telangana' },
        ],
        more: { label: 'All states', href: '/colleges#explore' },
      },
      {
        title: 'By exam and counselling',
        links: [
          { label: 'NATA colleges', href: '/colleges?exam=NATA#browse' },
          { label: 'JEE Main Paper 2 colleges', href: '/colleges?exam=JEE_PAPER_2#browse' },
          { label: 'TNEA counselling', href: '/colleges/tnea' },
          { label: 'JoSAA counselling', href: '/colleges/josaa' },
          { label: 'KEAM counselling', href: '/counseling/keam-arch' },
          { label: 'KCET counselling', href: '/colleges/counseling/kcet' },
        ],
        more: { label: 'All counselling', href: '/colleges#explore' },
      },
      {
        title: 'Rankings and filters',
        links: [
          { label: 'NIRF Architecture', href: '/colleges/rankings/nirf' },
          { label: 'ArchIndex top rated', href: '/colleges/rankings/archindex' },
          { label: 'COA approved', href: '/colleges/accreditation/coa-approved' },
          { label: 'Government colleges', href: '/colleges/type/government' },
          { label: 'Private colleges', href: '/colleges/type/private' },
          { label: 'Fee under ₹3L', href: '/colleges/fees/below-3-lakhs' },
        ],
        more: { label: 'All fee ranges', href: '/colleges#explore' },
      },
    ],
    aside: {
      title: 'Your tools',
      cards: [
        { label: 'Compare colleges', hint: 'Up to 4, side by side', href: '/colleges/compare', Icon: CompareArrowsIcon, tone: 'primary' },
        { label: 'Saved colleges', hint: 'Your shortlist', href: '/colleges/saved', Icon: FavoriteBorderIcon, tone: 'secondary' },
        { label: 'Browse by city', hint: 'Colleges near you', href: '/colleges#explore', Icon: PlaceOutlinedIcon, tone: 'success' },
        { label: 'College predictor', hint: 'Colleges for your score', href: '/tools/college-predictor', Icon: CalculateOutlinedIcon, tone: 'warning' },
      ],
    },
    footer: {
      lead: 'B.Arch colleges across India',
      text: 'with fees, seats and admission routes.',
      cta: { label: 'Browse all colleges', href: '/colleges#browse' },
    },
  },
  {
    key: 'examHub',
    labelKey: 'examHubNav',
    icon: <MenuBookOutlinedIcon fontSize="small" />,
    columns: [
      {
        title: 'NATA 2026',
        links: [
          { label: 'Eligibility', href: '/nata-2026/eligibility' },
          { label: 'Important Dates', href: '/nata-2026/important-dates' },
          { label: 'Syllabus', href: '/nata-2026/syllabus' },
        ],
        more: { label: 'NATA 2026 Hub', href: '/nata-2026' },
      },
      {
        title: 'JEE Main Paper 2',
        links: [
          { label: 'Paper 2A: B.Arch', href: '/jee-barch-hub#paper-2a' },
          { label: 'Paper 2B: B.Planning', href: '/jee-barch-hub#paper-2b' },
          { label: 'NITs / SPAs / IIITs', href: '/colleges/josaa' },
          { label: 'JEE Paper 2 Prep', href: '/jee-paper-2-preparation' },
        ],
        more: { label: 'JEE B.Arch Hub', href: '/jee-barch-hub' },
      },
      {
        title: 'AAT 2026',
        badge: 'NEW',
        links: [
          { label: 'Eligibility', href: '/aat-2026#eligibility' },
          { label: 'Schedule', href: '/aat-2026#schedule' },
          { label: 'Syllabus (5 sections)', href: '/aat-2026#syllabus' },
          { label: 'Drawing Kit', href: '/aat-2026#drawing-kit' },
        ],
        more: { label: 'AAT 2026 Hub', href: '/aat-2026' },
      },
      {
        title: 'PGETA 2026',
        badge: 'NEW',
        links: [
          { label: 'Eligibility', href: '/pgeta-2026#eligibility' },
          { label: '3 Test Dates', href: '/pgeta-2026#schedule' },
          { label: 'Syllabus (4 modules)', href: '/pgeta-2026#exam-pattern' },
          { label: 'Fees + Scholarships', href: '/pgeta-2026#fees' },
        ],
        more: { label: 'PGETA 2026 Hub', href: '/pgeta-2026' },
      },
    ],
    aside: {
      title: 'Prepare',
      cards: [
        { label: 'NATA Online Coaching', hint: 'Live classes for NATA and JEE', href: '/nata-online-coaching', Icon: CastForEducationOutlinedIcon, tone: 'primary', badge: 'TOP' },
        { label: 'Free Tools & Mocks', hint: 'Practice tests and tools', href: '/tools', Icon: QuizOutlinedIcon, tone: 'success' },
        { label: 'aiArchitek: AI Tools', hint: 'AI help for drawing and design', href: '/aiarchitek', Icon: AutoAwesomeOutlinedIcon, tone: 'secondary' },
      ],
    },
    footer: {
      lead: 'Every B.Arch entrance exam',
      text: 'with dates, eligibility and syllabus.',
      cta: { label: 'NATA vs JEE Paper 2', href: '/counseling/concepts/nata-vs-jee-paper-2' },
    },
  },
  {
    key: 'counseling',
    inMore: true,
    labelKey: 'counselingNav',
    icon: <TrendingUpOutlinedIcon fontSize="small" />,
    columns: [
      {
        title: 'JEE Main Paper 2 route',
        links: [
          { label: 'JoSAA (NIT/IIT/SPA)', href: '/counseling/josaa', badge: 'NEW' },
          { label: 'CSAB Special', href: '/counseling/csab-special' },
          { label: 'CSAB-NEUT (NE & UTs)', href: '/counseling/csab-neut' },
          { label: 'JAC Delhi (IGDTUW)', href: '/counseling/jac-delhi-barch' },
          { label: 'JAC Chandigarh (CCA)', href: '/counseling/jac-chandigarh-barch' },
        ],
      },
      {
        title: 'NATA-only',
        links: [
          { label: 'KEAM (Kerala)', href: '/counseling/keam-arch' },
          { label: 'CEPT University', href: '/counseling/cept-university' },
          { label: 'HSTES (Haryana)', href: '/counseling/hstes-barch' },
          { label: 'DTE Goa (GCA Panaji)', href: '/counseling/dte-goa-barch' },
        ],
      },
      {
        title: 'NATA + JEE P2 accepted',
        links: [
          { label: 'TNEA (Tamil Nadu)', href: '/counseling/tnea-barch' },
          { label: 'MHT-CET (Maharashtra)', href: '/counseling/mht-cet-barch', badge: 'NEW' },
          { label: 'KEA (Karnataka)', href: '/counseling/kea-barch' },
          { label: 'ACPC (Gujarat)', href: '/counseling/acpc-barch' },
          { label: 'AP B.Arch', href: '/counseling/ap-barch' },
          { label: 'TG B.Arch (Telangana)', href: '/counseling/tg-barch' },
          { label: 'UPTAC (Uttar Pradesh)', href: '/counseling/uptac-barch' },
        ],
      },
      {
        title: 'Concepts',
        links: [
          { label: 'Freeze vs Float vs Slide', href: '/counseling/concepts/freeze-float-slide' },
          { label: 'JoSAA vs CSAB', href: '/counseling/concepts/josaa-vs-csab' },
          { label: 'AAT explained', href: '/counseling/concepts/aat-explained' },
          { label: 'NATA vs JEE Paper 2', href: '/counseling/concepts/nata-vs-jee-paper-2' },
          { label: '45% vs 50% PCM rule', href: '/counseling/concepts/eligibility-45-vs-50-rule' },
        ],
      },
    ],
    aside: {
      title: 'Tools',
      cards: [
        { label: 'College Predictor', hint: 'Colleges for your score', href: '/tools/college-predictor', Icon: CalculateOutlinedIcon, tone: 'warning' },
        { label: 'Cutoff Calculator', hint: 'Check where you stand', href: '/tools/cutoff-calculator', Icon: InsightsOutlinedIcon, tone: 'primary' },
      ],
    },
    footer: {
      lead: '28 B.Arch counsellings',
      text: 'grouped by the exam they accept.',
      cta: { label: 'All 28 counsellings', href: '/counseling' },
    },
  },
  {
    key: 'about',
    inMore: true,
    labelKey: 'aboutNav',
    icon: <InfoOutlinedIcon fontSize="small" />,
    variant: 'cards',
    columns: [],
    aside: {
      title: 'Neram Classes',
      cards: [
        { label: 'About Us', hint: 'Who we are and how we teach', href: '/about', Icon: InfoOutlinedIcon, tone: 'primary' },
        { label: 'Course fees', hint: 'Plans and what each includes', href: '/fees', Icon: CurrencyRupeeIcon, tone: 'success' },
        { label: 'Student Reviews', hint: 'What our students say', href: '/testimonials', Icon: StarBorderRoundedIcon, tone: 'secondary' },
        { label: 'Careers', hint: 'Teach or work with us', href: '/careers', Icon: WorkOutlineIcon, tone: 'info' },
        { label: 'Contact', hint: 'Talk to our team', href: '/contact', Icon: MailOutlineIcon, tone: 'warning' },
      ],
    },
  },
];

/** Every link of a group, in reading order, for the phone drawer and the active check. */
export function groupLinks(group: NavGroup): NavLink[] {
  const all: NavLink[] = [
    ...group.columns.flatMap((col) => [
      ...col.links,
      ...(col.more ? [{ ...col.more, badge: col.more.badge ?? col.badge }] : []),
    ]),
    ...(group.aside?.cards ?? []).map(({ label, href, badge }) => ({ label, href, badge })),
    ...(group.footer ? [group.footer.cta] : []),
  ];
  const seen = new Set<string>();
  return all.filter((l) => {
    const k = `${l.href}|${l.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

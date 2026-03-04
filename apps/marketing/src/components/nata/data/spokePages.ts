import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PaymentsIcon from '@mui/icons-material/Payments';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import RuleIcon from '@mui/icons-material/Rule';
import CalculateIcon from '@mui/icons-material/Calculate';
import { m3Primary, m3Secondary, m3Tertiary, m3Neutral } from '@neram/ui';

export interface SpokePage {
  slug: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  tint: string;
  tintDark: string;
  featured: boolean;
}

export const spokePages: SpokePage[] = [
  {
    slug: 'how-to-apply',
    title: 'How to Apply',
    desc: 'Step-by-step NATA 2026 application guide',
    icon: AssignmentIcon,
    tint: m3Primary[90],
    tintDark: m3Primary[40],
    featured: true,
  },
  {
    slug: 'eligibility',
    title: 'Eligibility',
    desc: 'Who can appear and who can get admission',
    icon: CheckCircleIcon,
    tint: m3Secondary[90],
    tintDark: m3Secondary[40],
    featured: true,
  },
  {
    slug: 'syllabus',
    title: 'Syllabus',
    desc: 'Complete NATA 2026 syllabus breakdown',
    icon: MenuBookIcon,
    tint: m3Tertiary[90],
    tintDark: m3Tertiary[40],
    featured: false,
  },
  {
    slug: 'exam-centers',
    title: 'Exam Centers',
    desc: 'Find NATA test centers near you',
    icon: LocationOnIcon,
    tint: m3Secondary[90],
    tintDark: m3Secondary[40],
    featured: false,
  },
  {
    slug: 'fee-structure',
    title: 'Fee Structure',
    desc: 'NATA 2026 registration and exam fees',
    icon: PaymentsIcon,
    tint: m3Tertiary[90],
    tintDark: m3Tertiary[40],
    featured: false,
  },
  {
    slug: 'exam-pattern',
    title: 'Exam Pattern',
    desc: 'Paper structure, marking scheme & format',
    icon: DashboardIcon,
    tint: m3Primary[90],
    tintDark: m3Primary[40],
    featured: true,
  },
  {
    slug: 'photo-signature-requirements',
    title: 'Photo & Signature',
    desc: 'Specifications for uploads and ID',
    icon: CameraAltIcon,
    tint: m3Neutral[90],
    tintDark: m3Neutral[40],
    featured: false,
  },
  {
    slug: 'important-dates',
    title: 'Important Dates',
    desc: 'Registration, exam, and result dates',
    icon: CalendarTodayIcon,
    tint: m3Tertiary[90],
    tintDark: m3Tertiary[40],
    featured: false,
  },
  {
    slug: 'scoring-and-results',
    title: 'Scoring',
    desc: 'How NATA scores are calculated',
    icon: EmojiEventsIcon,
    tint: m3Tertiary[90],
    tintDark: m3Tertiary[40],
    featured: false,
  },
  {
    slug: 'dos-and-donts',
    title: "Do's & Don'ts",
    desc: 'What to carry and avoid on exam day',
    icon: RuleIcon,
    tint: m3Secondary[90],
    tintDark: m3Secondary[40],
    featured: false,
  },
  {
    slug: 'cutoff-calculator',
    title: 'Cutoff Calculator',
    desc: 'Estimate your chances at top colleges',
    icon: CalculateIcon,
    tint: m3Primary[90],
    tintDark: m3Primary[40],
    featured: false,
  },
];

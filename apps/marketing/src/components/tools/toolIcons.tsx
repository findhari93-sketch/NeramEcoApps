import type { ReactElement } from 'react';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';

/** One outlined icon per public tool (/tools/[slug]), for tool cards and the hub. */
const TOOL_ICONS: Record<string, () => ReactElement> = {
  'ai-chatbot': () => <SmartToyOutlinedIcon />,
  'coa-checker': () => <VerifiedOutlinedIcon />,
  'college-predictor': () => <SchoolOutlinedIcon />,
  'cost-calculator': () => <CurrencyRupeeOutlinedIcon />,
  'counseling-insights': () => <InsightsOutlinedIcon />,
  'cutoff-calculator': () => <CalculateOutlinedIcon />,
  'eligibility-checker': () => <RuleOutlinedIcon />,
  'exam-centers': () => <LocationOnOutlinedIcon />,
  'exam-planner': () => <EventNoteOutlinedIcon />,
  'image-resizer': () => <CropOutlinedIcon />,
  'josaa-barch-predictor': () => <AccountBalanceOutlinedIcon />,
  'question-bank': () => <QuizOutlinedIcon />,
  'rank-predictor': () => <LeaderboardOutlinedIcon />,
};

export function toolIcon(slug: string): ReactElement {
  return (TOOL_ICONS[slug] ?? (() => <BuildOutlinedIcon />))();
}

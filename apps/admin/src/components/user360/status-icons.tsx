'use client';

import type { ElementType } from 'react';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import FiberNewOutlinedIcon from '@mui/icons-material/FiberNewOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import MergeTypeOutlinedIcon from '@mui/icons-material/MergeTypeOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import type { LifecycleStage, EngagementState } from '@neram/database';
import type { TimelineTone } from '@/lib/user360-view';

export const LIFECYCLE_ICONS: Record<LifecycleStage, ElementType> = {
  prospect: PersonOutlineIcon,
  lead: ContactPhoneOutlinedIcon,
  applicant: AssignmentOutlinedIcon,
  enrolled: HowToRegOutlinedIcon,
  active_student: SchoolOutlinedIcon,
  paused: PauseCircleOutlineIcon,
  alumni: WorkspacePremiumOutlinedIcon,
  archived: Inventory2OutlinedIcon,
};

export const LIFECYCLE_TONES: Record<LifecycleStage, TimelineTone> = {
  prospect: 'neutral',
  lead: 'info',
  applicant: 'primary',
  enrolled: 'success',
  active_student: 'success',
  paused: 'warning',
  alumni: 'primary',
  archived: 'neutral',
};

export const ENGAGEMENT_ICONS: Record<EngagementState, ElementType> = {
  new: FiberNewOutlinedIcon,
  engaged: TrendingUpIcon,
  low: TrendingFlatIcon,
  inactive: TrendingDownIcon,
  dormant: BedtimeOutlinedIcon,
};

export const ENGAGEMENT_TONES: Record<EngagementState, TimelineTone> = {
  new: 'info',
  engaged: 'success',
  low: 'warning',
  inactive: 'neutral',
  dormant: 'neutral',
};

export const TIMELINE_ICONS: Record<string, ElementType> = {
  event: BoltOutlinedIcon,
  sign_in: LoginOutlinedIcon,
  payment: PaymentsOutlinedIcon,
  demo: VideocamOutlinedIcon,
  change: EditOutlinedIcon,
  note: StickyNote2OutlinedIcon,
  call: PhoneInTalkOutlinedIcon,
  message: ChatOutlinedIcon,
  enrollment: SchoolOutlinedIcon,
  classification: LabelOutlinedIcon,
  feedback: RateReviewOutlinedIcon,
  merge: MergeTypeOutlinedIcon,
  account: PersonAddAltOutlinedIcon,
};

export function timelineIcon(kind: string): ElementType {
  return TIMELINE_ICONS[kind] || CircleOutlinedIcon;
}

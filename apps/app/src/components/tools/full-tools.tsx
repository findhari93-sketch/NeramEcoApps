'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { PendingInput } from '@/lib/tools/pending-input';
import type { ToolId } from '@/lib/tools/tool-ids';
import ToolSkeleton from './ToolSkeleton';

export interface FullToolProps {
  /** What the visitor typed into the demo before signing in, if anything. */
  initialInput?: PendingInput | null;
}

/**
 * The signed-in tools. Each is its own chunk, downloaded only when a signed-in
 * student opens that tool, so public visitors never load them. (next/dynamic
 * needs its options written inline, hence the repetition.)
 */
export const FULL_TOOLS: Record<ToolId, ComponentType<FullToolProps>> = {
  'nata-cutoff-calculator': dynamic(() => import('@/features/tools/cutoff-calculator/CutoffCalculatorFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-exam-centers': dynamic(() => import('@/features/tools/exam-centers/ExamCentersFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-eligibility-checker': dynamic(() => import('@/features/tools/eligibility-checker/EligibilityCheckerFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-cost-calculator': dynamic(() => import('@/features/tools/cost-calculator/CostCalculatorFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-image-crop': dynamic(() => import('@/features/tools/image-crop/ImageCropFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-exam-planner': dynamic(() => import('@/components/exam-planner/ExamPlannerContent'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'nata-question-bank': dynamic(() => import('@/features/tools/question-bank/QuestionBankFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'counseling-college-predictor': dynamic(() => import('@/features/tools/college-predictor/CollegePredictorFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'counseling-josaa-predictor': dynamic(() => import('@/features/tools/josaa-predictor/JosaaPredictorFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'counseling-rank-predictor': dynamic(() => import('@/features/tools/rank-predictor/RankPredictorFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'counseling-insights': dynamic(() => import('@/features/tools/insights/InsightsFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
  'counseling-coa-checker': dynamic(() => import('@/features/tools/coa-checker/CoaCheckerFull'), { ssr: false, loading: () => <ToolSkeleton /> }),
};

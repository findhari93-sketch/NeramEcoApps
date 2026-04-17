export { cutoffCalculatorConfig } from './cutoff-calculator';
export { collegePredictorConfig } from './college-predictor';
export { examCentersConfig } from './exam-centers';
export { questionBankConfig } from './question-bank';
export { rankPredictorConfig } from './rank-predictor';
export { eligibilityCheckerConfig } from './eligibility-checker';
export { examPlannerConfig } from './exam-planner';
export { coaCheckerConfig } from './coa-checker';
export { costCalculatorConfig } from './cost-calculator';
export { counselingInsightsConfig } from './counseling-insights';

import { cutoffCalculatorConfig } from './cutoff-calculator';
import { collegePredictorConfig } from './college-predictor';
import { examCentersConfig } from './exam-centers';
import { questionBankConfig } from './question-bank';
import { rankPredictorConfig } from './rank-predictor';
import { eligibilityCheckerConfig } from './eligibility-checker';
import { examPlannerConfig } from './exam-planner';
import { coaCheckerConfig } from './coa-checker';
import { costCalculatorConfig } from './cost-calculator';
import { counselingInsightsConfig } from './counseling-insights';
import type { ToolConfig, ToolCardData } from '../types';

export const ALL_TOOLS: ToolConfig[] = [
  cutoffCalculatorConfig,
  rankPredictorConfig,
  questionBankConfig,
  examCentersConfig,
  eligibilityCheckerConfig,
  examPlannerConfig,
  collegePredictorConfig,
  coaCheckerConfig,
  costCalculatorConfig,
  counselingInsightsConfig,
];

export const TOOL_BY_SLUG: Record<string, ToolConfig> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.slug, t])
);

export const TOOL_CARDS: ToolCardData[] = ALL_TOOLS.map((t) => ({
  slug: t.slug,
  title: t.title,
  description: t.metaDescription,
  category: t.category,
}));

export { cutoffCalculatorConfig } from './cutoff-calculator';
export { collegePredictorConfig } from './college-predictor';
export { examCentersConfig } from './exam-centers';
export { questionBankConfig } from './question-bank';

import { cutoffCalculatorConfig } from './cutoff-calculator';
import { collegePredictorConfig } from './college-predictor';
import { examCentersConfig } from './exam-centers';
import { questionBankConfig } from './question-bank';
import type { ToolConfig, ToolCardData } from '../types';

export const ALL_TOOLS: ToolConfig[] = [
  cutoffCalculatorConfig,
  collegePredictorConfig,
  examCentersConfig,
  questionBankConfig,
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

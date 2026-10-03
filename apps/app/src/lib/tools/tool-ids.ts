/**
 * Ids of the live tools that have a public page. They match TOOL_CATALOG ids in
 * navigation-data.tsx (a unit test keeps the two in step).
 */
export const LIVE_TOOL_IDS = [
  'nata-cutoff-calculator',
  'nata-exam-centers',
  'nata-eligibility-checker',
  'nata-cost-calculator',
  'nata-image-crop',
  'nata-exam-planner',
  'nata-question-bank',
  'counseling-college-predictor',
  'counseling-josaa-predictor',
  'counseling-rank-predictor',
  'counseling-insights',
  'counseling-coa-checker',
] as const;

export type ToolId = (typeof LIVE_TOOL_IDS)[number];

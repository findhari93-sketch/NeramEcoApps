'use client';

import { useEffect, useRef } from 'react';
import { trackFunnelEvent } from '@/lib/funnel-tracker';

/**
 * Slugs for the tool_opened event. Where a tool also logs server-side usage
 * (logToolUsage, which emits tool_completed), the slug matches its tool_name so
 * opened and completed line up in one funnel.
 */
export type ToolSlug =
  | 'college_predictor_counseling'
  | 'rank_predictor'
  | 'josaa_predictor'
  | 'exam_center_locator'
  | 'counseling_insights'
  | 'coa_checker'
  | 'nata_cutoff_calculator'
  | 'nata_cost_calculator'
  | 'nata_eligibility_checker';

/**
 * Emit tool_opened once when a tool page mounts. The ref keeps React's
 * development double-mount from counting twice. tool_completed is emitted
 * server-side by logToolUsage, so it is not sent from here.
 */
export function useToolOpened(tool: ToolSlug): void {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackFunnelEvent({ funnel: 'tool', event: 'tool_opened', status: 'started', metadata: { tool } });
  }, [tool]);
}

import { getCollegeTool } from './get-college';
import { searchCollegesTool } from './search-colleges';
import { compareCollegesTool } from './compare-colleges';
import { getMyStatusTool, prepareCallbackTool, prepareDemoBookingTool, prepareDemoCancelTool } from './booking-tools';
import { prepareApplicationSubmitTool, saveApplicationDetailsTool } from './application-tools';
import {
  prepareCentreVisitTool,
  prepareCollegeEnquiryTool,
  prepareMessageTool,
  prepareSaveCollegeTool,
  prepareTicketTool,
} from './quick-forms';
import { getPaymentStatusTool } from './payment-tools';
import { GUEST_CONTEXT, type ToolContext, type ToolName, type ToolResult } from './types';

const TOOL_TIMEOUT_MS = 3000;
/**
 * Saving application answers reads the draft, may look up a PIN code (1.5s
 * cap) and then writes. Cutting it off mid-write would tell the model "failed"
 * for an answer that was saved, so it gets longer.
 */
const SLOW_TOOLS: Partial<Record<ToolName, number>> = { save_application_details: 6000 };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    p,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext = GUEST_CONTEXT
): Promise<ToolResult> {
  const runner = (async (): Promise<ToolResult> => {
    switch (name as ToolName) {
      case 'get_college':
        return getCollegeTool(args as any);
      case 'search_colleges':
        return searchCollegesTool(args as any);
      case 'compare_colleges':
        return compareCollegesTool(args as any);
      case 'prepare_demo_booking':
        return prepareDemoBookingTool(args as any, ctx);
      case 'prepare_demo_cancel':
        return prepareDemoCancelTool(args as any, ctx);
      case 'prepare_callback':
        return prepareCallbackTool(args as any, ctx);
      case 'get_my_status':
        return getMyStatusTool(ctx);
      case 'save_application_details':
        return saveApplicationDetailsTool(args as any, ctx);
      case 'prepare_application_submit':
        return prepareApplicationSubmitTool(ctx);
      case 'prepare_centre_visit':
        return prepareCentreVisitTool(args as any, ctx);
      case 'prepare_college_enquiry':
        return prepareCollegeEnquiryTool(args as any, ctx);
      case 'prepare_message':
        return prepareMessageTool(args as any);
      case 'prepare_ticket':
        return prepareTicketTool(args as any);
      case 'prepare_save_college':
        return prepareSaveCollegeTool(args as any);
      case 'get_payment_status':
        return getPaymentStatusTool(ctx);
      default:
        return { ok: false, error: 'unknown_tool' };
    }
  })();

  const result = await withTimeout(runner, SLOW_TOOLS[name as ToolName] ?? TOOL_TIMEOUT_MS);
  if (result === 'timeout') return { ok: false, error: 'timeout' };
  return result;
}

export type ToolName =
  | 'get_college'
  | 'search_colleges'
  | 'compare_colleges'
  | 'prepare_demo_booking'
  | 'prepare_demo_cancel'
  | 'prepare_callback'
  | 'get_my_status'
  | 'save_application_details'
  | 'prepare_application_submit'
  | 'prepare_centre_visit'
  | 'prepare_college_enquiry'
  | 'prepare_message';

/**
 * `card` is a [[book:...]] line the chat route attaches to the answer. It is
 * taken off the result before the model sees it, so the model can never edit
 * or invent one: the card always says exactly what the tool checked.
 */
export type ToolSuccess<T> = { ok: true; data: T; card?: string };
export type ToolFailure = { ok: false; error: string; slug?: string; [detail: string]: unknown };
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

/**
 * Who is chatting, from a verified Firebase token only (never the request
 * body). The booking tools read the visitor's own records with it; nothing a
 * tool does writes anything.
 */
export interface ToolContext {
  /** Supabase users.id, or null for a guest. */
  userId: string | null;
  /** The account's name, if it has a real one. */
  name: string | null;
  phoneVerified: boolean;
  /**
   * The account's phone and email, server side only: copied onto the
   * application draft, never put in a tool result or the prompt.
   */
  phone?: string | null;
  email?: string | null;
  now?: Date;
}

export const GUEST_CONTEXT: ToolContext = { userId: null, name: null, phoneVerified: false };

export interface PrepareCentreVisitArgs {
  centre?: string;
  date?: string;
  time?: string;
  purpose?: string;
}

export interface PrepareCollegeEnquiryArgs {
  college_slug?: string;
  message?: string;
}

export interface PrepareMessageArgs {
  subject?: string;
  message?: string;
}

export interface PrepareDemoBookingArgs {
  date?: string;
  window?: string;
  student_name?: string;
  exam_year?: number;
  parent_joining?: boolean;
}

export interface PrepareDemoCancelArgs {
  reason?: string;
}

export interface PrepareCallbackArgs {
  date?: string;
  slot?: string;
  topic?: string;
}

export interface GetCollegeArgs {
  slug: string;
}

export interface SearchCollegesArgs {
  q?: string;
  state?: string;
  city?: string;
  type?: 'government' | 'private' | 'aided' | 'deemed';
  counseling_system?: string;
  coa_approved?: boolean;
  naac_grade?: string;
  accepted_exam?: string;
  fee_max?: number;
  neram_tier?: string;
  sort_by?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name' | 'placement_high' | 'naac_grade';
  limit?: number;
}

export interface CompareCollegesArgs {
  slugs: string[];
}

export interface CollegeCard {
  name: string;
  slug: string;
  url: string;
  city: string | null;
  state: string | null;
  type: string | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  coa_approved: boolean | null;
  naac_grade: string | null;
  nirf_rank: number | null;
  neram_tier: string | null;
  total_barch_seats: number | null;
  accepted_exams: string[] | null;
}

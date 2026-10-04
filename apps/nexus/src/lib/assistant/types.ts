/**
 * Shared shapes for the Neram Assistant brain. Pure types, no imports from
 * Supabase or React, so both the server and the panel can use them.
 */

export type Channel = 'nexus' | 'teams';
export type Mode = 'general' | 'exam';
export type Audience = 'student' | 'staff' | 'both';
export type ToolKind = 'read' | 'action';

export interface AssistantCaller {
  id: string;
  name: string | null;
  user_type: string | null;
  staff_role: string | null;
  can_teach: boolean | null;
  /** True when a teacher is viewing as this student. Reads allowed, actions refused. */
  impersonating: boolean;
}

export interface PageContext {
  path: string;
  classroomId?: string | null;
  classId?: string | null;
}

export interface ToolLink {
  label: string;
  url: string;
}

/** A chip the person can tap. `send` is the text posted back when tapped. */
export interface Suggestion {
  label: string;
  send: string;
}

export interface ActionProposal {
  id: string;
  kind: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  confirmToken: string;
  expiresAt: string;
}

export interface ToolResult {
  ok: boolean;
  /** Templated sentence for the deterministic path. The LLM path (M2) reads `data`. */
  reply?: string;
  data?: unknown;
  error?: string;
  links?: ToolLink[];
  suggest?: Suggestion[];
  action?: ActionProposal;
}

/**
 * Student features the assistant opens doors to, read with the gate (Ruling 25).
 * With one off, the tools, flows, chips and brief lines that lead into it are dropped.
 */
export interface AssistantFeatures {
  sketchbook: boolean;
  attendance: boolean;
  tests: boolean;
  /** Gates every exam tool: they read the question bank. */
  questionBank: boolean;
  inspiration: boolean;
}

export interface ToolContext {
  caller: AssistantCaller;
  channel: Channel;
  mode: Mode;
  /** Untyped admin client: the assistant tables are not in database.generated.ts. */
  supabase: any;
  /** The student's newest active classroom, resolved once per turn. */
  classroomId: string | null;
  threadId: string | null;
  now: Date;
  baseUrl: string;
  features: AssistantFeatures;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDef<A = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JsonSchema;
  audience: Audience;
  kind: ToolKind;
  /** Exam-knowledge tools set 'exam'. Absent means general. */
  mode?: Mode;
  /** The student feature this tool leads into. Dropped while that feature is off (Ruling 25). */
  feature?: keyof AssistantFeatures;
  run(ctx: ToolContext, args: A): Promise<ToolResult>;
}

/** An action tool proposes in `run` and writes in `execute`. */
export interface ActionToolDef<A = Record<string, unknown>> extends ToolDef<A> {
  kind: 'action';
  execute(ctx: ToolContext, args: A): Promise<ToolResult>;
}

export interface Envelope {
  reply: string;
  suggestions: Suggestion[];
  links: ToolLink[];
  action: ActionProposal | null;
  mode: Mode;
  threadId: string;
  /** Set by the flows so the panel can show the attach button at the right step. */
  wantsAttachment?: boolean;
}

export interface Attachment {
  original_image_url: string;
  thumbnail_url: string | null;
}

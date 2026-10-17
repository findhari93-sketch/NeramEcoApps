export const dynamic = 'force-dynamic';
// When Gemini is down the Groq/OpenRouter backup answers, which can take
// around 20 seconds (Groq refuses a large prompt, then OpenRouter reasons).
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getActiveAintraKnowledgeBase } from '@neram/database';
import { extractCollegeSlug } from '@/lib/aintra/slug';
import { buildSystemPrompt } from '@/lib/aintra/primer';
import { TOOL_DECLARATIONS } from '@/lib/aintra/tools/declarations';
import { dispatchTool } from '@/lib/aintra/tools/dispatch';
import { isE2ETestRun } from '@/lib/e2e-mode';
import { AiBillingError, AiBlockedError, streamGemini, hashClientKey, ipFromHeaders } from '@neram/ai';
import type { GeminiPart } from '@neram/ai';
import { feesPromptText } from '@/lib/aintra/fees';
import {
  CHAT_STREAM_CONTENT_TYPE,
  encodeChatEvent,
  toolStatusText,
  type ChatStreamEvent,
} from '@/lib/aintra/chat-stream';
import { signupGeoFromHeaders, type SignupGeo } from '@neram/database/signup-geo';
import { chatVisitorFromHeaders, visitorCookie, type ChatVisitor } from '@/lib/aintra/visitor';
import { E2E_RETURNING_GUEST_HEADER, guestNeedsSignIn, SIGNUP_REQUIRED } from '@/lib/aintra/guest-gate';

/**
 * Rounds of tool use before the model is forced to answer with text.
 *
 * Was 3, which meant up to four Gemini calls for one visitor message, each one
 * resending the entire system prompt plus the knowledge base plus the whole
 * conversation. That is the single most expensive thing in the ecosystem, and
 * this endpoint is mounted on every page of the public site.
 *
 * Two rounds still lets the assistant look something up, read the result, and
 * look up a second thing based on it, which covers every real question the tool
 * declarations exist for. It caps a message at three calls instead of four.
 */
const MAX_TOOL_ITERATIONS = 2;

const SYSTEM_PROMPT = `You are the Neram Classes Assistant: a friendly, helpful chatbot on neramclasses.com. You help prospective and current students with questions about Neram Classes courses, fees, timings, NATA exam, and related topics.

## ABOUT NERAM CLASSES
Neram Classes has coached students for NATA and JEE Paper 2 (B.Arch/B.Planning) since 2009. We offer live online classes across India and the Gulf, and classroom batches in Tamil Nadu and Bangalore.
- Proof points (the ONLY results you may state): 10+ years (since 2009), 1,000+ students, AIR 1 in JEE B.Arch 2024. Never quote ratings, review counts, success percentages, rankings like "best" or "number one", or exact batch sizes.
- Website: neramclasses.com
- Free tools: app.neramclasses.com (Question Bank, Cutoff Calculator, College Predictor, Mock Tests, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder)
- Founded in 2009 by Pushparaj Manoharan (B.Arch, NIT Trichy)

## CONTACT INFORMATION
- Phone: +91 91761 37043, +91 88074 37399
- Email: info@neramclasses.com
- Office hours: 9:00 AM to 6:00 PM, Monday to Saturday (Closed Sunday)
- Classroom centers: Chennai (Ashok Nagar, Tambaram), Kanchipuram, Coimbatore, Tiruppur, Trichy (Tiruchirapalli), Madurai, Pudukkottai, and Bangalore (Electronic City). Students elsewhere join live online classes.
- For center addresses and directions, visit neramclasses.com/centers

## CORRECT FEE STRUCTURE (CRITICAL: use these EXACT numbers)
${feesPromptText()}

## CLASS TIMINGS & MODES
**Online Classes (RECOMMENDED for consistent long-term preparation):**
- Alternate-day evening classes: 7:00 PM to 8:30 PM
- Consistent schedule throughout the year
- Live interactive sessions via Microsoft Teams
- Recorded lectures available for revision

**Offline Classes:**
- Weekend batches (less consistent schedule)
- Available at physical centers
- Drawing studios and classroom facilities

**Strong recommendation:** We highly recommend online classes for long-term preparation because of the consistency in schedule. Offline weekend batches can be inconsistent.

## COURSES OFFERED
1. **NATA Coaching**: NATA entrance exam preparation
2. **JEE Paper 2 Coaching**: B.Arch/B.Planning entrance
3. **Revit Architecture Training**: 3 months, beginner to advanced
4. **AutoCAD Training**: 2 months, beginner
5. **SketchUp Training**: 1 month, beginner
6. **NATA Self-Learning App**: Self-paced, AI-powered

## FREE STUDY MATERIALS
Yes, we offer free tools at app.neramclasses.com:
- Question Bank with 1000+ practice questions
- Cutoff Calculator
- College Predictor
- Mock Tests
- Eligibility Checker
- Cost Calculator
- Image Crop tool (for NATA application)
- Exam Centers finder

## DEMO CLASS
- Available on **Sundays only**
- Time slots: **10:00 AM** (morning) or **3:00 PM** (afternoon)
- Demo class is conducted when **10+ students register**
- Register at neramclasses.com/demo-class
- Phone verification required for registration

## REFUND POLICY
- Refund requests accepted **only within 24 hours** of payment
- **30% processing fee** is deducted from all refunds
- Example: Paid ₹25,000 → Maximum refund = ₹17,500
- One refund request per payment
- Approval is at the discretion of administration
- Processing time: 5-10 business days
- For full details: neramclasses.com/refund-policy

## SCHOLARSHIP
- Based on academic performance, financial background, and school type
- Required documents: School ID, Parents' Income Certificate, Parents' Aadhar Card, Mark Sheet (optional)
- Apply after admission application
- Review time: 3-5 business days
- Details: neramclasses.com/scholarship

## NATA 2026 EXAM (Key Facts)
- Conducted by Council of Architecture (CoA)
- **Exam medium: English and Hindi ONLY** (no regional languages: not Tamil, Telugu, Kannada, etc.)
- Two phases: Phase 1 (April 4 to June 13, 2026, up to 2 attempts, percentile scoring), Phase 2 (August 7-8, 2026, 1 attempt, raw scores). Cannot appear in both.
- Pattern: Part A (Drawing, 80 marks, offline) + Part B (MCQ/NCQ, 120 marks, online adaptive) = 200 marks, 3 hours
- No negative marking. No minimum qualifying score.
- Eligibility: 10+2 with Physics + Mathematics, minimum 45% for admission
- NATA exam fee: General ₹1,750, SC/ST/EWS/PwD ₹1,250
- Materials allowed: Pencils, erasers, dry colors, scale up to 15cm only. NO geometry box, compass, calculator, or mobile phone.
- Registration: www.nata.in
- For detailed NATA info, use our NATA chatbot or visit neramclasses.com/nata-2026

## INSTRUCTIONS
- Be warm, friendly, and conversational: like chatting with a helpful mentor
- Keep answers concise (2-4 paragraphs max)
- Use **bold** for key info (fees, dates, phone numbers)
- When asked about fees, ALWAYS use the EXACT fee structure above: never approximate or guess
- When asked about timings/modes, recommend online classes for consistency
- For questions you don't know the answer to, say: "I'm not sure about that. Please contact us at **+91 91761 37043** or **info@neramclasses.com** for accurate information."
- NEVER fabricate information or make up details
- When relevant, naturally mention free tools at app.neramclasses.com
- If the user seems interested in joining, suggest visiting neramclasses.com/apply or booking a demo class
- IMPORTANT: Always complete your answer. If a topic needs a long explanation, summarize the key points concisely rather than giving an incomplete detailed answer. Never end mid-sentence.

## FORMAT (the chat window draws these, so follow them exactly)
- Write in markdown. Short paragraphs, "- " bullet lists for 3 or more items, **bold** for key figures.
- NERAM COURSE FEES: never write a fee table and never list all the course fees in text. Put [[fees]] on its own line (once per answer) and the chat shows designed fee cards with the exact numbers, plus the scholarship, EMI and YouTube notes, so do not repeat those in your text. For a general fee question use plain [[fees]], which shows every program. Only when the visitor asks about one program use its id, for example [[fees:1-year]] (ids: crash, 1-year, 2-year). Add a sentence before it, and mention scholarships or EMI only if asked. (College fees from a lookup are different: write those in text or in a comparison table.)
- TABLES: only to compare 3 or more items side by side (colleges, exam phases). Use a standard markdown table with a header row and a |---| separator row, each row on its own line, at most 5 columns.
- HEADINGS: use ### headings only when the answer has 2 or more distinct sections.
- BUTTONS: when the visitor shows intent, add one line such as [[cta:apply,demo]]. Actions: apply, demo, whatsapp, call. At most one line per answer.
- FOLLOW-UPS: end every answer with [[suggest: question 1 | question 2 | question 3]], up to 3 short questions (under 40 characters each) the visitor is likely to ask next, written as the visitor would ask them. Use this instead of ending with a question of your own.
- Never use em dashes or en dashes. Use commas, colons, periods or parentheses instead.`;

// ============================================
// KB CACHE
// ============================================

let kbCache: { text: string; fetchedAt: number } | null = null;
const KB_CACHE_TTL_MS = 5 * 60 * 1000;

async function getKBSection(): Promise<string> {
  const now = Date.now();
  if (kbCache && now - kbCache.fetchedAt < KB_CACHE_TTL_MS) return kbCache.text;

  try {
    const items = await getActiveAintraKnowledgeBase();
    if (!items.length) {
      kbCache = { text: '', fetchedAt: now };
      return '';
    }

    const grouped: Record<string, { question: string; answer: string }[]> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push({ question: item.question, answer: item.answer });
    }

    const lines: string[] = ['\n\n## ADDITIONAL KNOWLEDGE BASE (Admin-Managed)'];
    for (const [cat, catItems] of Object.entries(grouped)) {
      lines.push(`\n### ${cat}`);
      for (const { question, answer } of catItems) {
        lines.push(`Q: ${question}\nA: ${answer}`);
      }
    }

    const text = lines.join('\n');
    kbCache = { text, fetchedAt: now };
    return text;
  } catch (err) {
    console.error('[GeneralChat] Failed to load KB:', err);
    kbCache = { text: '', fetchedAt: now };
    return '';
  }
}

// ============================================
// GEMINI CALL (tool-aware, streamed)
// ============================================

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  latency_ms: number;
  success: boolean;
  error?: string;
}

interface GeminiResult {
  reply: string;
  model: string;
  finishReason: string;
  toolCalls: ToolCallLog[];
}

type Emit = (event: ChatStreamEvent) => void;

/** Appended when an answer was cut short, so the visitor is never left mid-sentence. */
const CONTACT_TAIL =
  '\n\n*For more details, please contact us at **+91 91761 37043** or visit **neramclasses.com**.*';

/**
 * One turn of the tool loop, streamed: each text delta goes to the visitor as
 * it is written.
 *
 * The model cascade, the retired-model guard and the metering all live in
 * @neram/ai now. What used to be here was a fourth private copy of that logic,
 * with its own model list, which is how the ecosystem ended up calling models
 * Google had switched off.
 */
async function callGemini(
  contents: GeminiContent[],
  systemPrompt: string,
  tools: unknown[] | null,
  errors: string[],
  clientKey: string | null,
  onText: (delta: string) => void
) {
  try {
    return await streamGemini({
      feature: 'marketing.site-chat',
      clientKey,
      systemInstruction: systemPrompt,
      contents,
      ...(tools && tools.length > 0 ? { tools } : {}),
      temperature: 0.75,
      maxOutputTokens: 4096,
      // Prose for a visitor to read, not JSON for a parser.
      responseMimeType: 'text/plain',
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
      onText,
    });
  } catch (err) {
    // A refusal has to reach the handler so the visitor is told the assistant
    // is unavailable, rather than the loop burning its remaining iterations
    // re-asking a question that was already answered with no.
    // Out of credit is the same: another round would 402 again.
    if (err instanceof AiBlockedError || err instanceof AiBillingError) throw err;
    errors.push(err instanceof Error ? err.message : 'unknown');
    console.error('[GeneralChat] Gemini error:', err);
    return null;
  }
}

/** Ends a finished answer, adding the contact line when it was cut short. */
function finishReply(
  text: string,
  model: string,
  finishReason: string,
  toolCalls: ToolCallLog[],
  emit: Emit
): GeminiResult {
  let reply = text;
  if (finishReason === 'MAX_TOKENS' || finishReason === 'INTERRUPTED') {
    emit({ t: 'delta', text: CONTACT_TAIL });
    reply = reply.trimEnd() + CONTACT_TAIL;
  }
  return { reply, model, finishReason, toolCalls };
}

async function runGeminiLoop(
  initialContents: GeminiContent[],
  systemPrompt: string,
  errors: string[],
  clientKey: string | null,
  emit: Emit
): Promise<GeminiResult | null> {
  const contents: GeminiContent[] = [...initialContents];
  const toolCalls: ToolCallLog[] = [];

  // Gemini disallows combining built-in tools (google_search) with
  // functionDeclarations in the same request, so we use only function calling.
  const toolsWithGrounding: unknown[] = [
    { functionDeclarations: TOOL_DECLARATIONS },
  ];

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    // On the final iteration, disable tools to force a text answer.
    const tools = iteration < MAX_TOOL_ITERATIONS ? toolsWithGrounding : null;

    let streamedThisRound = false;
    const result = await callGemini(contents, systemPrompt, tools, errors, clientKey, (delta) => {
      streamedThisRound = true;
      emit({ t: 'delta', text: delta });
    });
    if (!result) {
      if (streamedThisRound) emit({ t: 'reset' });
      return null;
    }

    const functionCalls = result.functionCalls.map((c) => ({
      name: c.name,
      args: (c.args || {}) as Record<string, unknown>,
    }));

    if (functionCalls.length === 0) {
      const reply = result.text.trim();
      if (!reply) {
        errors.push(`${result.model}:EMPTY_TEXT`);
        return null;
      }
      return finishReply(reply, result.model, result.finishReason, toolCalls, emit);
    }

    // The model said something like "Let me check" before asking for a tool.
    // The real answer follows the lookup, so take the preamble back.
    if (streamedThisRound) emit({ t: 'reset' });
    emit({ t: 'status', text: toolStatusText(functionCalls.map((c) => c.name)) });

    // Replay the model's own parts: Gemini 3 models reject a function call
    // that has lost its thoughtSignature, and rebuilding the parts drops it.
    contents.push({
      role: 'model',
      parts: result.modelParts.length
        ? result.modelParts
        : functionCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
    });

    // Execute all tool calls in parallel.
    const executions = await Promise.all(
      functionCalls.map(async (call) => {
        const started = Date.now();
        const res = await dispatchTool(call.name, call.args);
        const latency = Date.now() - started;
        toolCalls.push({
          name: call.name,
          args: call.args,
          latency_ms: latency,
          success: res.ok,
          error: res.ok ? undefined : res.error,
        });
        return { call, res };
      })
    );

    // Append each tool result as a functionResponse. Gemini REST v1beta expects
    // functionResponse messages to carry role 'user' (not 'function').
    for (const { call, res } of executions) {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: res as unknown as Record<string, unknown>,
            },
          },
        ],
      });
    }
  }

  // Unreachable in practice: the last iteration above runs with tools disabled,
  // so the model has to answer with text and the loop returns. Kept as a
  // backstop in case that invariant is ever edited away.
  const finalResult = await callGemini(contents, systemPrompt, null, errors, clientKey, (delta) =>
    emit({ t: 'delta', text: delta })
  );
  if (!finalResult) return null;
  const finalReply = finalResult.text.trim();
  if (!finalReply) return null;
  return finishReply(finalReply, finalResult.model, finalResult.finishReason, toolCalls, emit);
}

// ============================================
// LOGGING
// ============================================

async function logConversation(params: {
  sessionId: string;
  userMessage: string;
  aiResponse: string | null;
  userId?: string | null;
  userName?: string | null;
  pageUrl?: string;
  modelUsed?: string;
  responseTimeMs?: number;
  error?: string;
  toolCalls?: ToolCallLog[];
  /** Where the visitor is, from Cloudflare's location headers. Never the IP. */
  geo?: SignupGeo | null;
  /** Visitor id, channel, landing page and device, for Admin > Aintra Inbox. */
  visitor?: ChatVisitor | null;
}) {
  // The nightly E2E suite talks to the production database, so without this its
  // scripted questions arrive in admin Chat History looking like real leads.
  if (isE2ETestRun()) return;

  try {
    const supabase = createAdminClient();

    let resolvedUserId: string | null = null;
    let resolvedLeadName: string | null = params.userName || null;
    let resolvedLeadPhone: string | null = null;
    if (params.userId) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, name, first_name, last_name, phone')
        .eq('firebase_uid', params.userId)
        .single();
      resolvedUserId = dbUser?.id || null;
      const dbName = dbUser?.first_name
        ? `${dbUser.first_name}${dbUser.last_name ? ' ' + dbUser.last_name : ''}`
        : dbUser?.name || null;
      resolvedLeadName = dbName || params.userName || dbUser?.phone || null;
      resolvedLeadPhone = dbUser?.phone || null;
    }

    await (supabase.from('chatbot_conversations') as any).insert({
      session_id: params.sessionId,
      user_message: params.userMessage,
      ai_response: params.aiResponse,
      user_id: resolvedUserId,
      lead_name: resolvedLeadName,
      lead_phone: resolvedLeadPhone,
      page_url: params.pageUrl || null,
      model_used: params.modelUsed || null,
      response_time_ms: params.responseTimeMs || null,
      error: params.error || null,
      source: 'general_chatbot',
      tool_calls: params.toolCalls && params.toolCalls.length ? params.toolCalls : null,
      geo_city: params.geo?.city ?? null,
      geo_state: params.geo?.state ?? null,
      geo_country: params.geo?.country ?? null,
      geo_source: params.geo?.source ?? null,
      anonymous_id: params.visitor?.anonymousId ?? null,
      channel: params.visitor?.channel ?? null,
      landing_page: params.visitor?.landingPage ?? null,
      device: params.visitor?.device ?? null,
    });
  } catch (err) {
    console.error('Failed to log chatbot conversation:', err);
  }
}

// ============================================
// POST HANDLER
// ============================================

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { message, history, sessionId, userId, userName, pageUrl } = body as {
    message?: unknown;
    history?: unknown;
    sessionId?: string;
    userId?: string | null;
    userName?: string | null;
    pageUrl?: string;
  };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
  }

  const contents: GeminiContent[] = [];
  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
  for (const turn of recentHistory) {
    if ((turn?.role === 'user' || turn?.role === 'model') && typeof turn.text === 'string' && turn.text) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const geo = signupGeoFromHeaders(request.headers);
  // Session and IP together. Either alone is defeated by a script or punishes a
  // shared connection; see packages/ai/src/client-key.ts.
  const clientKey = hashClientKey(sessionId, ipFromHeaders(request.headers));
  const visitor = chatVisitorFromHeaders(request.headers);

  // Free on a guest's first day; on a later day Aintra asks them to sign in first.
  // A just-minted visitor id is a first visit, so it needs no lookup.
  if (!userId && !visitor.minted) {
    const returning = isE2ETestRun()
      ? request.headers.get(E2E_RETURNING_GUEST_HEADER) === '1'
      : await guestNeedsSignIn(createAdminClient(), visitor.anonymousId);
    if (returning) {
      // Logged so staff still see what they wanted to ask (Admin > Aintra Inbox: "Asked to sign in").
      await logConversation({
        sessionId: sessionId || 'unknown',
        userMessage: message.trim(),
        aiResponse: null,
        pageUrl,
        error: SIGNUP_REQUIRED,
        geo,
        visitor,
      });
      return NextResponse.json(
        { error: 'Sign in to keep chatting with Aintra.', code: SIGNUP_REQUIRED },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  // The answer streams as Server-Sent Events (lib/aintra/chat-stream.ts), so the visitor
  // sees it being written instead of waiting for the whole thing. Every outcome,
  // the errors included, travels as an event on the stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          // The visitor closed the chat. Keep going so the answer is still logged.
          open = false;
        }
      };

      try {
        await answer({
          message,
          contents,
          sessionId,
          userId,
          userName,
          pageUrl,
          geo,
          clientKey,
          visitor,
          emit,
        });
      } catch (error) {
        console.error('Chat API error:', error);
        emit({ t: 'error', error: 'Internal server error', humanHelp: true });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': CHAT_STREAM_CONTENT_TYPE,
      'Cache-Control': 'no-store, no-transform',
      // Ask any proxy in between not to hold the stream back until it ends.
      'X-Accel-Buffering': 'no',
      // A first-time chatter gets a visitor id, so their next visit links to this one.
      ...(visitor.minted ? { 'Set-Cookie': visitorCookie(visitor.anonymousId, request.url) } : {}),
    },
  });
}

async function answer(params: {
  message: string;
  contents: GeminiContent[];
  sessionId?: string;
  userId?: string | null;
  userName?: string | null;
  pageUrl?: string;
  geo: SignupGeo | null;
  clientKey: string | null;
  visitor?: ChatVisitor | null;
  emit: Emit;
}) {
  const { message, contents, sessionId, userId, userName, pageUrl, geo, clientKey, visitor, emit } = params;
  const startTime = Date.now();
  const kbSection = await getKBSection();
  const currentCollegeSlug = extractCollegeSlug(pageUrl || null);
  const effectivePrompt = buildSystemPrompt({
    base: SYSTEM_PROMPT,
    kb: kbSection,
    currentCollegeSlug,
  });

  const log = (fields: { aiResponse: string | null; error?: string; modelUsed?: string; toolCalls?: ToolCallLog[] }) =>
    logConversation({
      sessionId: sessionId || 'unknown',
      userMessage: message.trim(),
      userId,
      userName,
      pageUrl,
      responseTimeMs: Date.now() - startTime,
      geo,
      visitor,
      ...fields,
    });

  const errors: string[] = [];
  let result: GeminiResult | null;
  try {
    result = await runGeminiLoop(contents, effectivePrompt, errors, clientKey, emit);
  } catch (err) {
    // The AI budget is spent, or the assistant is switched off in the control
    // panel. A visitor cannot run a prompt themselves, so this reads as a
    // temporary outage. It is still logged, so the panel shows what the cap
    // turned away.
    if (err instanceof AiBlockedError) {
      emit({ t: 'error', error: 'The assistant is taking a short break. Please try again later.', humanHelp: true });
      await log({ aiResponse: null, error: `AI_BLOCKED:${err.reason}` });
      return;
    }
    // The Gemini credits have run out. Nothing the visitor can do, so hand
    // them to a person; the row tells staff to follow up and to top up.
    if (err instanceof AiBillingError) {
      emit({ t: 'error', error: 'Our assistant is offline for a bit.', code: 'AI_UNAVAILABLE', humanHelp: true });
      await log({ aiResponse: null, error: 'CREDITS_DEPLETED' });
      return;
    }
    throw err;
  }

  if (!result) {
    emit({
      t: 'error',
      error: 'AI service temporarily unavailable. Please try again in a moment.',
      humanHelp: true,
    });
    await log({ aiResponse: null, error: errors.join(' | ') });
    return;
  }

  // Tell the visitor first; the log row can be written after they have the answer.
  emit({ t: 'done', model: result.model, finishReason: result.finishReason });
  await log({
    aiResponse: result.reply,
    modelUsed: result.model,
    error:
      result.finishReason === 'MAX_TOKENS'
        ? 'TRUNCATED_MAX_TOKENS'
        : result.finishReason === 'INTERRUPTED'
          ? 'STREAM_INTERRUPTED'
          : undefined,
    toolCalls: result.toolCalls,
  });
}

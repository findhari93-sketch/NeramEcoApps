export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getActiveAintraKnowledgeBase } from '@neram/database';
import { extractCollegeSlug } from '@/lib/aintra/slug';
import { buildSystemPrompt } from '@/lib/aintra/primer';
import { TOOL_DECLARATIONS } from '@/lib/aintra/tools/declarations';
import { dispatchTool } from '@/lib/aintra/tools/dispatch';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ITERATIONS = 3;

const SYSTEM_PROMPT = `You are the Neram Classes Assistant — a friendly, helpful chatbot on neramclasses.com. You help prospective and current students with questions about Neram Classes courses, fees, timings, NATA exam, and related topics.

## ABOUT NERAM CLASSES
Neram Classes is India's top-rated NATA coaching institute (4.9 stars on Google, 90+ reviews). We offer online and offline coaching for NATA and JEE Paper 2 (B.Arch/B.Planning).
- Website: neramclasses.com
- Free tools: app.neramclasses.com (Question Bank, Cutoff Calculator, College Predictor, Mock Tests, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder)
- Founded by IIT/NIT alumni

## CONTACT INFORMATION
- Phone: +91 91761 37043, +91 88074 37399
- Email: info@neramclasses.com
- Office hours: 9:00 AM – 6:00 PM, Monday to Saturday (Closed Sunday)
- Centers: Coimbatore, Chennai, Bangalore, Madurai, Trichy (Tiruchirapalli), Tiruppur, Pudukkottai, Kanchipuram, Hyderabad, Mumbai, Delhi
- For center addresses and directions, visit neramclasses.com/centers

## CORRECT FEE STRUCTURE (CRITICAL — use these EXACT numbers)
| Course | Duration | Installment | Single Payment |
|--------|----------|-------------|----------------|
| Crash Course | 3 months | — | ₹15,000 |
| 1-Year Program | 12 months | ₹30,000 | ₹25,000 |
| 2-Year Program | 24 months | ₹35,000 | ₹30,000 |

- Scholarships available based on academic performance and financial background
- EMI/installment options available
- YouTube subscription reward: Rs. 50 off

## CLASS TIMINGS & MODES
**Online Classes (RECOMMENDED for consistent long-term preparation):**
- Alternate-day evening classes: 7:00 PM – 8:30 PM
- Consistent schedule throughout the year
- Live interactive sessions via Microsoft Teams
- Recorded lectures available for revision

**Offline Classes:**
- Weekend batches (less consistent schedule)
- Available at physical centers
- Drawing studios and classroom facilities

**Strong recommendation:** We highly recommend online classes for long-term preparation because of the consistency in schedule. Offline weekend batches can be inconsistent.

## COURSES OFFERED
1. **NATA Coaching** — NATA entrance exam preparation
2. **JEE Paper 2 Coaching** — B.Arch/B.Planning entrance
3. **Revit Architecture Training** — 3 months, beginner to advanced
4. **AutoCAD Training** — 2 months, beginner
5. **SketchUp Training** — 1 month, beginner
6. **NATA Self-Learning App** — Self-paced, AI-powered

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
- **Exam medium: English and Hindi ONLY** (no regional languages — not Tamil, Telugu, Kannada, etc.)
- Two phases: Phase 1 (April 4 – June 13, 2026, up to 2 attempts, percentile scoring), Phase 2 (August 7-8, 2026, 1 attempt, raw scores). Cannot appear in both.
- Pattern: Part A (Drawing, 80 marks, offline) + Part B (MCQ/NCQ, 120 marks, online adaptive) = 200 marks, 3 hours
- No negative marking. No minimum qualifying score.
- Eligibility: 10+2 with Physics + Mathematics, minimum 45% for admission
- NATA exam fee: General ₹1,750, SC/ST/EWS/PwD ₹1,250
- Materials allowed: Pencils, erasers, dry colors, scale up to 15cm only. NO geometry box, compass, calculator, or mobile phone.
- Registration: www.nata.in
- For detailed NATA info, use our NATA chatbot or visit neramclasses.com/nata-2026

## INSTRUCTIONS
- Be warm, friendly, and conversational — like chatting with a helpful mentor
- Keep answers concise (2-4 paragraphs max)
- Use **bold** for key info (fees, dates, phone numbers)
- When asked about fees, ALWAYS use the EXACT fee structure above — never approximate or guess
- When asked about timings/modes, recommend online classes for consistency
- For questions you don't know the answer to, say: "I'm not sure about that. Please contact us at **+91 91761 37043** or **info@neramclasses.com** for accurate information."
- NEVER fabricate information or make up details
- When relevant, naturally mention free tools at app.neramclasses.com
- If the user seems interested in joining, suggest visiting neramclasses.com/apply or booking a demo class
- End responses with a brief follow-up question or helpful suggestion when appropriate
- IMPORTANT: Always complete your answer. If a topic needs a long explanation, summarize the key points concisely rather than giving an incomplete detailed answer. Never end mid-sentence.`;

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
// GEMINI CALL (tool-aware)
// ============================================

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

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

async function callGemini(
  model: string,
  contents: GeminiContent[],
  systemPrompt: string,
  tools: unknown[] | null,
  errors: string[]
): Promise<{ candidate: any; model: string; finishReason: string } | null> {
  try {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.75, maxOutputTokens: 4096, topP: 0.9 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => 'unknown');
      const detail = `${model}:HTTP${status}(${errorText.slice(0, 150)})`;
      errors.push(detail);
      console.error(`[GeneralChat] Gemini ${model} error: ${status}`, errorText);
      return null;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const blockReason = data?.promptFeedback?.blockReason || 'NO_CONTENT';
      errors.push(`${model}:${blockReason}`);
      console.error(`[GeneralChat] Gemini ${model}: no candidate (${blockReason})`);
      return null;
    }
    return { candidate, model, finishReason: candidate.finishReason || 'UNKNOWN' };
  } catch (err) {
    errors.push(`${model}:FETCH_ERROR(${err instanceof Error ? err.message : 'unknown'})`);
    console.error(`[GeneralChat] Gemini ${model} fetch error:`, err);
    return null;
  }
}

function extractFunctionCalls(candidate: any): Array<{ name: string; args: Record<string, unknown> }> {
  const parts = candidate?.content?.parts || [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const p of parts) {
    if (p.functionCall && p.functionCall.name) {
      calls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
    }
  }
  return calls;
}

function extractText(candidate: any): string {
  const parts = candidate?.content?.parts || [];
  const chunks: string[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text.length) chunks.push(p.text);
  }
  return chunks.join('\n').trim();
}

async function runGeminiLoop(
  initialContents: GeminiContent[],
  systemPrompt: string,
  errors: string[]
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

    let result: { candidate: any; model: string; finishReason: string } | null = null;
    for (const model of GEMINI_MODELS) {
      result = await callGemini(model, contents, systemPrompt, tools, errors);
      if (result) break;
    }
    if (!result) return null;

    const functionCalls = extractFunctionCalls(result.candidate);

    if (functionCalls.length === 0) {
      const reply = extractText(result.candidate);
      if (!reply) {
        errors.push(`${result.model}:EMPTY_TEXT`);
        return null;
      }
      const finishReason: string = result.finishReason;
      let finalReply = reply;
      if (finishReason === 'MAX_TOKENS') {
        finalReply =
          reply.trimEnd() +
          '\n\n*For more details, please contact us at **+91 91761 37043** or visit **neramclasses.com**.*';
      }
      return { reply: finalReply, model: result.model, finishReason, toolCalls };
    }

    // Append the model's function-call message so Gemini tracks what it asked.
    contents.push({
      role: 'model',
      parts: functionCalls.map((c) => ({
        functionCall: { name: c.name, args: c.args },
      })),
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

  // Hit the iteration cap; force one final text-only call without tools.
  const finalResult = await callGemini(
    GEMINI_MODELS[GEMINI_MODELS.length - 1],
    contents,
    systemPrompt,
    null,
    errors
  );
  if (!finalResult) return null;
  const finalReply = extractText(finalResult.candidate);
  if (!finalReply) return null;
  return {
    reply: finalReply,
    model: finalResult.model,
    finishReason: finalResult.finishReason,
    toolCalls,
  };
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
}) {
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
    });
  } catch (err) {
    console.error('Failed to log chatbot conversation:', err);
  }
}

// ============================================
// POST HANDLER
// ============================================

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    console.error('[GeneralChat] GEMINI_API_KEY is not set');
    return NextResponse.json({ error: 'Chat service not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { message, history, sessionId, userId, userName, pageUrl } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
    }

    const contents: GeminiContent[] = [];
    const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
    for (const turn of recentHistory) {
      if (turn.role === 'user' || turn.role === 'model') {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const startTime = Date.now();
    const kbSection = await getKBSection();
    const currentCollegeSlug = extractCollegeSlug(pageUrl || null);
    const effectivePrompt = buildSystemPrompt({
      base: SYSTEM_PROMPT,
      kb: kbSection,
      currentCollegeSlug,
    });

    const errors: string[] = [];
    const result = await runGeminiLoop(contents, effectivePrompt, errors);
    const responseTimeMs = Date.now() - startTime;

    if (!result) {
      await logConversation({
        sessionId: sessionId || 'unknown',
        userMessage: message.trim(),
        aiResponse: null,
        userId,
        userName,
        pageUrl,
        error: errors.join(' | '),
        responseTimeMs,
      });
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again in a moment.' },
        { status: 502 }
      );
    }

    await logConversation({
      sessionId: sessionId || 'unknown',
      userMessage: message.trim(),
      aiResponse: result.reply,
      userId,
      userName,
      pageUrl,
      modelUsed: result.model,
      responseTimeMs,
      error: result.finishReason === 'MAX_TOKENS' ? 'TRUNCATED_MAX_TOKENS' : undefined,
      toolCalls: result.toolCalls,
    });

    return NextResponse.json({
      reply: result.reply,
      model: result.model,
      finishReason: result.finishReason,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

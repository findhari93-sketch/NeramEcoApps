export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/aintra: Aintra, the Neram assistant, inside the student app
 * (2026-10-20). Signed-in students only. It answers, and it does their jobs
 * through tools (lib/aintra/tools.ts): their account, fees, a support ticket,
 * the exam year, saved colleges, notifications. Calculations go to /ask.
 *
 * Streams Server-Sent Events (status, delta, reset, card, done, error). A
 * tool's card goes straight to the student; the model only reads a summary,
 * so it can never edit a card, and a payment link's token never reaches it.
 *
 * Metered as `app.ask`: the same assistant, once Ask aiArchitek folds in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { AiBillingError, AiBlockedError, hashClientKey, ipFromHeaders, streamGemini } from '@neram/ai';
import type { GeminiContent } from '@neram/ai';
import { getExamYearStatus, getSupabaseAdminClient, getUserByFirebaseUid } from '@neram/database';
import { encodeSseEvent, SSE_CONTENT_TYPE } from '@neram/ui/chat-stream';
import { verifyIdToken } from '@/lib/firebase-admin';
import type { AintraCard, AintraEvent } from '@/lib/aintra/cards';
import { runTool, TOOL_DECLARATIONS, TOOL_STATUS, type AintraUser } from '@/lib/aintra/tools';
import { buildAintraPrompt } from '@/lib/aintra/prompt';

/** One tool round and a forced answer: up to two Gemini calls a message. */
const MAX_TOOL_ROUNDS = 1;

type Emit = (e: AintraEvent) => void;

interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  success: boolean;
}

async function signedInUser(req: NextRequest): Promise<(AintraUser & { email: string | null }) | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    const u: any = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient() as any);
    if (!u?.id) return null;
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.name && u.name !== 'User' ? u.name : null);
    return { id: u.id, name, phoneVerified: u.phone_verified === true, email: u.email ?? null };
  } catch {
    return null;
  }
}

async function answer(
  contents: GeminiContent[],
  system: string,
  user: AintraUser,
  clientKey: string | null,
  emit: Emit,
): Promise<{ reply: string; model: string; toolCalls: ToolCallLog[] } | null> {
  const toolCalls: ToolCallLog[] = [];
  const convo = [...contents];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const toolsOn = round < MAX_TOOL_ROUNDS;
    let streamed = false;
    const result = await streamGemini({
      feature: 'app.ask',
      clientKey,
      actorId: user.id,
      systemInstruction: toolsOn ? system : `${system}\n\nTools are off for this reply: answer in words from what you have.`,
      contents: convo,
      ...(toolsOn ? { tools: [{ functionDeclarations: TOOL_DECLARATIONS }] } : {}),
      temperature: 0.6,
      maxOutputTokens: 1500,
      responseMimeType: 'text/plain',
      onText: (delta: string) => {
        streamed = true;
        emit({ t: 'delta', text: delta });
      },
    });
    const calls = (result.functionCalls ?? []).map((c: any) => ({ name: c.name as string, args: (c.args || {}) as Record<string, unknown> }));
    if (!calls.length) {
      const reply = (result.text || '').trim();
      return reply ? { reply, model: result.model, toolCalls } : null;
    }
    if (streamed) emit({ t: 'reset' });
    emit({ t: 'status', text: `${TOOL_STATUS[calls[0].name] ?? 'Looking that up'}...` });
    convo.push({ role: 'model', parts: result.modelParts?.length ? result.modelParts : calls.map((c) => ({ functionCall: c })) } as GeminiContent);
    const outcomes = await Promise.all(calls.map((c) => runTool(c.name, c.args, user)));
    outcomes.forEach((o, i) => {
      toolCalls.push({ name: calls[i].name, args: calls[i].args, success: o.forModel.ok !== false });
      if (o.card) emit({ t: 'card', card: o.card as AintraCard });
      convo.push({
        role: 'user',
        parts: [{ functionResponse: { name: calls[i].name, response: { ...o.forModel, ...(o.card ? { card: 'shown under your answer' } : {}) } } }],
      } as GeminiContent);
    });
  }
  return null;
}

async function log(row: Record<string, unknown>) {
  try {
    await (getSupabaseAdminClient() as any).from('chatbot_conversations').insert(row);
  } catch (err) {
    console.error('[aintra/app] log failed:', err);
  }
}

export async function POST(req: NextRequest) {
  const user = await signedInUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in to use Aintra.', code: 'SIGN_IN_REQUIRED' }, { status: 401 });

  let body: { message?: unknown; history?: unknown; sessionId?: unknown; pageUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 100) : 'unknown';
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 300) : null;

  const contents: GeminiContent[] = [];
  for (const turn of Array.isArray(body.history) ? body.history.slice(-10) : []) {
    if ((turn?.role === 'user' || turn?.role === 'model') && typeof turn.text === 'string' && turn.text) {
      contents.push({ role: turn.role, parts: [{ text: turn.text.slice(0, 2000) }] } as GeminiContent);
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] } as GeminiContent);

  const examYear = await getExamYearStatus(getSupabaseAdminClient() as any, user.id).catch(() => null);
  const system = buildAintraPrompt({ name: user.name, phoneVerified: user.phoneVerified, examYear: examYear?.year ?? null, pageUrl }, new Date());
  const clientKey = hashClientKey(sessionId, ipFromHeaders(req.headers));
  const started = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (e) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(e)));
        } catch {
          open = false;
        }
      };
      const base = {
        session_id: sessionId,
        user_message: message,
        user_id: user.id,
        lead_name: user.name,
        page_url: pageUrl ? `app:${pageUrl}` : 'app',
        source: 'app_aintra',
      };
      try {
        const result = await answer(contents, system, user, clientKey, emit);
        if (!result) {
          emit({ t: 'error', error: 'Aintra could not answer just now. Please try again in a moment.' });
          await log({ ...base, ai_response: null, error: 'NO_ANSWER', response_time_ms: Date.now() - started });
        } else {
          emit({ t: 'done', model: result.model });
          await log({
            ...base,
            ai_response: result.reply,
            model_used: result.model,
            response_time_ms: Date.now() - started,
            tool_calls: result.toolCalls.length ? result.toolCalls : null,
          });
        }
      } catch (err) {
        const blocked = err instanceof AiBlockedError || err instanceof AiBillingError;
        if (!blocked) console.error('[aintra/app] failed:', err);
        emit({ t: 'error', error: blocked ? 'Aintra is taking a short break. Please try again later.' : 'Something went wrong. Please try again.', code: blocked ? 'AI_UNAVAILABLE' : undefined });
        await log({ ...base, ai_response: null, error: blocked ? 'AI_BLOCKED' : 'ERROR', response_time_ms: Date.now() - started });
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
    headers: { 'Content-Type': SSE_CONTENT_TYPE, 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  });
}

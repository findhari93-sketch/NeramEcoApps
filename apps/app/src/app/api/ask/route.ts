// A per-request streamed answer: never cached. When Gemini is down the
// Groq/OpenRouter backup answers, which can take around 20 seconds.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ask: one turn of Ask aiArchitek, streamed as Server-Sent Events
 * (lib/ask/stream.ts).
 *
 * Body: { message, threadId?, history?: [{ role, text, cards? }], pageContext?, prefill? }
 *
 * The tool loop is Aintra's (apps/marketing/src/app/api/chat/route.ts): up to
 * two rounds of tools, tools off on the last round so the model must answer,
 * and the model's own parts replayed so Gemini 3 accepts the function calls.
 * What is new here: every tool result becomes a card event, details learned
 * become memory, and guests get GUEST_DAILY_ANSWERS answers a day.
 */
import { NextRequest, NextResponse } from 'next/server';
import { AiBillingError, AiBlockedError, hashClientKey, ipFromHeaders, streamGemini } from '@neram/ai';
import type { GeminiContent } from '@neram/ai';
import type { AskCard } from '@/lib/ask/cards';
import { mergeFacts, type AskFacts } from '@/lib/ask/memory';
import { buildAskPrompt } from '@/lib/ask/prompt';
import { GUEST_DAILY_ANSWERS, guestRemaining } from '@/lib/ask/quota';
import { guestAnswersToday, loadFacts, logMessage, saveFacts, threadFor } from '@/lib/ask/store';
import { ASK_STREAM_CONTENT_TYPE, SIGNUP_REQUIRED, encodeAskEvent, splitSuggestions, type AskStreamEvent } from '@/lib/ask/stream';
import { ASK_TOOL_DECLARATIONS, askToolStatus, defaultAskToolDeps, runAskTool } from '@/lib/ask/tools';
import { askVisitorFrom } from '@/lib/ask/visitor';

const MAX_TOOL_ROUNDS = 2;
const MAX_MESSAGE = 1000;

interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
  cards?: string[];
}

function historyContents(raw: unknown): GeminiContent[] {
  if (!Array.isArray(raw)) return [];
  const out: GeminiContent[] = [];
  for (const t of raw.slice(-10) as HistoryTurn[]) {
    if ((t?.role !== 'user' && t?.role !== 'model') || typeof t.text !== 'string') continue;
    // The cards shown with an earlier answer, as text, so a follow-up ("and for
    // BC?") can build on them without the model having invented any number.
    const cards = Array.isArray(t.cards) ? t.cards.filter((c) => typeof c === 'string').slice(0, 4) : [];
    const text = [t.text.slice(0, 2000), cards.length ? `[Cards shown: ${cards.join('; ').slice(0, 800)}]` : '']
      .filter(Boolean)
      .join('\n');
    if (text) out.push({ role: t.role, parts: [{ text }] });
  }
  return out;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > MAX_MESSAGE) return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE} characters` }, { status: 400 });

  const visitor = await askVisitorFrom(request);
  const guest = !visitor.userId;
  const cookieHeaders: Record<string, string> = visitor.setCookie ? { 'Set-Cookie': visitor.setCookie } : {};

  // Three answers a day for a guest, then the sign-in card. A just-minted id has
  // asked nothing yet, so it needs no lookup.
  let remainingAfter: number | null = null;
  if (guest) {
    const used = visitor.minted ? 0 : await guestAnswersToday(visitor.anonId);
    if (used >= GUEST_DAILY_ANSWERS) {
      return NextResponse.json(
        { error: 'Sign in free to keep chatting.', code: SIGNUP_REQUIRED },
        { status: 403, headers: { 'Cache-Control': 'no-store', ...cookieHeaders } }
      );
    }
    remainingAfter = guestRemaining(used + 1);
  }

  const pageContext = typeof body.pageContext === 'string' ? body.pageContext.slice(0, 200) : null;
  let facts: AskFacts = await loadFacts(visitor);
  // Values carried in from a calculator link (/ask?board=…&marks=…).
  if (body.prefill && typeof body.prefill === 'object') {
    const p = body.prefill as Record<string, unknown>;
    facts = mergeFacts(facts, { board: p.board, boardMax: p.maxMarks, boardMarks: p.marksSecured });
  }
  const startFacts = JSON.stringify(facts);

  const contents = historyContents(body.history);
  contents.push({ role: 'user', parts: [{ text: message }] });
  const clientKey = hashClientKey(visitor.userId ?? visitor.anonId, ipFromHeaders(request.headers));
  const started = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AskStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeAskEvent(event)));
        } catch {
          // The student closed the chat; keep going so the turn is still saved.
          open = false;
        }
      };

      const threadId = await threadFor(
        visitor,
        typeof body.threadId === 'string' ? body.threadId : null,
        message,
        pageContext ? { from: pageContext } : null
      );
      emit({ t: 'meta', threadId: threadId ?? '', guestRemaining: remainingAfter });
      if (threadId) await logMessage(visitor, { threadId, role: 'user', text: message });

      const cards: AskCard[] = [];
      const toolLog: Array<{ name: string; args: unknown; ok: boolean; ms: number }> = [];
      const deps = await defaultAskToolDeps();
      let reply = '';
      let model: string | null = null;
      let error: string | null = null;

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const withTools = round < MAX_TOOL_ROUNDS;
          let streamed = false;
          const result = await streamGemini({
            feature: 'app.ask',
            clientKey,
            actorId: visitor.userId,
            // Last round, tools off: say so, or the model may reach for a tool it
            // can no longer call and return nothing (seen with flash-lite).
            systemInstruction: buildAskPrompt({ facts, guest, guestRemaining: remainingAfter, pageContext, finalRound: !withTools && round > 0 }),
            contents,
            ...(withTools ? { tools: [{ functionDeclarations: ASK_TOOL_DECLARATIONS }] } : {}),
            temperature: 0.4,
            maxOutputTokens: 1200,
            responseMimeType: 'text/plain',
            onText: (delta) => {
              streamed = true;
              emit({ t: 'delta', text: delta });
            },
          });
          model = result.model;
          const calls = result.functionCalls.map((c) => ({ name: c.name, args: (c.args || {}) as Record<string, unknown> }));

          if (calls.length === 0) {
            reply = result.text.trim();
            break;
          }

          // "Let me check..." before a tool call: the real answer follows the lookup.
          if (streamed) emit({ t: 'reset' });
          emit({ t: 'status', text: askToolStatus(calls.map((c) => c.name)) });
          contents.push({
            role: 'model',
            parts: result.modelParts.length ? result.modelParts : calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
          });

          // In order, with memory updated after each call, so calculate_cutoff and
          // predict_colleges asked together in one round chain: the second uses the
          // cutoff the first just worked out. Each tool reads cached data, so this
          // costs milliseconds, and it saves a whole model round.
          // One user turn holding every result, in the order of the calls.
          const responses: GeminiContent['parts'] = [];
          let cutoffWorkedOut = false;
          for (const call of calls) {
            const t0 = Date.now();
            // A cutoff worked out earlier in this round wins over one the model
            // passed alongside it (it guesses before the result exists).
            const args = cutoffWorkedOut && 'cutoff' in call.args ? { ...call.args, cutoff: undefined } : call.args;
            const outcome = await runAskTool(call.name, args, { guest, facts }, deps);
            if (call.name === 'calculate_cutoff' && outcome.ok) cutoffWorkedOut = true;
            toolLog.push({ name: call.name, args: call.args, ok: outcome.ok, ms: Date.now() - t0 });
            if (process.env.NODE_ENV !== 'production') console.info('[ask] tool', call.name, JSON.stringify(call.args), JSON.stringify(outcome.result).slice(0, 300));
            if (outcome.factsPatch) facts = mergeFacts(facts, outcome.factsPatch);
            if (outcome.card) {
              cards.push(outcome.card);
              emit({ t: 'card', card: outcome.card });
            }
            responses.push({ functionResponse: { name: call.name, response: { ok: outcome.ok, ...outcome.result } } });
          }
          contents.push({ role: 'user', parts: responses });
        }
      } catch (err) {
        if (err instanceof AiBlockedError) {
          error = `AI_BLOCKED:${err.reason}`;
          emit({ t: 'error', error: 'Ask aiArchitek is taking a short break. The tools on this site still work; please try the chat again later.' });
        } else if (err instanceof AiBillingError) {
          error = 'CREDITS_DEPLETED';
          emit({ t: 'error', error: 'Ask aiArchitek is offline for a bit. The tools on this site still work.', code: 'AI_UNAVAILABLE' });
        } else {
          error = err instanceof Error ? err.message.slice(0, 300) : 'unknown';
          console.error('[ask] answer failed:', err);
          emit({ t: 'error', error: 'Something went wrong. Please try again in a moment.' });
        }
      }

      const split = splitSuggestions(reply);
      let text = split.body;
      const suggestions = split.suggestions;
      // The cards carry the answer; never leave them without a word.
      if (!error && !text && cards.length > 0) {
        text = 'Here is what I found from the official data. Tap a card to open the full tool.';
        emit({ t: 'delta', text });
      }
      if (!error && !text && cards.length === 0) {
        error = 'EMPTY_REPLY';
        emit({ t: 'error', error: 'No answer came back. Please try again.' });
      }

      if (JSON.stringify(facts) !== startFacts) {
        emit({ t: 'facts', facts });
        await saveFacts(visitor, facts);
      }
      if (!error) emit({ t: 'done', suggestions });

      if (threadId) {
        await logMessage(visitor, {
          threadId,
          role: 'assistant',
          text,
          cards,
          toolCalls: toolLog,
          model,
          error,
          responseMs: Date.now() - started,
        });
      }
      open = false;
      try {
        controller.close();
      } catch {
        // Already closed by the client.
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': ASK_STREAM_CONTENT_TYPE,
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      ...cookieHeaders,
    },
  });
}

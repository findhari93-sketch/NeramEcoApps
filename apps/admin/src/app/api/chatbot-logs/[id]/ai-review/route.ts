// @ts-nocheck
/**
 * AI Review for a single Aintra conversation.
 *
 * Given a logged chatbot_conversations row, asks Gemini to grade Aintra's answer
 * (verdict + reasoning) and propose a corrected answer the admin can accept into
 * the existing admin_correction / promote-to-KB flow. This is the dashboard side
 * of the answer-quality review, it turns the one-off review report into an
 * ongoing, one-click check for new conversations.
 *
 * Depends on GEMINI_API_KEY (same key as the marketing chat); if Gemini quota is
 * depleted the route returns a clear 502 so the UI can show a friendly message.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Try current models in order; the first that responds wins (mirrors the chat route).
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const REVIEW_SYSTEM_PROMPT = `You are a meticulous quality reviewer for "Aintra", the AI assistant of Neram Classes, an architecture-entrance coaching institute in India (NATA and JEE Paper 2 / B.Arch admissions).

You are given a student's question and the answer Aintra gave. Judge whether Aintra's answer is factually correct, complete, and appropriate for a prospective student.

Assess:
- Factual accuracy for NATA, JEE Paper 2, JoSAA, TNEA, KEAM, KCET/COMEDK (exam pattern, eligibility, dates, fees, counselling rules).
- Whether it actually answered the question that was asked.
- Tone and helpfulness.

Important rules:
- If a claim depends on current-year official data you cannot be certain of, set verdict "uncertain" and say it should be verified on the official source. Do NOT guess at dates, fees, or cutoffs.
- For Neram-internal facts (course fees, class timings, demo classes, refund policy, centers), you cannot verify these externally; set verdict "uncertain" for those unless the answer is clearly self-contradictory.
- "suggestedCorrection" must be the improved, accurate, warm answer the assistant SHOULD give, addressed to the student as "you". If the original was already correct, lightly polish it.
- Never use em dashes. Keep "reasoning" under 60 words and "suggestedCorrection" under 180 words.

verdict must be exactly one of: "correct", "needs_fix", "wrong", "uncertain".`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['correct', 'needs_fix', 'wrong', 'uncertain'] },
    reasoning: { type: 'STRING' },
    suggestedCorrection: { type: 'STRING' },
  },
  required: ['verdict', 'reasoning', 'suggestedCorrection'],
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'AI review is not configured (GEMINI_API_KEY missing).' }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from('chatbot_conversations')
      .select('id, user_message, ai_response')
      .eq('id', params.id)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (!row.user_message?.trim()) {
      return NextResponse.json({ error: 'This turn has no question to review.' }, { status: 400 });
    }

    const userPrompt = `Student's question:\n"${row.user_message}"\n\nAintra's answer:\n"${row.ai_response || '(no answer was generated)'}"\n\nReview this answer and respond with the JSON object.`;

    let lastErr = 'unknown';
    for (const model of GEMINI_MODELS) {
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: REVIEW_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900,
            topP: 0.8,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });

      if (!response.ok) {
        lastErr = `${model}:HTTP${response.status}`;
        const text = await response.text().catch(() => '');
        // 429 = quota depleted; try next model, then fail clearly.
        if (response.status === 429) continue;
        console.error('[AintraReview] Gemini error:', lastErr, text.slice(0, 200));
        continue;
      }

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) {
        lastErr = `${model}:EMPTY`;
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        return NextResponse.json({
          verdict: parsed.verdict || 'uncertain',
          reasoning: parsed.reasoning || '',
          suggestedCorrection: (parsed.suggestedCorrection || '').trim(),
          model,
        });
      } catch {
        lastErr = `${model}:BAD_JSON`;
        continue;
      }
    }

    const friendly = lastErr.includes('HTTP429')
      ? 'AI review is temporarily unavailable: the Gemini quota is depleted. Top up the GEMINI_API_KEY billing and try again.'
      : `AI review failed (${lastErr}).`;
    return NextResponse.json({ error: friendly }, { status: 502 });
  } catch (err) {
    console.error('[AintraReview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

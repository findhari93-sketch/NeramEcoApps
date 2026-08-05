/**
 * AI Review for a single Aintra conversation.
 *
 * Given a logged chatbot_conversations row, asks Gemini to grade Aintra's answer
 * (verdict + reasoning) and propose a corrected answer the admin can accept into
 * the existing admin_correction / promote-to-KB flow. This is the dashboard side
 * of the answer-quality review, it turns the one-off review report into an
 * ongoing, one-click check for new conversations.
 *
 * Runs through @neram/ai, which owns the model list, the fallback order and the
 * metering. The hand-rolled two-model loop that used to live here is gone; so is
 * the `@ts-nocheck` that was covering its untyped fetch body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { AiBlockedError, generateGemini } from '@neram/ai';

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

    let raw: string;
    let model: string;
    try {
      const result = await generateGemini({
        feature: 'admin.chat-review',
        systemInstruction: REVIEW_SYSTEM_PROMPT,
        parts: [{ text: userPrompt }],
        temperature: 0.2,
        maxOutputTokens: 900,
        responseSchema: RESPONSE_SCHEMA,
      });
      raw = result.text;
      model = result.model;
    } catch (err) {
      if (err instanceof AiBlockedError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason, manualPrompt: err.manualPrompt },
          { status: 409 }
        );
      }
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('[AintraReview] Gemini error:', message);
      return NextResponse.json(
        {
          error: message.includes('429')
            ? 'AI review is temporarily unavailable: every model is rate limited. Try again shortly.'
            : `AI review failed (${message}).`,
        },
        { status: 502 }
      );
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
      return NextResponse.json({ error: 'AI review failed (BAD_JSON).' }, { status: 502 });
    }
  } catch (err) {
    console.error('[AintraReview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

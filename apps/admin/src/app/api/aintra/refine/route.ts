import { NextRequest, NextResponse } from 'next/server';
import { AiBlockedError, generateGeminiText } from '@neram/ai';

/**
 * Polish an admin's rough knowledge base correction into publishable copy.
 *
 * This route was calling gemini-2.0-flash by name, with no fallback, months
 * after Google shut that model down on 1 June 2026. Every press of Refine had
 * been returning "Gemini API error" since. Models now come from the feature
 * registry in @neram/ai, so a shutdown is one edit rather than a hunt.
 *
 * The `@ts-nocheck` that used to head this file went with the rewrite: it was
 * hiding the untyped fetch body, and there is no untyped fetch body any more.
 */

const REFINE_SYSTEM_PROMPT = `You are a professional education content writer for Neram Classes, an architecture coaching institute in India that prepares students for NATA and JEE Paper 2 exams.

Your task: Take the admin's rough, conversational correction and rewrite it as a professional, clear, and accurate answer suitable for an AI chatbot knowledge base.

Rules:
- Keep the factual information exactly as provided, do NOT change any numbers, dates, fees, or policies
- Write in a warm but professional tone, like a helpful admissions counselor
- Use clear, concise sentences (under 200 words total)
- Structure the answer logically, most important point first
- Use bullet points only if listing 3+ items
- Do NOT add information that wasn't in the original, only restructure and polish what was given
- Address the student directly using "you"
- End with a helpful next step or call-to-action when appropriate (e.g., "Feel free to contact us for more details")
- Output ONLY the refined answer text, no preamble, no "Here's the refined version:", no quotes`;

export async function POST(request: NextRequest) {
  try {
    const { question, rawAnswer } = await request.json();

    if (!question?.trim() || !rawAnswer?.trim()) {
      return NextResponse.json({ error: 'question and rawAnswer are required' }, { status: 400 });
    }

    let refined: string;
    try {
      refined = await generateGeminiText({
        feature: 'admin.kb-refine',
        systemInstruction: REFINE_SYSTEM_PROMPT,
        parts: [
          {
            text: `Student's question: "${question}"\n\nAdmin's rough answer to refine:\n"${rawAnswer}"\n\nPlease rewrite this as a professional chatbot answer.`,
          },
        ],
        // Prose, not JSON. The default mime type would make the model wrap the
        // answer in a JSON string and the admin would paste quotes into the KB.
        responseMimeType: 'text/plain',
        temperature: 0.3,
        maxOutputTokens: 512,
      });
    } catch (err) {
      // Manual mode or a spent budget. The admin can run the prompt themselves
      // and paste the result, so hand it over rather than failing.
      if (err instanceof AiBlockedError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason, manualPrompt: err.manualPrompt },
          { status: 409 }
        );
      }
      console.error('[AintraRefine] Gemini error:', err);
      return NextResponse.json({ error: 'Gemini API error' }, { status: 502 });
    }

    if (!refined.trim()) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    return NextResponse.json({ refined: refined.trim() });
  } catch (err) {
    console.error('[AintraRefine] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

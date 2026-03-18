// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const REFINE_SYSTEM_PROMPT = `You are a professional education content writer for Neram Classes, an architecture coaching institute in India that prepares students for NATA and JEE Paper 2 exams.

Your task: Take the admin's rough, conversational correction and rewrite it as a professional, clear, and accurate answer suitable for an AI chatbot knowledge base.

Rules:
- Keep the factual information exactly as provided — do NOT change any numbers, dates, fees, or policies
- Write in a warm but professional tone, like a helpful admissions counselor
- Use clear, concise sentences (under 200 words total)
- Structure the answer logically — most important point first
- Use bullet points only if listing 3+ items
- Do NOT add information that wasn't in the original — only restructure and polish what was given
- Address the student directly using "you"
- End with a helpful next step or call-to-action when appropriate (e.g., "Feel free to contact us for more details")
- Output ONLY the refined answer text — no preamble, no "Here's the refined version:", no quotes`;

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { question, rawAnswer } = await request.json();

    if (!question?.trim() || !rawAnswer?.trim()) {
      return NextResponse.json({ error: 'question and rawAnswer are required' }, { status: 400 });
    }

    const url = `${GEMINI_BASE_URL}/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: REFINE_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Student's question: "${question}"\n\nAdmin's rough answer to refine:\n"${rawAnswer}"\n\nPlease rewrite this as a professional chatbot answer.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
          topP: 0.8,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      console.error('[AintraRefine] Gemini error:', response.status, errorText);
      return NextResponse.json({ error: 'Gemini API error' }, { status: 502 });
    }

    const data = await response.json();
    const refined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!refined) {
      console.error('[AintraRefine] No reply from Gemini:', JSON.stringify(data).slice(0, 300));
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    return NextResponse.json({ refined: refined.trim() });
  } catch (err) {
    console.error('[AintraRefine] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

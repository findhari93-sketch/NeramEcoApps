import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getSupabaseAdminClient } from '@neram/database';
import { generateGeminiText } from '@/lib/gemini-client';

/**
 * "Explain this in more detail" on the post-submit review.
 *
 * The brief explanation the question already carries is one or two sentences,
 * which is right for a quick check but not for a student who is still stuck.
 * This produces the worked version on demand.
 *
 * Written once, then read forever. GEMINI_API_KEY is shared across all four
 * apps and depleting it 429s every one of them, so the first student to ask a
 * given question pays for the call and everyone after reads the stored row.
 * That also means a second student never waits on the model.
 *
 * Deliberately not a Server Component fetch: it mutates (it caches the answer
 * back) and it is per-question rather than per-page.
 */

/** Long enough for a worked method, short enough that nobody scrolls forever. */
const MAX_OUTPUT_TOKENS = 700;

function buildPrompt(q: {
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  explanation_brief: string | null;
}): string {
  const lines: string[] = [];
  lines.push('Explain this exam question to a student who just got it wrong.');
  lines.push('');
  lines.push(`QUESTION: ${q.question_text || '(no text)'}`);

  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length > 0) {
    lines.push('OPTIONS:');
    for (const o of options as Array<{ id?: string; text?: string }>) {
      lines.push(`  ${String(o?.id ?? '?').toUpperCase()}. ${o?.text ?? ''}`);
    }
  }
  lines.push(`CORRECT ANSWER: ${q.correct_answer || '(not recorded)'}`);
  if (q.explanation_brief) lines.push(`SHORT EXPLANATION ALREADY GIVEN: ${q.explanation_brief}`);

  lines.push('');
  lines.push('HOW TO ANSWER');
  // The answer key is authoritative. Left to itself the model will sometimes
  // re-solve, disagree with the key, and tell the student the paper is wrong.
  lines.push('The correct answer above is authoritative. Explain why it is correct.');
  lines.push('Never contradict it, and never suggest a different option is right.');
  lines.push('If it is numerical or aptitude, show the working step by step with the numbers.');
  lines.push('If it is theory, give the reasoning and the fact it rests on.');
  lines.push('Where it helps, say briefly why the most tempting wrong option is wrong.');
  lines.push('Write 4 to 8 short sentences in plain English. No markdown, no headings, no bullets.');
  lines.push('Do not open with a greeting or repeat the question back.');
  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const questionId = typeof body?.question_id === 'string' ? body.question_id : '';
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : null;
    if (!questionId) return NextResponse.json({ error: 'Missing question_id' }, { status: 400 });

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClient();
    const { data: question, error } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_text, options, correct_answer, explanation_brief, explanation_detailed')
      .eq('id', questionId)
      .maybeSingle();

    if (error) throw error;
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    // Already written by whoever asked first.
    if (question.explanation_detailed && question.explanation_detailed.trim()) {
      return NextResponse.json({ data: { explanation: question.explanation_detailed, cached: true } });
    }

    let text = '';
    try {
      text = await generateGeminiText({
        parts: [{ text: buildPrompt(question) }],
        systemInstruction:
          'You are a patient tutor for architecture entrance exams (NATA and JEE Paper 2). You explain why a given answer is correct, clearly and without padding.',
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed';
      // The shared key running dry is the common case and it is temporary, so
      // it gets a 503 and its own copy rather than looking like a broken button.
      const rateLimited = message.includes('429');
      return NextResponse.json(
        {
          error: rateLimited
            ? 'The AI tutor is busy right now. Please try again in a few minutes.'
            : 'Could not generate a detailed explanation just now.',
        },
        { status: rateLimited ? 503 : 502 },
      );
    }

    const explanation = text.trim();
    if (!explanation) {
      return NextResponse.json({ error: 'Could not generate a detailed explanation just now.' }, { status: 502 });
    }

    // Cache for everyone else. A failure here is not worth failing the request
    // over: the student still gets their explanation, the next one just pays
    // for the call again.
    const { error: writeError } = await supabase
      .from('nexus_qb_questions')
      .update({ explanation_detailed: explanation })
      .eq('id', questionId);
    if (writeError) console.error('Explain cache write failed:', writeError.message);

    return NextResponse.json({ data: { explanation, cached: false } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to explain this question';
    console.error('Explain POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/drawing/ai-feedback
 * Body: { submission_id: string }
 *
 * Uses Google Gemini (free tier) by default.
 * Falls back to Anthropic Claude if ANTHROPIC_API_KEY is set and GEMINI_API_KEY is not.
 *
 * Env vars:
 * - GEMINI_API_KEY (free: 15 RPM, 1M tokens/day)
 * - ANTHROPIC_API_KEY (paid, optional fallback)
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const AI_PROMPT = `You are an expert NATA (National Aptitude Test in Architecture) drawing evaluator. Evaluate this student's drawing practice submission.

QUESTION_CONTEXT

Evaluate on these criteria:
1. COMPOSITION: Is the drawing well-composed? Is the frame well-utilized? Is there visual balance?
2. PROPORTION: Are objects proportional to each other? Are sizes realistic?
3. SHADING: Is there a clear light direction? Are shadows present and consistent? Quality of shading technique?
4. COMPLETENESS: Does the drawing address all objects/requirements mentioned in the question?
5. TECHNIQUE: Line quality, texture rendering, overall craftsmanship.

Respond ONLY in valid JSON format (no markdown, no code blocks, no backticks):
{
  "grade": "A" or "B" or "C" or "D",
  "feedback": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "composition": "brief assessment",
  "proportion": "brief assessment",
  "shading": "brief assessment",
  "completeness": "brief assessment",
  "technique": "brief assessment",
  "improvement_tip": "one specific actionable tip to improve",
  "progress_note": "comparison with previous attempts if available, otherwise null"
}`;

async function callGemini(base64: string, mimeType: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Gemini API error:', JSON.stringify(err));
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(base64: string, mediaType: string, prompt: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { submission_id } = body;

    if (!submission_id) {
      return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 });
    }

    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI feedback not configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.' }, { status: 503 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get submission with question
    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('*, question:drawing_questions(*)')
      .eq('id', submission_id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Fetch image and convert to base64
    const imageUrl = submission.original_image_url;
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.startsWith('image/') ? contentType : 'image/jpeg';

    // Build question context
    const question = submission.question as any;
    let questionContext = question
      ? `Question: "${question.question_text}"
Category: ${question.category}
Objects to draw: ${(question.objects || []).join(', ')}
Color constraint: ${question.color_constraint || 'none'}
Design principle: ${question.design_principle || 'none'}`
      : 'Free practice drawing (no specific question)';

    // Progress tracking (Phase 9)
    if (question) {
      const { data: prevSubmissions } = await supabase
        .from('drawing_submissions')
        .select('ai_feedback, tutor_rating, attempt_number')
        .eq('student_id', submission.student_id)
        .eq('question_id', question.id)
        .not('ai_feedback', 'is', null)
        .order('attempt_number', { ascending: true });

      if (prevSubmissions && prevSubmissions.length > 0) {
        const prevGrades = prevSubmissions
          .map((s: any) => `Attempt #${s.attempt_number}: Grade ${s.ai_feedback?.grade || '?'}, Tutor rating: ${s.tutor_rating || 'not yet'}`)
          .join('\n');
        questionContext += `\n\nPrevious attempts by this student:\n${prevGrades}\nCompare with previous work and note improvement.`;
      }
    }

    const prompt = AI_PROMPT.replace('QUESTION_CONTEXT', questionContext);

    // Call AI (Gemini first, Anthropic fallback)
    let responseText: string;
    let provider: string;

    if (GEMINI_API_KEY) {
      responseText = await callGemini(base64, mimeType, prompt);
      provider = 'gemini';
    } else {
      responseText = await callAnthropic(base64, mimeType, prompt);
      provider = 'anthropic';
    }

    // Parse JSON from response
    let aiFeedback;
    try {
      aiFeedback = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiFeedback = JSON.parse(jsonMatch[0]);
      } else {
        console.error(`Failed to parse ${provider} response:`, responseText.substring(0, 500));
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
      }
    }

    // Save to database
    await supabase
      .from('drawing_submissions')
      .update({ ai_feedback: { ...aiFeedback, provider } })
      .eq('id', submission_id);

    return NextResponse.json({ feedback: aiFeedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI feedback failed';
    console.error('AI feedback error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

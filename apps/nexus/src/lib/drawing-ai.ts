/**
 * Core AI drawing feedback generation logic.
 * Used by both the on-demand API route (teacher/student) and the
 * background trigger on submission creation.
 */

import { getSupabaseAdminClient } from '@neram/database';

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

Also provide:
6. OVERLAY ANNOTATIONS: Identify 3-6 specific areas in this drawing that need correction. For each, give the rough position (choose from: top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right), a short label (max 6 words), and severity (high/medium/low).

7. ANNOTATION OVERLAY PROMPT: Write a ChatGPT prompt that a teacher will use alongside this student image to get an annotated correction overlay. The prompt should instruct ChatGPT to: keep the original drawing visible, draw red arrows pointing to each problem area identified above, add short text labels near each arrow explaining what needs correction. Reference the specific issues found. Max 120 words.

8. REFERENCE IMAGE PROMPTS: Write three ChatGPT prompts to generate ideal reference versions of this drawing at different skill levels. DRAWING_MEDIUM_CONTEXT Include style: "hand-drawn appearance, not digital, looks manually created by a student, pencil/colour-pencil texture".
   - beginner: Simple, basic shapes, minimal detail, focus on correct placement only. Max 80 words.
   - medium: Moderate detail, correct proportions, some shading. Max 100 words.
   - expert: Full technique, shading, texture, professional finish. Max 120 words.

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
  "progress_note": "comparison with previous attempts if available, otherwise null",
  "overlay_annotations": [
    {"area": "top-left", "label": "Proportion off", "severity": "high"},
    {"area": "center", "label": "Good shading here", "severity": "low"}
  ],
  "annotation_overlay_prompt": "I am sharing a student drawing with you. Please redraw keeping the original marks visible, then overlay corrections: draw red arrows to the problem areas and add short text labels. Keep it educational.",
  "reference_prompts": {
    "beginner": "Draw a basic version of this drawing with simple shapes only...",
    "medium": "Draw this composition with moderate detail and correct proportions...",
    "expert": "Draw a refined version with full technique, shading, and texture..."
  }
}`;

async function callGemini(base64: string, mimeType: string, prompt: string, retries = 2): Promise<string> {
  // Try flash first, fall back to flash-lite on rate limit (higher RPM quota)
  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Alternate models: flash on even attempts, flash-lite on odd attempts after first failure
    const model = attempt === 0 ? models[0] : models[1];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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
          maxOutputTokens: 2000,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    const errBody = await res.json().catch(() => ({}));

    if (res.status === 400 || res.status === 403) {
      console.error(`Gemini API auth error (${res.status}):`, JSON.stringify(errBody));
      throw new Error(`Gemini API key invalid or unauthorized (${res.status}). Check GEMINI_API_KEY env var.`);
    }

    if (res.status === 429) {
      if (attempt < retries) {
        console.warn(`Gemini ${model} rate limited (429), retrying with flash-lite...`);
        continue;
      }
      throw new Error('Gemini API 429: rate limit reached');
    }

    console.error(`Gemini API error (${res.status}):`, JSON.stringify(errBody));
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error('Gemini API: all retries exhausted');
}

async function callAnthropic(base64: string, mediaType: string, prompt: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
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

/**
 * Generate AI feedback for a drawing submission and save to DB.
 * Returns the parsed feedback object or throws on failure.
 */
export async function generateDrawingAIFeedback(submission_id: string): Promise<Record<string, unknown>> {
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    throw new Error('AI feedback not configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.');
  }

  const supabase = getSupabaseAdminClient();

  // Mark as generating
  await supabase
    .from('drawing_submissions' as any)
    .update({ ai_draft_status: 'generating' })
    .eq('id', submission_id);

  try {
    // Get submission with question
    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('*, question:drawing_questions(*)')
      .eq('id', submission_id)
      .single();

    if (!submission) throw new Error('Submission not found');

    // Fetch image and convert to base64
    const imageRes = await fetch(submission.original_image_url);
    if (!imageRes.ok) throw new Error('Failed to fetch image');
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
Design principle: ${question.design_principle || 'none'}
Difficulty: ${question.difficulty_tag || 'medium'}`
      : 'Free practice drawing (no specific question)';

    // Drawing medium for corrected image prompt
    const drawingMedium = question?.category === '2d_composition'
      ? 'colour pencil on white paper, vibrant colours'
      : question?.category === '3d_composition'
      ? 'pencil sketch on white paper, shading with pencil'
      : 'pencil sketch or colour pencil on white paper';
    const mediumContext = `Medium: ${drawingMedium}.`;

    // Progress tracking
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

    const prompt = AI_PROMPT
      .replace('QUESTION_CONTEXT', questionContext)
      .replace('DRAWING_MEDIUM_CONTEXT', mediumContext);

    // Call AI
    let responseText: string;
    let provider: string;
    if (GEMINI_API_KEY) {
      responseText = await callGemini(base64, mimeType, prompt);
      provider = 'gemini';
    } else {
      responseText = await callAnthropic(base64, mimeType, prompt);
      provider = 'anthropic';
    }

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.error(`Failed to parse ${provider} response:`, responseText.substring(0, 500));
        throw new Error('Failed to parse AI response');
      }
    }

    const {
      overlay_annotations,
      annotation_overlay_prompt,
      reference_prompts,
      corrected_image_prompt,
      ...aiFeedback
    } = parsed as any;

    // Save all fields to DB
    await supabase
      .from('drawing_submissions' as any)
      .update({
        ai_feedback: { ...aiFeedback, provider },
        ai_overlay_annotations: overlay_annotations || null,
        ai_corrected_image_prompt: corrected_image_prompt || null,
        ai_annotation_prompt: annotation_overlay_prompt || null,
        ai_reference_prompts: reference_prompts || null,
        ai_draft_status: 'ready',
      })
      .eq('id', submission_id);

    return {
      ...aiFeedback,
      overlay_annotations,
      corrected_image_prompt,
      annotation_overlay_prompt,
      reference_prompts,
      provider,
    };
  } catch (err) {
    // Mark as failed so teacher knows generation didn't succeed
    await supabase
      .from('drawing_submissions' as any)
      .update({ ai_draft_status: 'failed' })
      .eq('id', submission_id);
    throw err;
  }
}

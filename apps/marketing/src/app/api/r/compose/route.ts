/**
 * POST /api/r/compose  (multipart: token, audio? | text?, helped?, corrections?)
 *
 * Turns what the student said (a recording) or typed into a written review. One
 * Gemini call does both the transcription and the writing.
 *
 * Guarded three ways, because this is a public endpoint that spends money:
 *  - the link must be live and not yet moderated;
 *  - the link has its own allowance (MAX_AI_CALLS_PER_REQUEST), so a forwarded
 *    link cannot become a free transcription service;
 *  - the feature has a daily cap and a per-visitor hourly cap in @neram/ai.
 * When any of them says no, the page falls back to typing. Submitting never
 * depends on AI.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Gemini usually answers in 3 to 8 seconds for a one-minute clip.
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { MAX_AI_CALLS_PER_REQUEST, reserveAiCall, sanitizeCorrections } from '@neram/database/queries';
import {
  AiBlockedError,
  REVIEW_AUDIO_MIME,
  REVIEW_COMPOSE_SCHEMA,
  buildReviewComposeInstruction,
  generateGemini,
  hashClientKey,
  parseComposedReview,
  type GeminiPart,
} from '@neram/ai';
import { recordingContainer } from '@neram/ui/utils';
import { NO_STORE, jsonError, requestForToken } from '@/lib/review-request-server';

/** Vercel refuses request bodies over 4.5 MB. Two minutes of speech is under 1 MB. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Please try again.');
  }

  try {
    const supabase = createAdminClient();
    const found = await requestForToken(form.get('token'), supabase);
    if ('response' in found) return found.response;
    const req = found.request;

    if (req.testimonial_id) {
      const { data: t } = await supabase.from('testimonials').select('publication_status').eq('id', req.testimonial_id).maybeSingle();
      if (t && (t as any).publication_status !== 'pending_moderation') {
        return jsonError(409, 'LOCKED', 'Neram Classes has already reviewed this.');
      }
    }

    const audio = form.get('audio');
    const typed = typeof form.get('text') === 'string' ? String(form.get('text')).trim() : '';
    const parts: GeminiPart[] = [];

    if (audio && typeof audio !== 'string') {
      const mime = recordingContainer(audio.type);
      if (!(REVIEW_AUDIO_MIME as readonly string[]).includes(mime)) {
        return jsonError(415, 'BAD_AUDIO', 'This recording format is not supported. Please type your review instead.');
      }
      if (audio.size > MAX_AUDIO_BYTES) return jsonError(413, 'TOO_LONG', 'That recording is too long. Please keep it under two minutes.');
      if (audio.size < 2_000) return jsonError(400, 'TOO_SHORT', 'We could not hear anything. Please try again a little closer to the phone.');
      const data = Buffer.from(await audio.arrayBuffer()).toString('base64');
      parts.push({ text: 'Here is the student speaking about Neram Classes. Transcribe it, then write the review.' });
      parts.push({ inline_data: { mime_type: mime, data } });
    } else if (typed.length >= 10) {
      parts.push({ text: `Here is what the student typed. Write the review from it.\n\n"""${typed.slice(0, 2000)}"""` });
    } else {
      return jsonError(400, 'EMPTY', 'Say or type a few sentences first.');
    }

    if (!(await reserveAiCall(req, supabase))) {
      return jsonError(429, 'AI_LIMIT', 'You have used the AI help for this link. You can still type or edit your review.');
    }

    let helped: string[] = [];
    try {
      const raw = JSON.parse(String(form.get('helped') || '[]'));
      if (Array.isArray(raw)) helped = raw.filter((h) => typeof h === 'string').slice(0, 6);
    } catch {
      // Chips are a nicety; a bad value just means none.
    }
    let correctionsRaw: unknown = {};
    try {
      correctionsRaw = JSON.parse(String(form.get('corrections') || '{}'));
    } catch {
      correctionsRaw = {};
    }
    const corrections = sanitizeCorrections(correctionsRaw, req);

    let composed;
    try {
      const result = await generateGemini({
        feature: 'marketing.review-compose',
        clientKey: hashClientKey(`review-link:${req.id}`),
        systemInstruction: buildReviewComposeInstruction({
          firstName: req.student_name.split(/\s+/)[0],
          examType: req.exam_type,
          examYear: Number(corrections.exam_year ?? req.exam_year) || null,
          airRank: Number(corrections.air_rank ?? req.air_rank) || null,
          percentile: corrections.percentile != null ? Number(corrections.percentile) : req.percentile,
          collegeAdmitted: corrections.college_admitted ?? req.college_admitted,
          centreCity: corrections.city ?? req.city,
          learningMode: req.learning_mode,
          helped,
        }),
        parts,
        responseMimeType: 'application/json',
        responseSchema: REVIEW_COMPOSE_SCHEMA,
        temperature: 0.4,
        maxOutputTokens: 1500,
      });
      composed = parseComposedReview(result.text);
    } catch (err) {
      if (err instanceof AiBlockedError) {
        return jsonError(503, 'AI_UNAVAILABLE', 'AI help is resting right now. Please type your review instead.');
      }
      throw err;
    }

    if (!composed.review) {
      return jsonError(422, 'NOTHING_HEARD', 'We could not make out a review from that. Please try again or type it.', {
        transcript: composed.transcript,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        review: composed.review,
        transcript: composed.transcript,
        language: composed.language,
        aiCallsLeft: Math.max(0, MAX_AI_CALLS_PER_REQUEST - (req.ai_call_count || 0) - 1),
      },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    console.error('[r/compose]', error?.message || error);
    return jsonError(500, 'ERROR', 'AI help did not work this time. You can type your review instead.');
  }
}

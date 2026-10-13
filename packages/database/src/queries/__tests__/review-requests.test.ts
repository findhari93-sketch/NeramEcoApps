import { describe, test, expect } from 'vitest';
import { createFakeSupabase } from './fake-supabase';
import {
  MAX_AI_CALLS_PER_REQUEST,
  createReviewRequest,
  getReviewRequestByToken,
  googleWriteReviewLink,
  loadReviewTargets,
  markReviewRequestOpened,
  mintReviewRequestToken,
  pickSecondaryPlatform,
  reserveAiCall,
  resolveGoogleTarget,
  reviewRequestProgress,
  sanitizeCorrections,
  sanitizeReviewRequestInput,
  staffEditTestimonial,
  submitReviewFromRequest,
  type ReviewCentre,
  type ReviewSubmission,
} from '../review-requests';
import type { ReviewRequest } from '../../types';

/**
 * The link is the only credential guarding a review that goes out under a
 * student's name, so the refusals and the "locked once moderated" rule matter
 * most. The routing tests hold the Google policy line: one profile per student,
 * and online students never sent to a centre they did not attend.
 */

const PLACE = 'ChIJabcdefghijk_-12';

function request(over: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: 'rr-1',
    token: 'tok',
    status: 'active',
    user_id: null,
    student_result_id: null,
    student_name: 'Priya Sharma',
    photo_url: 'https://cdn.example.com/p.jpg',
    exam_type: 'NATA',
    exam_year: 2026,
    air_rank: 142,
    percentile: null,
    score: null,
    college_admitted: 'SPA Delhi',
    center_id: 'c-cbe',
    city: 'Coimbatore',
    learning_mode: 'offline',
    phone: null,
    student_corrections: {},
    testimonial_id: null,
    ai_call_count: 0,
    google_target_url: null,
    google_clicked_at: null,
    google_posted_self_reported_at: null,
    secondary_platform: null,
    secondary_clicked_at: null,
    reminder_sent_at: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    sent_at: null,
    sent_by: null,
    opened_at: null,
    open_count: 0,
    submitted_at: null,
    cancelled_by: null,
    cancelled_at: null,
    ...over,
  };
}

const submission = (over: Partial<ReviewSubmission> = {}): ReviewSubmission => ({
  text: 'Neram helped me crack NATA with a top score. The drawing practice was the best part.',
  rating: 5,
  displayName: 'Priya S.',
  consentToPublish: true,
  photoConsent: true,
  inputMode: 'typed',
  ...over,
});

describe('mintReviewRequestToken', () => {
  test('is URL safe and long enough not to be guessed', () => {
    const t = mintReviewRequestToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
  });
});

describe('googleWriteReviewLink', () => {
  test('builds the write-review link for a real place id', () => {
    expect(googleWriteReviewLink(PLACE)).toBe(`https://search.google.com/local/writereview?placeid=${PLACE}`);
  });
  test('refuses malformed ids', () => {
    expect(googleWriteReviewLink('bad id')).toBeNull();
    expect(googleWriteReviewLink(null)).toBeNull();
  });
});

describe('resolveGoogleTarget', () => {
  const cbe: ReviewCentre = { id: 'c-cbe', name: 'Coimbatore', google_place_id: PLACE };
  const hq: ReviewCentre = { id: 'c-hq', name: 'HQ', center_type: 'headquarters', google_place_id: 'ChIJhqhqhqhqhq' };
  const noPlace: ReviewCentre = { id: 'c-tby', name: 'Tambaram' };

  test('offline students review the centre they attended', () => {
    expect(resolveGoogleTarget({ learningMode: 'offline', centre: cbe, headquarters: hq, links: [] })?.centerId).toBe('c-cbe');
  });

  test('online students review headquarters first', () => {
    expect(resolveGoogleTarget({ learningMode: 'online', centre: cbe, headquarters: hq, links: [] })?.centerId).toBe('c-hq');
  });

  test('online students fall back to the centre staff picked when HQ has no link', () => {
    const bareHq = { ...hq, google_place_id: null };
    expect(resolveGoogleTarget({ learningMode: 'online', centre: cbe, headquarters: bareHq, links: [] })?.centerId).toBe('c-cbe');
  });

  test('an offline student whose centre has no Google link is never sent to another centre', () => {
    expect(resolveGoogleTarget({ learningMode: 'offline', centre: noPlace, headquarters: hq, links: [] })).toBeNull();
  });

  test('a configured review URL wins over the place id', () => {
    const url = 'https://g.page/r/abc/review';
    const target = resolveGoogleTarget({
      learningMode: 'hybrid',
      centre: cbe,
      headquarters: hq,
      links: [{ center_id: 'c-cbe', platform: 'google', review_url: url }],
    });
    expect(target?.url).toBe(url);
  });
});

describe('pickSecondaryPlatform', () => {
  test('rotates to the least used directory', () => {
    expect(pickSecondaryPlatform(['justdial', 'sulekha'], { justdial: 4, sulekha: 1 })).toBe('sulekha');
  });
  test('only offers directories that have a link', () => {
    expect(pickSecondaryPlatform(['justdial'], { justdial: 9 })).toBe('justdial');
    expect(pickSecondaryPlatform([], {})).toBeNull();
  });
});

describe('reviewRequestProgress', () => {
  test('the furthest step wins', () => {
    expect(reviewRequestProgress(request())).toBe('not_sent');
    expect(reviewRequestProgress(request({ sent_at: 'x' }))).toBe('sent');
    expect(reviewRequestProgress(request({ sent_at: 'x', opened_at: 'y' }))).toBe('opened');
    expect(reviewRequestProgress(request({ submitted_at: 'z' }), 'pending_moderation')).toBe('submitted');
    expect(reviewRequestProgress(request({ submitted_at: 'z' }), 'published')).toBe('published');
    expect(reviewRequestProgress(request({ google_posted_self_reported_at: 'g' }), 'published')).toBe('posted_google');
    expect(reviewRequestProgress(request({ status: 'cancelled', submitted_at: 'z' }))).toBe('cancelled');
  });
});

describe('sanitizeReviewRequestInput', () => {
  const now = new Date('2026-10-10');
  test('accepts a full prefill', () => {
    const r = sanitizeReviewRequestInput(
      { studentName: '  Priya   Sharma ', examType: 'NATA', examYear: '2026', airRank: '142', percentile: '98.567', learningMode: 'online' },
      now,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.studentName).toBe('Priya Sharma');
      expect(r.value.airRank).toBe(142);
      expect(r.value.percentile).toBe(98.567);
    }
  });
  test('names each bad field', () => {
    const r = sanitizeReviewRequestInput({ studentName: '', examType: 'GATE', percentile: 120, airRank: -3, photoUrl: 'http://x' }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['airRank', 'examType', 'percentile', 'photoUrl', 'studentName']);
  });
});

describe('sanitizeCorrections', () => {
  test('keeps only real changes to allowed facts', () => {
    const out = sanitizeCorrections(
      { college_admitted: 'NIT Trichy', air_rank: '142', city: 'Coimbatore', student_name: 'Hacker', percentile: '500' },
      request(),
    );
    expect(out).toEqual({ college_admitted: 'NIT Trichy' });
  });
});

describe('getReviewRequestByToken', () => {
  test('refuses unknown, cancelled and expired links', async () => {
    const { client } = createFakeSupabase({
      review_requests: [
        request({ id: 'a', token: 'cancelled', status: 'cancelled' }),
        request({ id: 'b', token: 'old', expires_at: new Date(Date.now() - 1000).toISOString() }),
      ],
    });
    expect(await getReviewRequestByToken('nope', client)).toEqual({ refusal: 'not_found' });
    expect(await getReviewRequestByToken('cancelled', client)).toEqual({ refusal: 'cancelled' });
    expect(await getReviewRequestByToken('old', client)).toEqual({ refusal: 'expired' });
  });

  test('a submitted link still opens after its time, so the Google step stays reachable', async () => {
    const { client } = createFakeSupabase({
      review_requests: [request({ token: 'done', status: 'submitted', submitted_at: 'x', expires_at: new Date(Date.now() - 1000).toISOString() })],
    });
    const r = await getReviewRequestByToken('done', client);
    expect('request' in r).toBe(true);
  });
});

describe('createReviewRequest', () => {
  test('reuses the live link for a known student unless regenerating', async () => {
    const { client, tables } = createFakeSupabase();
    const input = { userId: 'u-1', studentName: 'Priya', examType: 'NATA' as const };
    const first = await createReviewRequest(input, 'staff', client);
    const again = await createReviewRequest(input, 'staff', client);
    expect(again.reused).toBe(true);
    expect(again.request.token).toBe(first.request.token);

    const fresh = await createReviewRequest(input, 'staff', client, { regenerate: true });
    expect(fresh.reused).toBe(false);
    expect(tables.review_requests.find((r) => r.id === first.request.id)?.status).toBe('cancelled');
  });
});

describe('markReviewRequestOpened', () => {
  test('moves active to opened and counts visits', async () => {
    const { client, tables } = createFakeSupabase({ review_requests: [request()] });
    await markReviewRequestOpened(request(), client);
    expect(tables.review_requests[0].status).toBe('opened');
    expect(tables.review_requests[0].open_count).toBe(1);
  });
});

describe('reserveAiCall', () => {
  test('stops once the link has used its allowance', async () => {
    const { client } = createFakeSupabase({ review_requests: [request({ ai_call_count: MAX_AI_CALLS_PER_REQUEST })] });
    expect(await reserveAiCall(request({ ai_call_count: MAX_AI_CALLS_PER_REQUEST }), client)).toBe(false);
  });
  test('counts a call', async () => {
    const { client, tables } = createFakeSupabase({ review_requests: [request()] });
    expect(await reserveAiCall(request(), client)).toBe(true);
    expect(tables.review_requests[0].ai_call_count).toBe(1);
  });
});

describe('submitReviewFromRequest', () => {
  test('lands a verified learner review with the original words and the facts', async () => {
    const { client, tables } = createFakeSupabase({ review_requests: [request()], testimonials: [] });
    const r = await submitReviewFromRequest(request(), submission({ corrections: { college_admitted: 'NIT Trichy' } }), client);
    expect(r.ok).toBe(true);
    const t = tables.testimonials[0];
    expect(t.source).toBe('learner');
    expect(t.is_verified_student).toBe(true);
    expect(t.original_text).toBe(submission().text);
    expect(t.rank).toBe(142);
    expect(t.college_admitted).toBe('NIT Trichy');
    expect(t.student_photo).toBe('https://cdn.example.com/p.jpg');
    expect(tables.review_requests[0].status).toBe('submitted');
    expect(tables.review_requests[0].student_corrections).toEqual({ college_admitted: 'NIT Trichy' });
  });

  test('leaves the photo off without photo consent', async () => {
    const { client, tables } = createFakeSupabase({ review_requests: [request()], testimonials: [] });
    await submitReviewFromRequest(request(), submission({ photoConsent: false }), client);
    expect(tables.testimonials[0].student_photo).toBeNull();
  });

  test('updates the same row while it waits for staff', async () => {
    const { client, tables } = createFakeSupabase({
      review_requests: [request({ testimonial_id: 't-1', submitted_at: 'x', status: 'submitted' })],
      testimonials: [{ id: 't-1', publication_status: 'pending_moderation' }],
    });
    const r = await submitReviewFromRequest(
      request({ testimonial_id: 't-1', submitted_at: 'x', status: 'submitted' }),
      submission({ rating: 4 }),
      client,
    );
    expect(r).toEqual({ ok: true, testimonialId: 't-1', updated: true });
    expect(tables.testimonials).toHaveLength(1);
    expect(tables.testimonials[0].rating).toBe(4);
  });

  test('is locked once staff have moderated it', async () => {
    const { client } = createFakeSupabase({
      review_requests: [request({ testimonial_id: 't-1' })],
      testimonials: [{ id: 't-1', publication_status: 'published' }],
    });
    const r = await submitReviewFromRequest(request({ testimonial_id: 't-1' }), submission(), client);
    expect(r).toEqual({ ok: false, refusal: 'locked' });
  });

  test('refuses without consent and with too little text', async () => {
    const { client } = createFakeSupabase({ review_requests: [request()], testimonials: [] });
    expect(await submitReviewFromRequest(request(), submission({ consentToPublish: false }), client)).toEqual({ ok: false, refusal: 'no_consent' });
    const short = await submitReviewFromRequest(request(), submission({ text: 'Good' }), client);
    expect(short.ok).toBe(false);
  });

  test('keeps the transcript only for a spoken review', async () => {
    const { client, tables } = createFakeSupabase({ review_requests: [request()], testimonials: [] });
    await submitReviewFromRequest(request(), submission({ inputMode: 'voice', voiceTranscript: 'naan neram la padichen' }), client);
    expect(tables.testimonials[0].voice_transcript).toBe('naan neram la padichen');
    expect(tables.testimonials[0].input_mode).toBe('voice');
  });
});

describe('staffEditTestimonial', () => {
  test('changes what is published and never the original words', async () => {
    const { client, tables } = createFakeSupabase({
      testimonials: [{ id: 't-1', source: 'learner', content: { en: 'old words here that are long enough', ta: 'x' }, original_text: 'old words here that are long enough' }],
    });
    await staffEditTestimonial('t-1', { text: 'Polished words that read better than before.', displayName: 'Priya S' }, 'staff-1', client);
    const t = tables.testimonials[0];
    expect(t.content).toEqual({ en: 'Polished words that read better than before.', ta: 'x' });
    expect(t.original_text).toBe('old words here that are long enough');
    expect(t.staff_edited).toBe(true);
    expect(t.edited_by).toBe('staff-1');
    expect(t.consent_display_name).toBe('Priya S');
  });
});

describe('loadReviewTargets', () => {
  test('remembers the Google profile and a rotated directory on the row', async () => {
    const { client, tables } = createFakeSupabase({
      review_requests: [request(), { id: 'old', secondary_platform: 'justdial' }],
      offline_centers: [
        { id: 'c-cbe', name: 'Coimbatore', is_active: true, center_type: 'sub_office', google_place_id: PLACE },
        { id: 'c-hq', name: 'HQ', is_active: true, center_type: 'headquarters', google_place_id: null },
      ],
      review_platform_urls: [
        { center_id: 'c-cbe', platform: 'justdial', review_url: 'https://jd.example/cbe', is_active: true },
        { center_id: 'c-hq', platform: 'sulekha', review_url: 'https://sulekha.example/hq', is_active: true },
      ],
    });
    const targets = await loadReviewTargets(request(), client);
    expect(targets.google?.centerId).toBe('c-cbe');
    expect(targets.secondary).toEqual({ platform: 'sulekha', url: 'https://sulekha.example/hq' });
    expect(tables.review_requests[0].secondary_platform).toBe('sulekha');
    expect(tables.review_requests[0].google_target_url).toContain(PLACE);
  });
});

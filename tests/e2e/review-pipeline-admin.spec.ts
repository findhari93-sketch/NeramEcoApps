import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin side of the verified review pipeline (review links Phases 1 to 3),
 * through the API the pages call. The admin-chrome project sends a staff test
 * token on every request (playwright.config.ts). The pages themselves need a
 * Microsoft session, which Entra MFA keeps out of Playwright; their logic is
 * covered by the unit tests in apps/admin/src/lib.
 *
 * Covers: creating a review link and its WhatsApp message, the reminder after a
 * student submits, staff editing a review (original words kept), per-centre
 * review links, and Google Business Profile while it is NOT connected (the
 * state until Google approves API access): overview, sync, cron, replies and
 * success posts all answer clearly instead of failing.
 *
 * Seeds rows named "E2E Pipeline ..." on staging and removes them in afterAll:
 *   delete from review_requests where student_name like 'E2E Pipeline%';
 *   delete from testimonials where student_name like 'E2E Pipeline%';
 *   delete from gbp_reviews where google_review_name like 'e2e/%';
 */

const ADMIN = APP_URLS.admin;
const PREFIX = 'E2E Pipeline';
const COIMBATORE = '998ca9d0-9e41-4b4f-8a28-25411f1054a7';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const db = admin();
const createdRequests: string[] = [];
const createdTestimonials: string[] = [];
const batchCreated: string[] = [];
const seededUsers: string[] = [];
const TRICHY = '6eda28b7-6e8a-423f-84b3-6a41f3ebe77f';
let originalLinks: Array<{ platform: string; review_url: string; is_active: boolean }> = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (!db) return;
  const { data } = await db.from('review_platform_urls').select('platform, review_url, is_active').eq('center_id', COIMBATORE);
  originalLinks = (data as typeof originalLinks) || [];
});

test.afterAll(async () => {
  if (!db) return;
  // Links made for real staging students by the batch test, by id only.
  if (batchCreated.length) await db.from('review_requests').delete().in('id', batchCreated);
  if (seededUsers.length) {
    await db.from('review_requests').delete().in('user_id', seededUsers);
    await db.from('lead_profiles').delete().in('user_id', seededUsers);
    await db.from('users').delete().in('id', seededUsers);
  }
  await db.from('review_requests').update({ testimonial_id: null }).like('student_name', `${PREFIX}%`);
  if (createdTestimonials.length) await db.from('gbp_local_posts').delete().in('testimonial_id', createdTestimonials);
  await db.from('testimonials').delete().like('student_name', `${PREFIX}%`);
  await db.from('review_requests').delete().like('student_name', `${PREFIX}%`);
  await db.from('gbp_reviews').delete().like('google_review_name', 'e2e/%');
  // Put the centre's review links back exactly as they were.
  await db.from('review_platform_urls').delete().eq('center_id', COIMBATORE);
  if (originalLinks.length) await db.from('review_platform_urls').insert(originalLinks.map((l) => ({ ...l, center_id: COIMBATORE })));
});

test.beforeEach(() => test.skip(!db, 'needs Supabase service credentials'));

test.describe('Review requests', () => {
  test('AC1: create a link with a congratulating WhatsApp message on the marketing host', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/review-requests`, {
      data: { items: [{ studentName: `${PREFIX} Priya Sharma`, examType: 'NATA', examYear: 2026, airRank: 142, collegeAdmitted: 'SPA Delhi', centerId: COIMBATORE, learningMode: 'offline', phone: '9999900011' }] },
    });
    expect(res.status()).toBe(200);
    const { created } = await res.json();
    expect(created).toHaveLength(1);
    createdRequests.push(created[0].id);
    expect(created[0].url).toMatch(/^http:\/\/localhost:3010\/r\/[A-Za-z0-9_-]{43}$/);
    expect(created[0].message).toContain('Congratulations on joining SPA Delhi!');
    expect(created[0].message).not.toMatch(/—|--/);
  });

  test('refuses bad input before writing anything', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/review-requests`, {
      data: { items: [{ studentName: `${PREFIX} Ok`, examType: 'NATA' }, { studentName: '', examType: 'GATE', percentile: 140 }] },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.row).toBe(1);
    expect(Object.keys(body.fieldErrors).sort()).toEqual(['examType', 'percentile', 'studentName']);
    const { count } = await db!.from('review_requests').select('id', { count: 'exact', head: true }).eq('student_name', `${PREFIX} Ok`);
    expect(count).toBe(0);
  });

  test('AC2: the list shows progress, and the one reminder appears after the student submits', async ({ request }) => {
    const id = createdRequests[0];
    expect((await request.patch(`${ADMIN}/api/review-requests/${id}`, { data: { action: 'mark_sent' } })).status()).toBe(200);
    let row = (await (await request.get(`${ADMIN}/api/review-requests`)).json()).requests.find((r: any) => r.id === id);
    expect(row.progress).toBe('sent');
    expect(row.reminder).toBeNull();

    await db!.from('review_requests').update({ submitted_at: new Date().toISOString(), status: 'submitted', google_target_url: 'https://g.page/r/e2e/review' }).eq('id', id);
    row = (await (await request.get(`${ADMIN}/api/review-requests`)).json()).requests.find((r: any) => r.id === id);
    expect(row.progress).toBe('submitted');
    expect(row.reminder.platform).toBe('google');
    expect(row.reminder.message).toContain('post the same review on Google');

    expect((await request.patch(`${ADMIN}/api/review-requests/${id}`, { data: { action: 'mark_reminded' } })).status()).toBe(200);
    row = (await (await request.get(`${ADMIN}/api/review-requests`)).json()).requests.find((r: any) => r.id === id);
    expect(row.reminder).toBeNull();
    expect(row.reminder_sent_at).not.toBeNull();
  });

  test('people search finds students ranked by name', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/review-requests/people?q=e2e`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).people)).toBe(true);
  });
});

test.describe('Staff edit of a review', () => {
  test('AC3: staff change what is published; the student’s words stay on record', async ({ request }) => {
    const { data, error } = await db!
      .from('testimonials')
      .insert({ student_name: `${PREFIX} Learner`, content: { en: 'Original student words about the classes here.' }, original_text: 'Original student words about the classes here.', exam_type: 'NATA', year: 2026, city: 'Chennai', course_name: 'NATA Preparation', source: 'learner', rating: 4 })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdTestimonials.push(data!.id);

    const res = await request.patch(`${ADMIN}/api/testimonials/${data!.id}/review-edit`, {
      data: { text: 'Tidied words that say the same thing more clearly.', displayName: 'Learner P.', collegeAdmitted: 'NIT Trichy', rank: 500 },
    });
    expect(res.status()).toBe(200);
    const { data: t } = await db!.from('testimonials').select('content, original_text, staff_edited, college_admitted, rank, consent_display_name').eq('id', data!.id).single();
    expect(t).toMatchObject({
      content: { en: 'Tidied words that say the same thing more clearly.' },
      original_text: 'Original student words about the classes here.',
      staff_edited: true,
      college_admitted: 'NIT Trichy',
      rank: 500,
      consent_display_name: 'Learner P.',
    });

    const short = await request.patch(`${ADMIN}/api/testimonials/${data!.id}/review-edit`, { data: { text: 'Too short' } });
    expect(short.status()).toBe(400);
  });
});

test.describe('Centre review links', () => {
  test('AC4: only the platform’s own domain is accepted, and a link can be cleared', async ({ request }) => {
    const bad = await request.put(`${ADMIN}/api/centres/${COIMBATORE}/review-links`, { data: { platform: 'justdial', url: 'https://www.sulekha.com/x' } });
    expect(bad.status()).toBe(400);

    const good = await request.put(`${ADMIN}/api/centres/${COIMBATORE}/review-links`, { data: { platform: 'justdial', url: 'https://www.justdial.com/Coimbatore/Neram-E2E' } });
    expect(good.status()).toBe(200);
    expect((await (await request.get(`${ADMIN}/api/centres/${COIMBATORE}/review-links`)).json()).links.justdial).toBe('https://www.justdial.com/Coimbatore/Neram-E2E');

    expect((await request.put(`${ADMIN}/api/centres/${COIMBATORE}/review-links`, { data: { platform: 'justdial', url: '' } })).status()).toBe(200);
    expect((await (await request.get(`${ADMIN}/api/centres/${COIMBATORE}/review-links`)).json()).links.justdial).toBeUndefined();
  });
});

test.describe('Google Business Profile, not connected yet', () => {
  test('AC5: overview names the missing credentials and lists centres', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/gbp/overview?filter=all`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(false);
    expect(body.missing).toEqual(['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_ACCOUNT_ID']);
    expect(body.centres.length).toBeGreaterThan(0);
  });

  test('sync and cron answer "not connected" and record the run', async ({ request }) => {
    const sync = await request.post(`${ADMIN}/api/gbp/sync`);
    expect(sync.status()).toBe(409);
    const cron = await request.get(`${ADMIN}/api/cron/gbp-sync`);
    expect(cron.status()).toBe(200);
    expect((await cron.json()).skipped).toBe('not_connected');
    const { data: runs } = await db!.from('gbp_sync_runs').select('status, trigger').order('started_at', { ascending: false }).limit(2);
    expect(runs!.every((r: any) => r.status === 'not_connected')).toBe(true);
  });

  test('a reply is saved as a draft to paste by hand', async ({ request }) => {
    const { data: rev } = await db!
      .from('gbp_reviews')
      .insert({ google_review_name: 'e2e/reviews/1', location_name: 'locations/e2e', center_id: COIMBATORE, reviewer_name: 'E2E Reviewer', star_rating: 2, comment: 'Classes were rushed.', create_time: new Date().toISOString() })
      .select('id')
      .single();
    const listed = (await (await request.get(`${ADMIN}/api/gbp/overview?filter=low`)).json()).reviews;
    expect(listed.some((r: any) => r.id === rev!.id)).toBe(true);

    const post = await request.post(`${ADMIN}/api/gbp/reviews/${rev!.id}/reply`, { data: { comment: 'We are sorry — please call us so we can fix this.' } });
    expect(post.status()).toBe(409);
    expect((await post.json()).saved).toBe(true);
    const { data: saved } = await db!.from('gbp_reviews').select('reply_draft, reply_comment').eq('id', rev!.id).single();
    // Saved as a draft (never as a posted reply), with the em dash removed.
    expect(saved).toEqual({ reply_draft: 'We are sorry, please call us so we can fix this.', reply_comment: null });
  });

  test('AC6: a published verified review becomes a success post draft; publishing waits for the connection', async ({ request }) => {
    const { data: t } = await db!
      .from('testimonials')
      .insert({
        student_name: `${PREFIX} Rank Holder`,
        content: { en: 'Great coaching and patient teachers throughout.' },
        exam_type: 'NATA',
        year: 2026,
        city: 'Coimbatore',
        course_name: 'NATA Preparation',
        source: 'staff',
        publication_status: 'published',
        is_active: true,
        is_verified_student: true,
        rank: 142,
        college_admitted: 'SPA Delhi',
        center_id: COIMBATORE,
        learning_mode: 'offline',
        moderated_at: new Date().toISOString(),
        consent_by: 'staff_recorded',
      })
      .select('id')
      .single();
    createdTestimonials.push(t!.id);

    const list = await (await request.get(`${ADMIN}/api/gbp/posts`)).json();
    const candidate = list.candidates.find((c: any) => c.testimonial_id === t!.id);
    expect(candidate.summary).toContain('scored All India Rank 142 in NATA 2026 and joined SPA Delhi');
    expect(candidate.summary).not.toMatch(/—|--/);

    const publish = await request.post(`${ADMIN}/api/gbp/posts`, { data: { testimonialId: t!.id, summary: candidate.summary, publish: true } });
    expect(publish.status()).toBe(409);
    const after = await (await request.get(`${ADMIN}/api/gbp/posts`)).json();
    expect(after.candidates.find((c: any) => c.testimonial_id === t!.id)).toBeUndefined();
    expect(after.posts.some((p: any) => p.testimonial_id === t!.id && p.status === 'draft')).toBe(true);
  });
});

test.describe('Review links by batch', () => {
  test('AC7: a batch comes back prefilled from records, defaulting to last year', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/review-requests/batch`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.batch).toMatch(/^\d{4}-\d{2}$/);
    expect(body.batches).toContain(body.batch);
    for (const row of body.rows) {
      expect(row).toEqual(
        expect.objectContaining({ userId: expect.any(String), name: expect.any(String), examType: expect.stringMatching(/^(NATA|JEE_PAPER_2|BOTH)$/) }),
      );
    }
  });

  test('AC8: a seeded student is prefilled from their records; one link, marked, never a second', async ({ request }) => {
    // Our own student in the closed 2024-25 batch, with an application form, so the
    // test never depends on (or skips for) whatever staging happens to hold.
    const { data: user, error: userError } = await db!
      .from('users')
      .insert({ name: `${PREFIX} Batch Student`, user_type: 'student', student_program: 'architecture', academic_year: '2024-25', phone: '+919999900033', is_alumni: true })
      .select('id')
      .single();
    expect(userError).toBeNull();
    seededUsers.push(user!.id);
    const { error: leadError } = await db!.from('lead_profiles').insert({ user_id: user!.id, city: 'Trichy', target_exam_year: 2025, interest_course: 'both' });
    expect(leadError).toBeNull();

    const body = await (await request.get(`${ADMIN}/api/review-requests/batch?batch=2024-25`)).json();
    const row = body.rows.find((r: any) => r.userId === user!.id);
    expect(row).toEqual(
      expect.objectContaining({ name: `${PREFIX} Batch Student`, phone: '+919999900033', city: 'Trichy', examYear: 2025, examType: 'BOTH', isAlumni: true, existingRequest: null }),
    );
    // Trichy is stored as "Tiruchirapalli" on the centre: the guess still finds it.
    expect(row.centreId).toBe(TRICHY);

    const item = { userId: row.userId, studentName: row.name, examType: row.examType, examYear: row.examYear, airRank: 999, centerId: row.centreId, learningMode: 'offline', phone: row.phone };
    const first = await (await request.post(`${ADMIN}/api/review-requests`, { data: { items: [item] } })).json();
    expect(first.created[0].reused).toBe(false);
    batchCreated.push(first.created[0].id);

    const after = await (await request.get(`${ADMIN}/api/review-requests/batch?batch=2024-25`)).json();
    expect(after.rows.find((r: any) => r.userId === user!.id).existingRequest).toEqual(expect.objectContaining({ id: first.created[0].id, progress: 'not_sent' }));

    const again = await (await request.post(`${ADMIN}/api/review-requests`, { data: { items: [item] } })).json();
    expect(again.created[0]).toEqual(expect.objectContaining({ id: first.created[0].id, reused: true }));
  });

  test('a made-up batch code answers with an empty list, not an error', async ({ request }) => {
    const body = await (await request.get(`${ADMIN}/api/review-requests/batch?batch=1990-91`)).json();
    expect(body.batch).toBe('1990-91');
    expect(body.rows).toEqual([]);
  });
});

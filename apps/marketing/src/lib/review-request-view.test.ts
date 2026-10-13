import { describe, expect, test } from 'vitest';
import { PUBLIC_REVIEW_VIEW_KEYS, publicReviewView, suggestDisplayName } from './review-request-view';
import type { ReviewRequest } from '@neram/database';

const request = {
  id: 'secret-id',
  token: 'secret-token',
  status: 'opened',
  user_id: 'user-uuid',
  student_result_id: null,
  student_name: 'Priya Sharma',
  photo_url: 'https://cdn.example.com/p.jpg',
  exam_type: 'NATA',
  exam_year: 2026,
  air_rank: 142,
  percentile: null,
  score: 150,
  college_admitted: 'SPA Delhi',
  center_id: 'centre-uuid',
  city: 'Coimbatore',
  learning_mode: 'offline',
  phone: '+919999999999',
  student_corrections: { college_admitted: 'NIT Trichy' },
  testimonial_id: null,
  ai_call_count: 2,
  google_target_url: null,
  google_clicked_at: null,
  google_posted_self_reported_at: null,
  secondary_platform: null,
  secondary_clicked_at: null,
  reminder_sent_at: null,
  created_by: 'staff-uuid',
  created_at: '',
  updated_at: '',
  expires_at: '2026-11-10T00:00:00Z',
  sent_at: null,
  sent_by: 'staff-uuid',
  opened_at: null,
  open_count: 1,
  submitted_at: null,
  cancelled_by: null,
  cancelled_at: null,
} as ReviewRequest;

const targets = { google: null, secondary: null };

describe('publicReviewView', () => {
  test('returns exactly the allowed keys, so a forwarded link leaks nothing else', () => {
    const view = publicReviewView({ request, centreName: 'Coimbatore', testimonial: null, targets, maxAiCalls: 5 });
    expect(Object.keys(view).sort()).toEqual([...PUBLIC_REVIEW_VIEW_KEYS].sort());
    const json = JSON.stringify(view);
    for (const secret of ['secret-id', 'secret-token', 'user-uuid', '+919999999999', 'staff-uuid', 'centre-uuid']) {
      expect(json).not.toContain(secret);
    }
  });

  test('shows the student their own corrections', () => {
    const view = publicReviewView({ request, centreName: null, testimonial: null, targets, maxAiCalls: 5 });
    expect(view.collegeAdmitted).toBe('NIT Trichy');
    expect(view.aiCallsLeft).toBe(3);
    expect(view.state).toBe('new');
  });

  test('is editable while waiting and locked once moderated', () => {
    const t = { content: { en: 'Edited by staff' }, rating: 5, consent_display_name: 'Priya S.', student_name: 'Priya S.', original_text: 'My own words', publication_status: 'pending_moderation' };
    expect(publicReviewView({ request, centreName: null, testimonial: t, targets, maxAiCalls: 5 }).state).toBe('submitted');
    const locked = publicReviewView({ request, centreName: null, testimonial: { ...t, publication_status: 'published' }, targets, maxAiCalls: 5 });
    expect(locked.state).toBe('locked');
    // Staff edits stay on our site: the student copies their own words to Google.
    expect(locked.review?.text).toBe('My own words');
  });
});

describe('suggestDisplayName', () => {
  test('first name and last initial', () => {
    expect(suggestDisplayName('Priya Sharma')).toBe('Priya S.');
    expect(suggestDisplayName('  Karthik  Raja  Rajan ')).toBe('Karthik R.');
    expect(suggestDisplayName('Divya')).toBe('Divya');
  });
});

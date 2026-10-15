export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { loadLink, linkSections, MAX_SUBMITS_PER_LINK, PROBLEM_TEXT } from '@/lib/college-update/link';
import { loadLiveSections } from '@/lib/college-dashboard/content-data';
import { saveSectionForReview } from '@/lib/college-dashboard/submissions';
import { changedKeys, cleanSubmission } from '@/lib/college-dashboard/content-sections';
import { photoUrlPrefix } from '@/lib/college-dashboard/photos';
import type { CollegeContentSection } from '@/lib/college-hub/types';

const MOBILE = /^[6-9]\d{9}$/;
const noStore = { 'Cache-Control': 'no-store' };

/**
 * POST /api/college-update/<token>
 * Body: { submitter: { name, role, phone }, sections: { [section]: values } }
 *
 * The no-login update form. The college comes from the link, never from the
 * body. Each changed section becomes a pending edit for staff review
 * (Admin > College Hub > Content reviews). Nothing goes live from here.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const db = createAdminClient() as any;
  const { link, problem } = await loadLink(db, params.token);
  if (problem || !link) {
    const p = PROBLEM_TEXT[problem ?? 'invalid'];
    return NextResponse.json({ error: p.title }, { status: p.status, headers: noStore });
  }
  if (link.submit_count >= MAX_SUBMITS_PER_LINK) {
    return NextResponse.json({ error: 'This link has been used many times. Ask Neram Classes for a new one.' }, { status: 429, headers: noStore });
  }

  const body = (await request.json().catch(() => null)) as { submitter?: Record<string, unknown>; sections?: Record<string, unknown> } | null;
  if (!body || typeof body.sections !== 'object' || !body.sections) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
  }

  const name = String(body.submitter?.name ?? '').trim();
  const role = String(body.submitter?.role ?? '').trim();
  const phone = String(body.submitter?.phone ?? '').replace(/\D/g, '').slice(-10);
  const about: Record<string, string> = {};
  if (!name || name.length > 80) about.name = 'Enter your name';
  if (!role || role.length > 80) about.role = 'Enter your role at the college';
  if (!MOBILE.test(phone)) about.phone = 'Enter your 10-digit mobile number';

  const allowed = linkSections(link);
  const { sections: live } = await loadLiveSections(db, link.college_id);

  // Check every section before saving any, so a half-valid form saves nothing.
  const fields: Record<string, Record<string, string>> = {};
  if (Object.keys(about).length) fields.about = about;
  const prefix = photoUrlPrefix(db, link.college_id);
  const toSave: CollegeContentSection[] = [];
  for (const section of allowed) {
    const values = body.sections[section];
    if (!values || typeof values !== 'object') continue;
    const check = cleanSubmission(section, values as Record<string, unknown>, prefix);
    if (!check.ok) {
      if (!check.errors._) fields[section] = check.errors;
      continue;
    }
    if (changedKeys(check.payload, live[section]).length) toSave.push(section);
  }
  if (Object.keys(fields).length) {
    return NextResponse.json({ error: 'Some fields need a fix.', fields }, { status: 422, headers: noStore });
  }
  if (toSave.length === 0) {
    return NextResponse.json({ error: 'Nothing has changed yet. Correct or add something, then send.' }, { status: 422, headers: noStore });
  }

  const saved: string[] = [];
  for (const section of toSave) {
    const res = await saveSectionForReview(db, link.college_id, section, body.sections[section] as Record<string, unknown>, live[section], {
      adminId: null,
      name,
      source: 'link',
      role,
      phone,
      updateLinkId: link.id,
    });
    if (res.ok) saved.push(section);
  }

  await db
    .from('college_update_links')
    .update({ submitted_at: new Date().toISOString(), submit_count: link.submit_count + 1 })
    .eq('id', link.id);

  return NextResponse.json({ success: true, sections: saved }, { headers: noStore });
}

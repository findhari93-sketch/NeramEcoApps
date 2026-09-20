/**
 * POST /api/s/submit  { token, answers }
 *
 * Public, for the same reason as the validate route: the student we are asking has
 * no account to sign into.
 *
 * The token in the body is re-read from the database on every call and nothing the
 * client sends about the request itself is trusted. The only thing the client gets
 * to decide is the answers, and those go through the shared validator, which refuses
 * a payload carrying any key this form does not own.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  assessApplication,
  createAdminClient,
  toLeadUpdates,
  toUserUpdates,
  validateApplicationAnswers,
} from '@neram/database';
import {
  getDetailRequestByToken,
  markDetailRequestAnswered,
  recordUserHistory,
} from '@neram/database/queries';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

const REFUSAL_STATUS = { not_found: 404, expired: 410, cancelled: 410 } as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';

    const supabase = createAdminClient();
    const found = await getDetailRequestByToken(token, supabase);

    if ('refusal' in found) {
      return NextResponse.json(
        { code: found.refusal.toUpperCase(), error: 'This link can no longer be used.' },
        { status: REFUSAL_STATUS[found.refusal], headers: NO_STORE },
      );
    }
    const detailRequest = found.request;

    const checked = validateApplicationAnswers(body?.answers);
    if (!checked.ok) {
      return NextResponse.json(
        { code: 'INVALID', errors: checked.errors },
        { status: 400, headers: NO_STORE },
      );
    }
    const { answers } = checked;

    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, name, email, phone, date_of_birth, user_type')
      .eq('id', detailRequest.user_id)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { code: 'NOT_FOUND', error: 'This link is not valid.' },
        { status: 404, headers: NO_STORE },
      );
    }

    // ── users ──────────────────────────────────────────────────────────────────
    // Date of birth and gender are the student's own to state. A name or a phone
    // already on file is NOT overwritten: the name is what the school and their
    // Microsoft account know them by, and the phone may have been verified by OTP,
    // which a typed one has not been. 29 of these records have no name at all, so
    // the only-if-empty rule is doing real work rather than being cautious.
    const userUpdates: Record<string, unknown> = toUserUpdates(answers);
    if (answers.first_name && !String(user.first_name ?? '').trim()) {
      userUpdates.first_name = answers.first_name;
    }
    if (answers.phone && !String(user.phone ?? '').trim()) {
      userUpdates.phone = answers.phone;
    }
    if (Object.keys(userUpdates).length) {
      const { error } = await supabase
        .from('users')
        .update({ ...userUpdates, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    }

    // ── lead_profiles ──────────────────────────────────────────────────────────
    const { fields, academicDataPatch } = toLeadUpdates(answers);

    const { data: existing } = await supabase
      .from('lead_profiles')
      .select('id, academic_data')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Merged, never replaced: this form asks for the class, and an earlier form may
    // have captured a board and a school name that must survive the answer.
    const mergedAcademicData = {
      ...((existing?.academic_data as Record<string, unknown>) || {}),
      ...academicDataPatch,
    };

    let leadProfileId: string | null = existing?.id ?? null;

    if (existing) {
      const { error } = await supabase
        .from('lead_profiles')
        .update({
          ...fields,
          academic_data: mergedAcademicData,
          form_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      // Written directly rather than through the create_lead_profile RPC, whose
      // column list silently drops first_name, date_of_birth, gender and
      // parent_phone, which are four of the things this form exists to collect.
      //
      // Cast because the generated types in packages/database still predate the
      // 'student_link' application_source added by migration 20260927090000. Run
      // `pnpm supabase:gen:types` once that migration reaches prod and the cast can
      // come off. The VALUES are checked above by validateApplicationAnswers, so the
      // cast is hiding a stale type, not an unchecked payload.
      const { data: inserted, error } = await supabase
        .from('lead_profiles')
        .insert({
          user_id: user.id,
          ...fields,
          academic_data: mergedAcademicData,
          source: 'student_link',
          // An enrolled student is long past the review stage. Same rule as
          // createApplication in the admin CRM route.
          status: user.user_type === 'student' ? 'enrolled' : 'submitted',
          form_completed_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      leadProfileId = inserted?.id ?? null;
    }

    await markDetailRequestAnswered(detailRequest, leadProfileId, supabase);

    // Attributed to the staff member who issued the link. change_source is fixed at
    // 'admin' inside the helper, so the field name carries the real provenance.
    await recordUserHistory(
      supabase,
      user.id,
      'lead_profile.student_link',
      null,
      { ...fields, academic_data: academicDataPatch },
      detailRequest.created_by as string,
    );

    const assessment = assessApplication({
      lead: { ...fields, academic_data: mergedAcademicData } as any,
      user: {
        first_name: (userUpdates.first_name as string) ?? user.first_name,
        name: user.name,
        date_of_birth: (userUpdates.date_of_birth as string) ?? user.date_of_birth,
      },
    });

    return NextResponse.json({ ok: true, assessment }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[s/submit]', error?.message || error);
    return NextResponse.json(
      { code: 'ERROR', error: 'We could not save that. Please try again.' },
      { status: 500, headers: NO_STORE },
    );
  }
}

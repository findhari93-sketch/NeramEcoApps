// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getSupabaseAdminClient,
  createDirectEnrollmentLink,
  editDirectEnrollmentLink,
  findActiveLinkForStudent,
  getDirectEnrollmentLinkById,
  listDirectEnrollmentLinks,
  logDirectEnrollmentLinkEvent,
} from '@neram/database';
import { checkEnrolmentPlan } from '@neram/database/enrolment-link';
import { buildStudentPayOffer } from '@neram/database/student-pay';
import type { DirectEnrollmentLinkStatus, CourseType, LearningMode } from '@neram/database';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { effectiveStatus, toLinkView } from '@/lib/enrolment-link-server';

// GET /api/direct-enrollment - List links. ?userId= or ?demoRegistrationId= for one person.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as DirectEnrollmentLinkStatus | null;
    const search = searchParams.get('search') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const demoRegistrationId = searchParams.get('demoRegistrationId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if ((userId && !UUID_REGEX.test(userId)) || (demoRegistrationId && !UUID_REGEX.test(demoRegistrationId))) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // A GET no longer writes. Expired links are marked by the daily
    // /api/cron/identity-sweep run; until then a link past expires_at is shown as
    // expired here (and the enrol page refuses it on expires_at regardless).
    const { data, total } = await listDirectEnrollmentLinks(
      {
        status: status || undefined,
        search,
        user_id: userId,
        demo_registration_id: demoRegistrationId,
        page,
        limit,
      },
      supabase
    );

    const rows = (data || []).map((link: any) => ({ ...link, status: effectiveStatus(link) }));

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing direct enrollment links:', error);
    return NextResponse.json(
      { error: 'Failed to list direct enrollment links' },
      { status: 500 }
    );
  }
}

const COURSES = ['nata', 'jee_paper2', 'both', 'revit', 'not_sure'];
const MODES = ['hybrid', 'online_only'];

/**
 * POST /api/direct-enrollment
 * Without linkId: create a link. Refused with 409 ACTIVE_LINK_EXISTS when the
 * student already has an active one (by account or phone), so staff edit that
 * link and the student keeps the URL they were sent.
 * With linkId: change that active link in place (same token, same URL).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      linkId,
      studentName,
      studentPhone,
      studentEmail,
      batchId,
      centerId,
      interestCourse,
      learningMode,
      totalFee,
      discountAmount,
      amountPaid,
      paymentMethod,
      transactionReference,
      paymentDate,
      paymentScheme,
      balanceDueDate,
      adminNotes,
      paymentProofUrl,
      userId,
      demoRegistrationId,
      paymentMode,
      feeStructureId,
    } = body;
    const studentPays = paymentMode === 'student_pays';

    const adminId = actingAdminId(request, body);
    if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });

    const fieldErrors: Record<string, string> = {};
    if (!String(studentName || '').trim()) fieldErrors.studentName = 'Enter the student name.';
    if (!COURSES.includes(interestCourse)) fieldErrors.interestCourse = 'Choose the course.';
    if (learningMode && !MODES.includes(learningMode)) fieldErrors.learningMode = 'Choose how they will learn.';

    const scheme = paymentScheme === 'installment' ? 'installment' : 'full';
    const supabase = getSupabaseAdminClient();

    // Student pays: the offer comes from the fee structure, never from the form.
    let offerFields: Record<string, unknown> | null = null;
    if (studentPays) {
      if (!feeStructureId || !UUID_REGEX.test(feeStructureId)) {
        fieldErrors.feeStructureId = 'Choose the fee structure.';
      } else {
        const { data: fs, error: fsErr } = await (supabase as any)
          .from('fee_structures')
          .select('id, fee_amount, single_payment_discount, installment_1_amount, installment_2_amount, is_active')
          .eq('id', feeStructureId)
          .maybeSingle();
        if (fsErr) throw fsErr;
        if (!fs || fs.is_active === false) {
          fieldErrors.feeStructureId = 'That fee structure is not available.';
        } else {
          const offer = buildStudentPayOffer(fs, discountAmount);
          if (offer.fullAmount <= 0) fieldErrors.discount = 'The discount leaves nothing to pay.';
          offerFields = {
            payment_mode: 'student_pays',
            fee_structure_id: fs.id,
            total_fee: offer.listFee,
            discount_amount: offer.extraDiscount,
            final_fee: offer.fullAmount,
            amount_paid: 0,
            payment_method: 'upi_direct',
            transaction_reference: null,
            payment_date: null,
            payment_proof_url: null,
            payment_scheme: 'full',
            installment_2_amount: null,
            installment_2_due_date: null,
            offer_full_amount: offer.fullAmount,
            offer_installment_1: offer.installment1,
            offer_installment_2: offer.installment2,
            offer_balance_due_days: 45,
          };
        }
      }
    }

    const plan = studentPays
      ? null
      : checkEnrolmentPlan({
          totalFee,
          discount: discountAmount,
          scheme,
          amountPaid,
          paymentDate: paymentDate || null,
          paymentMethod,
          balanceDueDate: balanceDueDate || null,
        });
    for (const e of plan?.errors || []) fieldErrors[e.field] = fieldErrors[e.field] || e.message;
    if (Object.keys(fieldErrors).length) {
      return NextResponse.json(
        { error: 'Check the highlighted fields.', fieldErrors },
        { status: 400 }
      );
    }

    const base = {
      student_name: String(studentName).trim(),
      student_phone: studentPhone || null,
      student_email: studentEmail || null,
      batch_id: batchId || null,
      center_id: centerId || null,
      interest_course: interestCourse as CourseType,
      learning_mode: (learningMode as LearningMode) || 'hybrid',
      admin_notes: adminNotes || null,
    };

    const fields = offerFields ? { ...base, ...offerFields } : {
      payment_mode: 'recorded',
      offer_full_amount: null,
      offer_installment_1: null,
      offer_installment_2: null,
      fee_structure_id: feeStructureId && UUID_REGEX.test(feeStructureId) ? feeStructureId : null,
      ...base,
      total_fee: Number(totalFee) || 0,
      discount_amount: Number(discountAmount) || 0,
      final_fee: plan.finalFee ?? 0,
      amount_paid: plan.paid ?? 0,
      payment_method: paymentMethod || 'upi_direct',
      transaction_reference: transactionReference || null,
      payment_date: paymentDate || null,
      payment_proof_url: paymentProofUrl || null,
      payment_scheme: scheme,
      installment_2_amount: scheme === 'installment' ? plan.balance : null,
      installment_2_due_date: scheme === 'installment' ? balanceDueDate : null,
    };

    // ── Edit an existing link ────────────────────────────────────────────────
    if (linkId) {
      if (!UUID_REGEX.test(linkId)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
      const before = await getDirectEnrollmentLinkById(linkId, supabase);
      if (!before) return NextResponse.json({ error: 'That link was not found.' }, { status: 404 });
      if (effectiveStatus(before) !== 'active') {
        return NextResponse.json(
          { error: `This link is ${effectiveStatus(before) === 'used' ? 'already used' : effectiveStatus(before)}, so it cannot be changed.` },
          { status: 409 }
        );
      }
      const link = await editDirectEnrollmentLink(linkId, fields, supabase);
      const changed = Object.keys(fields).filter((k) => String(before[k] ?? '') !== String(link[k] ?? ''));
      await logDirectEnrollmentLinkEvent(link.id, 'updated', adminId, { changed }, supabase);
      return NextResponse.json({ success: true, merged: true, data: await toLinkView(link, request, supabase) });
    }

    // ── Create ───────────────────────────────────────────────────────────────
    if (userId) {
      if (!UUID_REGEX.test(userId)) return NextResponse.json({ error: 'Invalid person.' }, { status: 400 });
      const { data: u, error: userErr } = await (supabase as any).from('users').select('id, user_type').eq('id', userId).maybeSingle();
      if (userErr) {
        console.error('Direct enrollment user lookup failed:', userErr);
        return NextResponse.json({ error: 'Could not check that person. Try again.' }, { status: 500 });
      }
      if (!u) return NextResponse.json({ error: 'That person was not found.' }, { status: 400 });
      if (u.user_type === 'student') return NextResponse.json({ error: 'This person is already a student.' }, { status: 409 });
      if (demoRegistrationId) {
        const { data: demo, error: demoErr } = await (supabase as any)
          .from('demo_class_registrations')
          .select('id')
          .eq('id', demoRegistrationId)
          .eq('user_id', userId)
          .maybeSingle();
        if (demoErr) {
          console.error('Direct enrollment demo lookup failed:', demoErr);
          return NextResponse.json({ error: 'Could not check that demo. Try again.' }, { status: 500 });
        }
        if (!demo) return NextResponse.json({ error: 'That demo does not belong to this person.' }, { status: 400 });
      }
    }

    // A payment the student already submitted is waiting for staff: verify or
    // reject it first, never a second link beside it.
    if (userId) {
      const { data: waiting } = await (supabase as any)
        .from('direct_enrollment_links')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'payment_submitted')
        .limit(1)
        .maybeSingle();
      if (waiting) {
        return NextResponse.json(
          { error: 'This student already submitted a payment. Verify or reject it first.', code: 'PAYMENT_WAITING' },
          { status: 409 }
        );
      }
    }

    const existing = await findActiveLinkForStudent({ userId, phone: studentPhone }, supabase);
    if (existing) {
      const view = await toLinkView(existing, request, supabase);
      return NextResponse.json(
        {
          error: `${view.created_by_name || 'Someone'} already made an enrolment link for this student. Edit that one so they keep the same link.`,
          code: 'ACTIVE_LINK_EXISTS',
          existing: view,
        },
        { status: 409 }
      );
    }

    // Generate URL-safe unique token
    const token = crypto.randomBytes(16).toString('base64url');

    let link;
    try {
      link = await createDirectEnrollmentLink(
        {
          ...fields,
          token,
          created_by: adminId,
          user_id: userId || undefined,
          demo_registration_id: demoRegistrationId || undefined,
        },
        supabase
      );
    } catch (err: any) {
      // one_active_link_per_user: a second tab made one a moment ago.
      if (err?.code === '23505' && userId) {
        const race = await findActiveLinkForStudent({ userId }, supabase);
        if (race) {
          return NextResponse.json(
            { error: 'An enrolment link was just made for this student. Edit that one.', code: 'ACTIVE_LINK_EXISTS', existing: await toLinkView(race, request, supabase) },
            { status: 409 }
          );
        }
      }
      throw err;
    }

    await logDirectEnrollmentLinkEvent(link.id, 'created', adminId, { scheme, mode: studentPays ? 'student_pays' : 'recorded' }, supabase);

    return NextResponse.json({
      success: true,
      merged: false,
      data: await toLinkView(link, request, supabase),
    });
  } catch (error: any) {
    console.error('Error creating direct enrollment link:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create direct enrollment link' },
      { status: 500 }
    );
  }
}

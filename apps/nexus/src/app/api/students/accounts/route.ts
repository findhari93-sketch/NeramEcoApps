import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ACADEMIC_YEAR_REGEX, getCurrentBatch, getSupabaseAdminClient, startYearOf } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { readStudentAccountDefaults, saveStudentAccountDefaults } from '@/lib/student-account-defaults';
import { createStudentAccount, type StudentLicenseChoice } from '@/lib/student-account-provisioning';
import {
  generateTempPassword,
  isUuid,
  normalizeIndianMobile,
  normalizeUsername,
  type StudentAccountDefaults,
} from '@/lib/student-account-rules';
import { createSupabaseAccountStore, graphAccountPort } from '@/lib/student-account-store';
import { SETTABLE_STAGES } from '@/lib/student-stage';

// Creating, licensing and enrolling is several Graph round trips, and licensing a
// brand new account can need a retry or two while it appears.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
}

/** The license the form showed, or the saved default when it sent none. */
function licenseChoice(raw: unknown, defaults: StudentAccountDefaults): StudentLicenseChoice | null {
  const value = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (value && isUuid(value.skuId)) {
    const groupId = value.mode === 'group' && isUuid(value.groupId) ? value.groupId : null;
    return { skuId: value.skuId, mode: groupId ? 'group' : 'direct', groupId };
  }
  if (defaults.sku_id) {
    return { skuId: defaults.sku_id, mode: defaults.license_mode, groupId: defaults.license_group_id };
  }
  return null;
}

/**
 * POST /api/students/accounts
 * Create a student's Microsoft account, license it, and put them in this class.
 *
 * Body: { classroomId, firstName, lastName, username, phone?, personalEmail?,
 *         studyStage?, academicYear?, batchId?, attachToUserId?, confirmNew?,
 *         license?: { skuId, skuPartNumber?, mode, groupId? } }
 *
 * Returns 201 with each step's outcome, 409 `possible_duplicate` with candidates
 * when the details look like a student Nexus already has, or 409 with a code for
 * a taken login ID or a record that already has an account.
 *
 * The temporary password is in the 201 response ONCE, with no-store, and nowhere
 * else: not the database, not the audit trail, not a log line.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'structure.student.account');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return bad('Send the student details as JSON.');

    const classroomId = text(body.classroomId);
    if (!classroomId) return bad('classroomId is required');

    const typedPhone = text(body.phone);
    const phone = typedPhone ? normalizeIndianMobile(typedPhone) : null;
    if (typedPhone && !phone) return bad('Enter a 10 digit Indian mobile number.');

    const studyStage = text(body.studyStage) || null;
    if (studyStage && !(SETTABLE_STAGES as readonly string[]).includes(studyStage)) return bad('Unknown class');

    const academicYear = text(body.academicYear) || null;
    if (academicYear) {
      if (!ACADEMIC_YEAR_REGEX.test(academicYear)) return bad('The exam year must look like 2027-28.');
      // The same rule the classification route enforces: an earlier cohort hides
      // the student from the default roster view.
      const currentCode = (await getCurrentBatch())?.code ?? null;
      const currentStart = startYearOf(currentCode);
      const start = startYearOf(academicYear);
      if (currentStart !== null && start !== null && start < currentStart) {
        return bad(`${academicYear} is before the current batch (${currentCode}), which would hide the student from the default view.`);
      }
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: classroom, error: classroomError } = await supabase
      .from('nexus_classrooms')
      .select('id, is_archived')
      .eq('id', classroomId)
      .maybeSingle();
    if (classroomError) throw classroomError;
    if (!classroom) return NextResponse.json({ error: 'Classroom not found' }, { status: 404, headers: NO_STORE });
    if (classroom.is_archived) {
      return NextResponse.json(
        { error: 'This classroom is archived (a past academic year). Add students to the current-year classroom instead.' },
        { status: 409, headers: NO_STORE },
      );
    }

    const attachToUserId = text(body.attachToUserId) || null;
    const stored = await readStudentAccountDefaults(supabase);
    const license = licenseChoice(body.license, stored.defaults);
    const store = createSupabaseAccountStore(supabase);

    // For a student already on the roster, what the form left blank comes from their record.
    let personalEmail = text(body.personalEmail) || null;
    let effectivePhone = phone;
    if (attachToUserId && (!effectivePhone || !personalEmail)) {
      const record = await store.getStudent(attachToUserId);
      if (record) {
        effectivePhone = effectivePhone ?? normalizeIndianMobile(record.phone);
        const orgAddress = String(record.email || '').toLowerCase().endsWith(`@${stored.defaults.domain}`);
        const recordEmail = record.personal_email || (orgAddress ? null : record.email);
        personalEmail = personalEmail ?? (recordEmail && EMAIL.test(recordEmail) ? recordEmail : null);
      }
    }

    const result = await createStudentAccount(graphAccountPort, store, {
      classroomId,
      firstName: text(body.firstName),
      lastName: text(body.lastName),
      username: normalizeUsername(text(body.username)),
      domain: stored.defaults.domain,
      usageLocation: stored.defaults.usage_location,
      phone: effectivePhone,
      personalEmail,
      studyStage,
      academicYear,
      batchId: text(body.batchId) || null,
      attachToUserId,
      confirmNew: body.confirmNew === true,
      license,
      password: generateTempPassword((max) => randomInt(max)),
      actorId: caller.id,
    });

    switch (result.kind) {
      case 'created': {
        // The license that worked becomes the default, so the next account needs no detection.
        const changed =
          !stored.saved ||
          stored.defaults.sku_id !== license?.skuId ||
          stored.defaults.license_group_id !== (license?.groupId ?? null);
        if (license && result.steps.license.status === 'done' && changed) {
          const partNumber = text((body.license as Record<string, unknown> | undefined)?.skuPartNumber);
          try {
            await saveStudentAccountDefaults(
              supabase,
              {
                ...stored.defaults,
                sku_id: license.skuId,
                sku_part_number: partNumber || stored.defaults.sku_part_number,
                license_mode: license.mode,
                license_group_id: license.groupId,
              },
              caller.id,
            );
          } catch {
            // The account exists; the default can be saved next time.
          }
        }
        return NextResponse.json(result, { status: 201, headers: NO_STORE });
      }
      case 'possible_duplicate':
        return NextResponse.json(
          { error: 'possible_duplicate', candidates: result.candidates },
          { status: 409, headers: NO_STORE },
        );
      case 'conflict':
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers: NO_STORE });
      case 'graph_failed':
        return NextResponse.json(
          { error: result.error.message, fix: result.error.fix ?? null, code: result.error.code },
          { status: 502, headers: NO_STORE },
        );
      default:
        return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
    }
  } catch (err) {
    return errorResponse(err, 'Could not create the account');
  }
}

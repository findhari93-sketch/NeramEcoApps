import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { isUpnAvailable } from '@/lib/entra-accounts';
import type { IdentityCandidate } from '@/lib/identity-candidates';
import { readStudentAccountDefaults } from '@/lib/student-account-defaults';
import {
  isValidUsername,
  normalizeIndianMobile,
  normalizeUsername,
  suggestUsername,
  upnFor,
  usernameWithSuffix,
} from '@/lib/student-account-rules';
import { createSupabaseAccountStore } from '@/lib/student-account-store';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Dhisha_Haribabu, then 2 up to 6. Past that, staff should choose the login ID themselves. */
const MAX_SUGGESTION_ATTEMPTS = 6;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * POST /api/students/accounts/preview
 * Body: { classroomId, firstName, lastName, username?, phone?, personalEmail?, attachToUserId? }
 *
 * The live part of the create form, and read-only: the login ID the student
 * would get and whether it is free, anyone Nexus already has who looks like the
 * same student, and, when the account is for a student already on the roster,
 * the contact details on their record so the form can fill them in.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'structure.student.account');

    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    const classroomId = text(body.classroomId);
    if (!classroomId) return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });

    const firstName = text(body.firstName);
    const lastName = text(body.lastName);
    const typed = text(body.username);
    const phone = normalizeIndianMobile(text(body.phone));
    const personalEmail = EMAIL.test(text(body.personalEmail)) ? text(body.personalEmail) : null;
    const attachToUserId = text(body.attachToUserId) || null;

    const supabase = getSupabaseAdminClient() as any;
    const { defaults } = await readStudentAccountDefaults(supabase);
    const store = createSupabaseAccountStore(supabase);

    // Exactly what staff typed, or the suggestion with the first free number.
    const base = typed ? normalizeUsername(typed) : suggestUsername(firstName, lastName);
    let username = base;
    let available: boolean | null = null;
    let availabilityError: string | null = null;
    if (isValidUsername(base)) {
      const attempts = typed ? 1 : MAX_SUGGESTION_ATTEMPTS;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        username = usernameWithSuffix(base, attempt);
        const result = await isUpnAvailable(upnFor(username, defaults.domain));
        if (!result.ok) {
          availabilityError = result.error.message;
          break;
        }
        available = result.value;
        if (available) break;
      }
    }

    let candidates: IdentityCandidate[] = [];
    let record: { phone: string | null; personalEmail: string | null; hasMicrosoft: boolean } | null = null;
    if (attachToUserId) {
      const student = await store.getStudent(attachToUserId);
      if (student) {
        const orgAddress = String(student.email || '').toLowerCase().endsWith(`@${defaults.domain}`);
        const fallbackEmail = !orgAddress && EMAIL.test(String(student.email || '')) ? student.email : null;
        record = {
          phone: normalizeIndianMobile(student.phone),
          personalEmail: student.personal_email || fallbackEmail,
          hasMicrosoft: !!student.ms_oid,
        };
      }
    } else if (firstName || phone || personalEmail) {
      candidates = await store.findCandidates({
        classroomId,
        name: [firstName, lastName].filter(Boolean).join(' '),
        phone,
        personalEmail,
      });
    }

    const valid = isValidUsername(username);
    return NextResponse.json(
      {
        username,
        upn: valid ? upnFor(username, defaults.domain) : null,
        valid,
        available,
        availabilityError,
        candidates,
        record,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not check that login ID');
  }
}

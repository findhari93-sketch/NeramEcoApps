// @ts-nocheck
/**
 * Detect a duplicate `users` pair for a given user and build a merge preview.
 *
 * Microsoft is the authority on email->account, so the link between the two rows
 * is the ms_oid. We support detection from EITHER side:
 *  - The @neramclasses.com row (often ms_oid NULL): resolve its real ms_oid via
 *    Graph (findUserOidByEmail) then find the row that holds that ms_oid.
 *  - The personal-Gmail row (holds the ms_oid): read the MS account's UPN via
 *    Graph (getUserProfile) then find the @neram partner row by that email.
 */
import {
  getSupabaseAdminClient,
  findUserRowByMsOid,
  findUserRowByEmail,
  buildMergePreview,
  previewUserMergeCounts,
  isNeramEmail,
} from '@neram/database';
import { findUserOidByEmail, getUserProfile } from '@neram/auth';

const COLS =
  'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni, linked_classroom_email';

/** Escape a value for ILIKE so _ and % stay literal. Classroom emails contain _. */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** Last 10 digits, the comparable core of an Indian mobile in any stored shape. */
export function phoneKey(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** The eq-variants a 10-digit core may be stored as on users.phone. */
export function phoneVariants(key: string): string[] {
  return [key, `+91${key}`, `91${key}`, `0${key}`, `+${key}`];
}

/**
 * Every phone we know for a user: the user row itself PLUS the adjacent enrolment
 * records. users.phone is often NULL for students who signed in with Google, while
 * the number they actually verified sits on lead_profiles.parent_phone or on the
 * direct_enrollment_links row an admin created for them. Without these sources a
 * duplicate pair that shares a phone in every practical sense looks unrelated.
 */
async function knownPhoneKeys(supabase: any, userId: string, rowPhone: unknown): Promise<string[]> {
  const keys = new Set<string>();
  const add = (v: unknown) => {
    const k = phoneKey(v);
    if (k) keys.add(k);
  };
  add(rowPhone);
  const [leads, links] = await Promise.all([
    supabase.from('lead_profiles').select('parent_phone').eq('user_id', userId),
    supabase.from('direct_enrollment_links').select('student_phone').eq('used_by', userId),
  ]);
  for (const l of leads?.data || []) add(l.parent_phone);
  for (const l of links?.data || []) add(l.student_phone);
  return [...keys];
}

/** User ids reachable by a phone, across users, lead_profiles and enrolment links. */
async function userIdsByPhoneKey(supabase: any, key: string, excludeId: string): Promise<string[]> {
  const orFilter = phoneVariants(key)
    .map((v) => `phone.eq.${v}`)
    .join(',');
  const leadFilter = phoneVariants(key)
    .map((v) => `parent_phone.eq.${v}`)
    .join(',');
  const linkFilter = phoneVariants(key)
    .map((v) => `student_phone.eq.${v}`)
    .join(',');

  const [users, leads, links] = await Promise.all([
    supabase.from('users').select('id').or(orFilter).neq('id', excludeId),
    supabase.from('lead_profiles').select('user_id').or(leadFilter),
    supabase.from('direct_enrollment_links').select('used_by').or(linkFilter).not('used_by', 'is', null),
  ]);

  const ids = new Set<string>();
  for (const u of users?.data || []) ids.add(u.id);
  for (const l of leads?.data || []) if (l.user_id) ids.add(l.user_id);
  for (const l of links?.data || []) if (l.used_by) ids.add(l.used_by);
  ids.delete(excludeId);
  return [...ids];
}

export async function detectDuplicate(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: row } = await supabase.from('users').select(COLS).eq('id', userId).maybeSingle();
  if (!row) return { hasDuplicate: false, notFound: true };

  let neramRow: any = null;
  let gmailRow: any = null;
  let detectedVia: 'stored' | 'email' | 'upn' | 'phone' | 'none' = 'none';
  let resolvedMsOid: string | null = row.ms_oid || null;

  if (isNeramEmail(row.email)) {
    neramRow = row;
    detectedVia = row.ms_oid ? 'stored' : 'none';
    if (!resolvedMsOid && row.email) {
      const oid = await findUserOidByEmail(row.email).catch(() => null);
      if (oid) {
        resolvedMsOid = oid;
        detectedVia = 'email';
      }
    }
    if (resolvedMsOid) {
      const holder = await findUserRowByMsOid(resolvedMsOid, supabase);
      if (holder && holder.id !== row.id) gmailRow = holder;
    }
  } else {
    // This row is a non-neram (personal-email) row; find the @neram partner.
    gmailRow = row;
    if (resolvedMsOid) {
      const profile = await getUserProfile(resolvedMsOid).catch(() => null);
      const upn = profile?.userPrincipalName || profile?.mail;
      if (upn) {
        const partner = await findUserRowByEmail(upn, supabase);
        if (partner && partner.id !== row.id) {
          neramRow = partner;
          detectedVia = 'upn';
        }
      }
    }
  }

  // Fallback: the classroom email an admin already recorded on the personal row.
  // This is the one signal that survives when the two rows share no phone, no
  // personal email and no Graph hint: it is the admin stating outright that this
  // person's mailbox is that address. Cheap, exact, and it needs no Graph call.
  if (!neramRow || !gmailRow) {
    if (isNeramEmail(row.email)) {
      const { data } = await supabase
        .from('users')
        .select(COLS)
        .ilike('linked_classroom_email', escapeIlike(row.email))
        .neq('id', row.id)
        .limit(1);
      const partner = data?.[0];
      if (partner && !isNeramEmail(partner.email)) {
        gmailRow = gmailRow || partner;
        if (detectedVia === 'none') detectedVia = 'email';
      }
    } else if (row.linked_classroom_email) {
      const partner = await findUserRowByEmail(row.linked_classroom_email, supabase);
      if (partner && partner.id !== row.id && isNeramEmail(partner.email)) {
        neramRow = neramRow || partner;
        if (detectedVia === 'none') detectedVia = 'email';
      }
    }
  }

  // Fallback: match by phone. The strongest duplicates (an empty @neram shell with
  // no ms_oid + a rich Google row) share no ms_oid link and Graph can't resolve the
  // shell, but a shared phone is a strong same-person signal. Pair exactly one
  // neram-domain row with one personal-email row, and never across two DIFFERENT
  // Microsoft accounts (that would be two distinct people).
  //
  // Both the phones we search WITH and the rows we search THROUGH include
  // lead_profiles.parent_phone and direct_enrollment_links.student_phone, not just
  // users.phone: a Google-login student's users.phone is frequently NULL, so a
  // users-only comparison finds nothing on either side of a real duplicate.
  if (!neramRow || !gmailRow) {
    const keys = await knownPhoneKeys(supabase, row.id, row.phone);
    const seen = new Set<string>();
    outer: for (const key of keys) {
      const candidateIds = (await userIdsByPhoneKey(supabase, key, row.id)).filter((id) => !seen.has(id));
      if (candidateIds.length === 0) continue;
      candidateIds.forEach((id) => seen.add(id));
      const { data: candidates } = await supabase.from('users').select(COLS).in('id', candidateIds);
      for (const cand of candidates || []) {
        const rowNeram = isNeramEmail(row.email);
        const candNeram = isNeramEmail(cand.email);
        if (rowNeram === candNeram) continue; // need exactly one neram + one personal
        const nRow = rowNeram ? row : cand;
        const gRow = rowNeram ? cand : row;
        if (nRow.ms_oid && gRow.ms_oid && nRow.ms_oid !== gRow.ms_oid) continue; // distinct people
        neramRow = neramRow || nRow;
        gmailRow = gmailRow || gRow;
        if (detectedVia === 'none') detectedVia = 'phone';
        break outer;
      }
    }
  }

  if (!neramRow || !gmailRow) return { hasDuplicate: false, detectedVia };

  const preview = buildMergePreview(neramRow, gmailRow);
  const referenceCounts = await previewUserMergeCounts(preview.loser.id, supabase).catch(() => []);
  return {
    hasDuplicate: true,
    detectedVia,
    resolvedMsOid,
    winnerId: preview.winner.id,
    loserId: preview.loser.id,
    preview: { ...preview, referenceCounts },
  };
}

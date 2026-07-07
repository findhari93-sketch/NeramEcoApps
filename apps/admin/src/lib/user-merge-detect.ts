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
  'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni';

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

  // Fallback: match by phone. The strongest duplicates (an empty @neram shell with
  // no ms_oid + a rich Google row) share no ms_oid link and Graph can't resolve the
  // shell, but a shared phone is a strong same-person signal. Pair exactly one
  // neram-domain row with one personal-email row, and never across two DIFFERENT
  // Microsoft accounts (that would be two distinct people).
  if ((!neramRow || !gmailRow) && row.phone) {
    const digits = String(row.phone).replace(/\D/g, '');
    if (digits.length >= 7) {
      const { data: phoneMatches } = await supabase
        .from('users')
        .select(COLS)
        .or(`phone.eq.${digits},phone.eq.+91${digits},phone.eq.+${digits}`)
        .neq('id', row.id);
      for (const cand of phoneMatches || []) {
        const rowNeram = isNeramEmail(row.email);
        const candNeram = isNeramEmail(cand.email);
        if (rowNeram === candNeram) continue; // need exactly one neram + one personal
        const nRow = rowNeram ? row : cand;
        const gRow = rowNeram ? cand : row;
        if (nRow.ms_oid && gRow.ms_oid && nRow.ms_oid !== gRow.ms_oid) continue; // distinct people
        neramRow = neramRow || nRow;
        gmailRow = gmailRow || gRow;
        if (detectedVia === 'none') detectedVia = 'phone';
        break;
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

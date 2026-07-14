export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';

/**
 * POST /api/students/refresh-entra
 *
 * Pull the CURRENT Microsoft userPrincipalName for every student account from
 * Entra and write it back to the DB, matched by the stable `ms_oid`. This is the
 * counterpart to the read-only GET sync: when an account is renamed in Entra
 * (e.g. the default `…onmicrosoft.com` UPN is switched to the custom
 * `@neramclasses.com` domain), nothing else updates the stored email, so Admin
 * and Nexus keep showing the stale address. Running this reconciles them.
 *
 * What it updates per matched user (only when the value actually changed):
 *   - users.linked_classroom_email  = current UPN (the class identity)
 *   - student_profiles.ms_teams_email = current UPN (where a profile exists)
 *   - users.email = current UPN ONLY IF the stored users.email is itself a
 *     classroom address. A personal Gmail login is never clobbered. Safe because
 *     Nexus/Admin auth keys off ms_oid, not email.
 *
 * A classroom address is @*neramclasses.com or any *.onmicrosoft.com tenant
 * address (matching the sync-entra classifier).
 */
function isClassroomEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return /@.*neramclasses\.com$/.test(e) || /\.onmicrosoft\.com$/.test(e);
}

/** Case-insensitive equality for UPN comparison (MS preserves admin-set casing). */
function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

export async function POST() {
  try {
    const token = await getAppOnlyToken();
    const supabase = getSupabaseAdminClient() as any;

    // 1. Page every Entra user (same fields + filters as sync-entra GET).
    let allAdUsers: any[] = [];
    let nextLink: string | null =
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,accountEnabled&$top=100';

    while (nextLink) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const res: Response = await fetch(nextLink, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          throw new Error(`Graph API error: ${res.status} ${err}`);
        }
        const data: any = await res.json();
        allAdUsers = allAdUsers.concat(data.value || []);
        nextLink = data['@odata.nextLink'] || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 2. Keep student accounts only (exclude staff + service mailboxes), matching
    //    the sync-entra GET filter so we never rewrite a staff mailbox.
    const staffPatterns = ['admin', 'teacher', 'hari', 'info@neramclasses.com', 'shanthi', 'paramesh', 'tamil'];
    const serviceLocalParts = new Set([
      'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'info', 'contact',
      'hello', 'office', 'accounts', 'billing', 'help', 'mail', 'team', 'postmaster',
      'webmaster', 'hr', 'careers', 'jobs', 'enquiry', 'enquiries', 'noreply-neram',
    ]);
    const upnByOid = new Map<string, string>();
    for (const u of allAdUsers) {
      const upn: string = u.userPrincipalName || '';
      const lower = upn.toLowerCase();
      if (!upn) continue;
      if (serviceLocalParts.has(lower.split('@')[0])) continue;
      if (staffPatterns.some((p) => lower.includes(p.toLowerCase()))) continue;
      if (!(lower.includes('neramclasses') || lower.includes('nerasmclasses') || lower.includes('neram.co.in'))) continue;
      upnByOid.set(u.id, upn);
    }

    if (upnByOid.size === 0) {
      return NextResponse.json({ success: true, summary: { checked: 0, updated: 0 }, details: [] });
    }

    // 3. Load the DB users linked by ms_oid, plus their student_profiles.
    const oids = Array.from(upnByOid.keys());
    const { data: dbUsers } = await supabase
      .from('users')
      .select('id, ms_oid, name, email, linked_classroom_email')
      .in('ms_oid', oids);

    const userIds = (dbUsers || []).map((u: any) => u.id);
    const { data: profiles } = await supabase
      .from('student_profiles')
      .select('id, user_id, ms_teams_email')
      .in('user_id', userIds.length > 0 ? userIds : ['__none__']);
    const profileByUser = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));

    // 4. Reconcile each matched user with its current UPN.
    const details: any[] = [];
    let updated = 0;

    for (const u of dbUsers || []) {
      const upn = upnByOid.get(u.ms_oid);
      if (!upn) continue;

      const changes: string[] = [];

      // linked_classroom_email -> current UPN
      if (!sameEmail(u.linked_classroom_email, upn)) {
        const { error } = await supabase
          .from('users')
          .update({ linked_classroom_email: upn, linked_classroom_at: new Date().toISOString() })
          .eq('id', u.id);
        if (!error) changes.push('linked_classroom_email');
      }

      // users.email -> current UPN, only when the stored email is a classroom
      // address (never overwrite a personal Gmail login). Guard the unique
      // constraint on email so one collision does not fail the whole run.
      if (isClassroomEmail(u.email) && !sameEmail(u.email, upn)) {
        const { error } = await supabase.from('users').update({ email: upn }).eq('id', u.id);
        if (error) {
          changes.push(`email_skipped(${error.code || 'conflict'})`);
        } else {
          changes.push('email');
        }
      }

      // student_profiles.ms_teams_email -> current UPN
      const profile = profileByUser.get(u.id);
      if (profile && !sameEmail(profile.ms_teams_email, upn)) {
        const { error } = await supabase
          .from('student_profiles')
          .update({ ms_teams_email: upn })
          .eq('id', profile.id);
        if (!error) changes.push('ms_teams_email');
      }

      if (changes.length > 0) {
        updated++;
        details.push({ ms_oid: u.ms_oid, name: u.name, upn, changes });
      }
    }

    return NextResponse.json({
      success: true,
      summary: { checked: dbUsers?.length || 0, updated },
      details,
    });
  } catch (error: any) {
    console.error('Error refreshing from Entra:', error);
    return NextResponse.json({ error: error.message || 'Refresh failed' }, { status: 500 });
  }
}

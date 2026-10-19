// @ts-nocheck - user_guardian_links is newer than the generated Database type
/**
 * Parents and guardians linked to their children (migration 20261209090000).
 *
 * Two tables hold a parent to child link:
 *   user_guardian_links  Admin's link: a parent account (often the one that
 *                        booked the demo and paid) and the child's own account.
 *   nexus_parent_links   a Nexus parent login made by staff in Nexus.
 * Reads merge both, so a student shows every parent we know of. Writes here only
 * touch user_guardian_links; Nexus parent logins stay with Nexus.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { GuardianSummary, UnlinkedGuardianAccount } from '../types';

type Relationship = GuardianSummary['relationship'];
type LinkSource = GuardianSummary['source'];

const RELATIONSHIPS: Relationship[] = ['parent', 'guardian', 'other'];

interface LinkRow {
  id: string | null;
  guardian_user_id: string;
  student_user_id: string;
  relationship: string | null;
  source: LinkSource;
}

async function readLinks(
  supabase: TypedSupabaseClient,
  column: 'guardian_user_id' | 'student_user_id',
  ids: string[]
): Promise<LinkRow[]> {
  const nexusColumn = column === 'guardian_user_id' ? 'parent_user_id' : 'student_user_id';
  const [own, nexus] = await Promise.all([
    supabase
      .from('user_guardian_links')
      .select('id, guardian_user_id, student_user_id, relationship, source')
      .in(column, ids)
      .is('revoked_at', null),
    supabase
      .from('nexus_parent_links')
      .select('parent_user_id, student_user_id, relationship')
      .in(nexusColumn, ids)
      .eq('is_active', true)
      .is('revoked_at', null),
  ]);
  if (own.error) throw own.error;
  if (nexus.error) throw nexus.error;

  const rows: LinkRow[] = (own.data || []).map((r) => ({ ...r }));
  const seen = new Set(rows.map((r) => `${r.guardian_user_id}:${r.student_user_id}`));
  for (const r of nexus.data || []) {
    const key = `${r.parent_user_id}:${r.student_user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: null,
      guardian_user_id: r.parent_user_id,
      student_user_id: r.student_user_id,
      relationship: r.relationship,
      source: 'nexus',
    });
  }
  return rows;
}

async function withPeople(
  supabase: TypedSupabaseClient,
  rows: LinkRow[],
  side: 'guardian_user_id' | 'student_user_id'
): Promise<GuardianSummary[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r[side]))];
  const { data, error } = await supabase.from('users').select('id, name, email, phone').in('id', ids);
  if (error) throw error;
  const byId = new Map((data || []).map((u) => [u.id, u]));
  return rows.map((r) => {
    const person = byId.get(r[side]);
    return {
      link_id: r.id,
      guardian_user_id: r.guardian_user_id,
      student_user_id: r.student_user_id,
      name: person?.name ?? null,
      email: person?.email ?? null,
      phone: person?.phone ?? null,
      relationship: (RELATIONSHIPS.includes(r.relationship as Relationship) ? r.relationship : 'parent') as Relationship,
      source: r.source,
    };
  });
}

/** Parents of each student, keyed by student id. One batched read for a page of rows. */
export async function getGuardiansFor(
  studentIds: string[],
  client?: TypedSupabaseClient
): Promise<Record<string, GuardianSummary[]>> {
  const out: Record<string, GuardianSummary[]> = {};
  if (studentIds.length === 0) return out;
  const supabase = client || getSupabaseAdminClient();
  const rows = await readLinks(supabase, 'student_user_id', studentIds);
  for (const g of await withPeople(supabase, rows, 'guardian_user_id')) {
    (out[g.student_user_id] ||= []).push(g);
  }
  return out;
}

/** Children of one parent account. `name`, `email` and `phone` are the child's. */
export async function getChildrenFor(
  guardianUserId: string,
  client?: TypedSupabaseClient
): Promise<GuardianSummary[]> {
  const supabase = client || getSupabaseAdminClient();
  const rows = await readLinks(supabase, 'guardian_user_id', [guardianUserId]);
  return withPeople(supabase, rows, 'student_user_id');
}

export interface LinkGuardianInput {
  guardianUserId: string;
  studentUserId: string;
  relationship?: Relationship;
  source?: Exclude<LinkSource, 'nexus'>;
  note?: string | null;
  createdBy?: string | null;
}

/** Link a parent account to a child. Linking the same pair twice returns the live link. */
export async function linkGuardian(input: LinkGuardianInput, client?: TypedSupabaseClient) {
  const { guardianUserId, studentUserId, relationship = 'parent', source = 'staff', note, createdBy } = input;
  if (!guardianUserId || !studentUserId) {
    throw Object.assign(new Error('Pick both the parent and the student.'), { status: 400 });
  }
  if (guardianUserId === studentUserId) {
    throw Object.assign(new Error('A person cannot be their own parent.'), { status: 400 });
  }
  if (!RELATIONSHIPS.includes(relationship)) {
    throw Object.assign(new Error('Unknown relationship.'), { status: 400 });
  }
  const supabase = client || getSupabaseAdminClient();

  const { data: existing, error: findError } = await supabase
    .from('user_guardian_links')
    .select('id, guardian_user_id, student_user_id, relationship, source, created_at')
    .eq('guardian_user_id', guardianUserId)
    .eq('student_user_id', studentUserId)
    .is('revoked_at', null)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('user_guardian_links')
    .insert({
      guardian_user_id: guardianUserId,
      student_user_id: studentUserId,
      relationship,
      source,
      note: note ? note.slice(0, 500) : null,
      created_by: createdBy || null,
    })
    .select('id, guardian_user_id, student_user_id, relationship, source, created_at')
    .single();
  if (error) throw error;
  return data;
}

/** Remove a link (kept as history with revoked_at). */
export async function unlinkGuardian(linkId: string, revokedBy?: string | null, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_guardian_links')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy || null })
    .eq('id', linkId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('This link was already removed.'), { status: 409 });
  return data;
}

/**
 * Parent accounts (the demo desk's "parent's account") that no child is linked
 * to yet, with the child's name from their demo booking so staff can match.
 */
export async function listUnlinkedGuardianAccounts(client?: TypedSupabaseClient): Promise<UnlinkedGuardianAccount[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data: parents, error } = await supabase
    .from('users')
    .select('id, name, email, phone, created_at')
    .eq('metadata->>account_holder', 'parent')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!parents?.length) return [];

  const ids = parents.map((p) => p.id);
  const [links, demos] = await Promise.all([
    supabase.from('user_guardian_links').select('guardian_user_id').in('guardian_user_id', ids).is('revoked_at', null),
    supabase
      .from('demo_class_registrations')
      .select('user_id, name, preferred_date, created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  if (links.error) throw links.error;
  if (demos.error) throw demos.error;

  const linked = new Set((links.data || []).map((l) => l.guardian_user_id));
  const demoByParent = new Map<string, { name: string | null; preferred_date: string | null }>();
  for (const d of demos.data || []) if (!demoByParent.has(d.user_id)) demoByParent.set(d.user_id, d);

  return parents
    .filter((p) => !linked.has(p.id))
    .map((p) => ({
      user_id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      created_at: p.created_at,
      demo_student_name: demoByParent.get(p.id)?.name ?? null,
      demo_date: demoByParent.get(p.id)?.preferred_date ?? null,
    }));
}

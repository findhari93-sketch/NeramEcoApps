import { escapeIlikeValue, type TypedSupabaseClient } from '@neram/database';
import { ACTIVE_DEMO_STATUSES } from '@neram/database/demo-schedule';
import { phoneKey } from '@neram/database/phone';

/** Why a person turned up for a number or name staff typed. */
export type MatchReason = 'family_number' | 'other_number' | 'same_name';

export interface DemoPerson {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  user_type: string;
  /** The account is the parent's (user_type parent, or marked so on a demo). */
  is_parent_account: boolean;
  open_request: { id: string; ref_code: string | null; status: string } | null;
  /** Found through a number on file that is not their own mobile, or by name alone. */
  matched?: { reason: MatchReason; label: string; number: string | null } | null;
}

type UserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  user_type: string;
  metadata: Record<string, unknown> | null;
};
type ContactRow = { user_id: string; value: string; relation: string };

const PEOPLE_TYPES = ['lead', 'student', 'parent'];
const USER_COLS = 'id, name, phone, email, user_type, metadata';
const LIMIT = 8;

/** How a user_contacts number reads next to the person it belongs to. */
export function contactMatch(relation: string, number: string): NonNullable<DemoPerson['matched']> {
  if (relation === 'self') return { reason: 'other_number', label: 'Their other number', number };
  if (relation === 'parent') return { reason: 'family_number', label: "Parent's number", number };
  if (relation === 'guardian') return { reason: 'family_number', label: "Guardian's number", number };
  return { reason: 'family_number', label: 'A family number on file', number };
}

/** Direct hits first, then people found through another number, one row per person. */
export function mergePeople(direct: UserRow[], viaContacts: UserRow[], limit = LIMIT): UserRow[] {
  const seen = new Set<string>();
  const out: UserRow[] = [];
  for (const u of [...direct, ...viaContacts]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/** Owners of a phone kept in user_contacts (a parent's, a backup, an enrolment-link number). */
async function contactOwners(
  supabase: any,
  match: { exactKey?: string; partialDigits?: string },
): Promise<{ users: UserRow[]; matched: Record<string, DemoPerson['matched']> }> {
  let query = supabase.from('user_contacts').select('user_id, value, relation').eq('kind', 'phone');
  query = match.exactKey ? query.eq('value_key', match.exactKey) : query.ilike('value_key', `%${match.partialDigits}%`);
  const { data, error } = await query.limit(LIMIT);
  // Fail-soft: before the user_contacts migration there is nothing to add.
  if (error) {
    console.warn('demo people: contact lookup skipped:', error.message);
    return { users: [], matched: {} };
  }
  const contacts = (data ?? []) as ContactRow[];
  if (!contacts.length) return { users: [], matched: {} };
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select(USER_COLS)
    .in('id', Array.from(new Set(contacts.map((c) => c.user_id))))
    .in('user_type', PEOPLE_TYPES);
  if (usersError) throw usersError;
  const matched: Record<string, DemoPerson['matched']> = {};
  for (const c of contacts) matched[c.user_id] ??= contactMatch(c.relation, c.value);
  return { users: (users ?? []) as UserRow[], matched };
}

/** The rows as DemoPerson, with any open demo request of theirs. */
async function toPeople(
  supabase: any,
  users: UserRow[],
  matched: Record<string, DemoPerson['matched']>,
): Promise<DemoPerson[]> {
  const open: Record<string, DemoPerson['open_request']> = {};
  if (users.length) {
    const { data: rows, error } = await supabase
      .from('demo_class_registrations')
      .select('id, user_id, ref_code, status')
      .in('user_id', users.map((u) => u.id))
      .not('ref_code', 'is', null)
      .in('status', ACTIVE_DEMO_STATUSES);
    if (error) throw error;
    for (const r of rows ?? []) open[r.user_id] = { id: r.id, ref_code: r.ref_code, status: r.status };
  }
  return users.map((u) => ({
    id: u.id,
    name: u.name || '',
    phone: u.phone,
    email: u.email,
    user_type: u.user_type,
    is_parent_account: u.user_type === 'parent' || u.metadata?.account_holder === 'parent',
    open_request: open[u.id] ?? null,
    matched: matched[u.id] ?? null,
  }));
}

/**
 * Search People by name, email or phone. A phone also finds the person it is a
 * parent's or backup number of (user_contacts), so typing the father's mobile
 * still brings up the student.
 */
export async function searchDemoPeople(client: TypedSupabaseClient, q: string): Promise<DemoPerson[]> {
  const supabase = client as any;
  const digits = q.replace(/\D/g, '');
  const terms = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 4) terms.push(`phone.ilike.%${digits.slice(-10)}%`);
  const { data, error } = await supabase
    .from('users')
    .select(USER_COLS)
    .in('user_type', PEOPLE_TYPES)
    .or(terms.join(','))
    .order('updated_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  const direct = (data ?? []) as UserRow[];
  const via = digits.length >= 4 ? await contactOwners(supabase, { partialDigits: digits.slice(-10) }) : { users: [], matched: {} };
  // A person whose own mobile matched needs no "Parent's number" note.
  const directIds = new Set(direct.map((u) => u.id));
  const matched = Object.fromEntries(Object.entries(via.matched).filter(([id]) => !directIds.has(id)));
  return toPeople(supabase, mergePeople(direct, via.users), matched);
}

/**
 * People who may be the one staff are about to add as new: the number is a
 * parent's or backup number of someone on file, or someone has exactly this
 * name. Asked only when no one has the number as their own mobile (those are
 * linked without asking).
 */
export async function findPossibleMatches(
  client: TypedSupabaseClient,
  typed: { phone: string; name: string },
): Promise<DemoPerson[]> {
  const supabase = client as any;
  const key = phoneKey(typed.phone);
  const via = key ? await contactOwners(supabase, { exactKey: key }) : { users: [], matched: {} };
  const name = typed.name.trim().replace(/\s+/g, ' ');
  let sameName: UserRow[] = [];
  if (name.length >= 3) {
    const { data, error } = await supabase
      .from('users')
      .select(USER_COLS)
      .in('user_type', PEOPLE_TYPES)
      .ilike('name', escapeIlikeValue(name))
      .order('updated_at', { ascending: false })
      .limit(3);
    if (error) throw error;
    sameName = (data ?? []) as UserRow[];
  }
  const matched: Record<string, DemoPerson['matched']> = { ...via.matched };
  for (const u of sameName) matched[u.id] ??= { reason: 'same_name', label: 'Same name', number: null };
  return toPeople(supabase, mergePeople(via.users, sameName, 5), matched);
}

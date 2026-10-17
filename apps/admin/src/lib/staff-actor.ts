import { getSupabaseAdminClient } from '@neram/database';
import { getRequestAdminId } from './request-admin';

/**
 * Who on the staff did this, as a short label for audit columns such as
 * created_by, revoked_by and reviewed_by (TEXT columns).
 *
 * Order: the name the page sent (staff_name in the body or x-staff-name, the
 * same convention as /api/college-leads), else the verified staff member the
 * middleware stamped on the request, looked up in users, else 'Neram Staff'.
 */
export interface StaffActor {
  name: string;
  email: string | null;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 200) : '';
}

/** A staff member proven by the middleware, for routes that write a users.id (UUID FK). */
export interface VerifiedStaff {
  id: string;
  name: string;
  email: string | null;
}

/**
 * The verified staff member behind this request, or null.
 *
 * Reads ONLY the id middleware.ts stamped after checking the Microsoft token,
 * then the users row. Never a name, email or id from the body or a client
 * header: those are whatever the caller chose to send. Null means the route
 * must answer 401 (no verified caller, the middleware in `report` mode, or a
 * user row that no longer exists).
 */
export async function resolveVerifiedStaff(
  request: Request,
  lookup: (id: string) => Promise<{ id: string; name: string | null; email: string | null } | null> = lookupUser
): Promise<VerifiedStaff | null> {
  const adminId = getRequestAdminId(request);
  if (!adminId) return null;
  let row: { id: string; name: string | null; email: string | null } | null = null;
  try {
    row = await lookup(adminId);
  } catch {
    return null;
  }
  if (!row?.id) return null;
  return { id: row.id, name: row.name?.trim() || row.email || 'Neram Staff', email: row.email ?? null };
}

async function lookupUser(id: string) {
  const { data } = await (getSupabaseAdminClient().from('users' as never) as any)
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle();
  return (data as { id: string; name: string | null; email: string | null } | null) ?? null;
}

export async function resolveStaff(request: Request, body?: Record<string, unknown> | null): Promise<StaffActor> {
  const name = clean(body?.staff_name) || clean(request.headers.get('x-staff-name'));
  const email = clean(body?.staff_email) || clean(request.headers.get('x-staff-email'));
  if (name || email) return { name: name || email, email: email || null };

  const adminId = getRequestAdminId(request);
  if (adminId) {
    try {
      const { data } = await (getSupabaseAdminClient().from('users' as never) as any)
        .select('name, email')
        .eq('id', adminId)
        .maybeSingle();
      const row = data as { name: string | null; email: string | null } | null;
      if (row?.name || row?.email) return { name: row.name || row.email || 'Neram Staff', email: row.email ?? null };
    } catch {
      // Fall through: an audit label must never fail the action.
    }
  }
  return { name: 'Neram Staff', email: null };
}

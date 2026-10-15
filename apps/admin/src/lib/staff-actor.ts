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

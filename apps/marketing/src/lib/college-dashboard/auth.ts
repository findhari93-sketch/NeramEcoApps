import { createServerClient, createAdminClient } from '@neram/database';
import { NextRequest, NextResponse } from 'next/server';
import { can, normalizeRole, type CollegeAction, type CollegeRole } from './permissions';

export interface CollegeDashboardUser {
  userId: string;
  id: string;
  college_id: string;
  name: string;
  email: string;
  role: CollegeRole;
}

/** An error the dashboard routes turn into a status code and a plain message. */
export class DashboardError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The signed-in college account for a dashboard API call. The college comes
 * from the account row, never from the request, so one college can never read
 * or change another college's data.
 */
export async function verifyCollegeDashboardAuth(request: NextRequest): Promise<CollegeDashboardUser> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new DashboardError(401, 'No token');

  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new DashboardError(401, 'Invalid token');

  const admin = createAdminClient();
  const { data: collegeAdminRaw, error: adminError } = await (admin as any)
    .from('college_admins')
    .select('id, college_id, name, email, role, is_active')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (adminError || !collegeAdminRaw) throw new DashboardError(403, 'This sign-in is not linked to a college account.');

  // Cast to concrete type since Supabase generated types are too deep for TS inference
  const collegeAdmin = collegeAdminRaw as unknown as {
    id: string;
    college_id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
  };

  if (!collegeAdmin.is_active) throw new DashboardError(403, 'This account is switched off. Contact Neram Classes support.');

  return {
    userId: user.id,
    id: collegeAdmin.id,
    college_id: collegeAdmin.college_id,
    name: collegeAdmin.name,
    email: collegeAdmin.email,
    role: normalizeRole(collegeAdmin.role),
  };
}

/** verifyCollegeDashboardAuth plus a role check for one action. */
export async function requireCollegeAction(request: NextRequest, action: CollegeAction): Promise<CollegeDashboardUser> {
  const user = await verifyCollegeDashboardAuth(request);
  if (!can(user.role, action)) {
    throw new DashboardError(403, action === 'manage_team' ? 'Only an owner can manage the team.' : 'Your role can only view this dashboard.');
  }
  return user;
}

/** JSON error response for a dashboard route. */
export function dashboardErrorResponse(err: unknown) {
  if (err instanceof DashboardError) return NextResponse.json({ error: err.message }, { status: err.status });
  const msg = err instanceof Error ? err.message : 'Something went wrong';
  console.error('[college-dashboard]', msg);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

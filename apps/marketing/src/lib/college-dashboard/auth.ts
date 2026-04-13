import { createServerClient, createAdminClient } from '@neram/database';
import { NextRequest } from 'next/server';

export interface CollegeDashboardUser {
  userId: string;
  id: string;
  college_id: string;
  name: string;
  role: string;
}

export async function verifyCollegeDashboardAuth(request: NextRequest): Promise<CollegeDashboardUser> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new Error('No token');

  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid token');

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: collegeAdminRaw, error: adminError } = await (admin as any)
    .from('college_admins')
    .select('id, college_id, name, role, is_active')
    .eq('supabase_uid', user.id)
    .single();

  if (adminError || !collegeAdminRaw) throw new Error('College admin record not found');

  // Cast to concrete type since Supabase generated types are too deep for TS inference
  const collegeAdmin = collegeAdminRaw as unknown as {
    id: string;
    college_id: string;
    name: string;
    role: string;
    is_active: boolean;
  };

  if (!collegeAdmin.is_active) throw new Error('Account is inactive. Contact Neram Classes support.');

  return {
    userId: user.id,
    id: collegeAdmin.id,
    college_id: collegeAdmin.college_id,
    name: collegeAdmin.name,
    role: collegeAdmin.role,
  };
}

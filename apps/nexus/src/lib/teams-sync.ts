/**
 * Teams member sync — add/remove/reconcile Nexus enrollments with Teams team members.
 *
 * All operations use app-only (client credentials) tokens for server-side execution.
 * Requires Azure AD Application permission: TeamMember.ReadWrite.All
 */

import { getAppOnlyToken } from './graph-app-token';
import { getSupabaseAdminClient } from '@neram/database';

// ============================================
// TYPES
// ============================================

interface TeamMember {
  id: string; // membership ID
  userId: string;
  displayName: string;
  email: string;
  roles: string[]; // ['owner'] or []
}

export interface SyncResult {
  added: number;
  skipped: number; // users without ms_oid
  alreadyInTeam: number;
  failed: number;
  errors: string[];
}

// ============================================
// MEMBER OPERATIONS
// ============================================

/**
 * Add a single user to a Teams team by their Microsoft OID.
 */
export async function addMemberToTeam(teamId: string, msOid: string): Promise<void> {
  const token = await getAppOnlyToken();

  const res = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      'roles': [],
      'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${msOid}')`,
    }),
  });

  if (!res.ok) {
    // 409 = already a member (not an error)
    if (res.status === 409) return;
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to add member to team: ${res.status} ${err}`);
  }
}

/**
 * Remove a member from a Teams team by their membership ID.
 */
export async function removeMemberFromTeam(teamId: string, membershipId: string): Promise<void> {
  const token = await getAppOnlyToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/members/${membershipId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to remove member: ${res.status} ${err}`);
  }
}

/**
 * Get all members of a Teams team.
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const token = await getAppOnlyToken();
  const members: TeamMember[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/teams/${teamId}/members?$top=999`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Failed to get team members: ${res.status} ${err}`);
    }

    const data: any = await res.json();
    for (const m of data.value || []) {
      members.push({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName || '',
        email: m.email || '',
        roles: m.roles || [],
      });
    }

    url = data['@odata.nextLink'] || null;
  }

  return members;
}

// ============================================
// SYNC
// ============================================

/**
 * Full diff-based sync: reconcile Nexus enrollments with Teams team members.
 *
 * Additive by default — only adds missing members, never removes.
 * Users in Teams but not in Nexus are kept (teacher may have added them manually).
 */
export async function syncClassroomToTeam(classroomId: string): Promise<SyncResult> {
  const supabase = getSupabaseAdminClient();

  // Get classroom's linked team
  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id')
    .eq('id', classroomId)
    .single();

  if (!classroom?.ms_team_id) {
    throw new Error('Classroom has no linked Teams team');
  }

  const teamId = classroom.ms_team_id;

  // Get all active Nexus enrollments with their ms_oid
  const { data: enrollments } = await supabase
    .from('nexus_enrollments')
    .select('user_id, users!inner(ms_oid, name, email)')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  // Get current Teams members
  const teamMembers = await getTeamMembers(teamId);
  const teamMemberOids = new Set(teamMembers.map((m) => m.userId));

  const result: SyncResult = {
    added: 0,
    skipped: 0,
    alreadyInTeam: 0,
    failed: 0,
    errors: [],
  };

  for (const enrollment of enrollments || []) {
    const user = enrollment.users as unknown as { ms_oid: string | null; name: string; email: string };

    if (!user?.ms_oid) {
      result.skipped++;
      continue;
    }

    if (teamMemberOids.has(user.ms_oid)) {
      result.alreadyInTeam++;
      continue;
    }

    try {
      await addMemberToTeam(teamId, user.ms_oid);
      result.added++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${user.name || user.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Log the sync result
  await (supabase as any).from('nexus_teams_sync_log').insert({
    classroom_id: classroomId,
    action: 'sync',
    status: result.failed > 0 ? 'failed' : 'success',
    details: result,
  });

  return result;
}

// ============================================
// TEAM CREATION
// ============================================

/**
 * Create a new Teams team and link it to the classroom.
 * The teacher becomes the owner. Returns the new team ID.
 */
export async function createTeamForClassroom(
  classroomId: string,
  name: string,
  description: string,
  ownerMsOid: string
): Promise<string> {
  const token = await getAppOnlyToken();

  // Create team via Graph API
  const res = await fetch('https://graph.microsoft.com/v1.0/teams', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'template@odata.bind': "https://graph.microsoft.com/v1.0/teamsTemplates('educationClass')",
      displayName: name,
      description: description || `Nexus classroom: ${name}`,
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          'roles': ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${ownerMsOid}')`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to create team: ${res.status} ${err}`);
  }

  // Team creation is async — response has 202 + Location header with team ID
  // Or for some templates, 201 with the team in the body
  let teamId: string;

  if (res.status === 202) {
    // Extract team ID from the Content-Location or Location header
    const location = res.headers.get('Content-Location') || res.headers.get('Location') || '';
    const match = location.match(/teams\('([^']+)'\)/);
    if (match) {
      teamId = match[1];
    } else {
      // Poll the operation URL for completion
      const operationUrl = res.headers.get('Location');
      if (!operationUrl) throw new Error('Team creation returned 202 but no Location header');

      // Wait and poll for team ID
      teamId = await pollTeamCreation(token, operationUrl);
    }
  } else {
    const body = await res.json();
    teamId = body.id;
  }

  // Link team to classroom in Supabase
  const supabase = getSupabaseAdminClient();
  await supabase
    .from('nexus_classrooms')
    .update({
      ms_team_id: teamId,
      ms_team_name: name,
      ms_team_sync_enabled: true,
    })
    .eq('id', classroomId);

  // Log the creation
  await (supabase as any).from('nexus_teams_sync_log').insert({
    classroom_id: classroomId,
    action: 'create_team',
    status: 'success',
    details: { teamId, teamName: name },
  });

  return teamId;
}

/**
 * Poll a Teams creation operation until the team is ready.
 */
async function pollTeamCreation(token: string, operationUrl: string): Promise<string> {
  const maxAttempts = 30; // 30 * 2s = 60s max wait

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const res = await fetch(operationUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'succeeded' && data.targetResourceId) {
        return data.targetResourceId;
      }
      if (data.status === 'failed') {
        throw new Error(`Team creation failed: ${data.error?.message || 'Unknown error'}`);
      }
    }
  }

  throw new Error('Team creation timed out after 60 seconds');
}

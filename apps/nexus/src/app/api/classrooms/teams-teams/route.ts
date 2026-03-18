import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';

/**
 * GET /api/classrooms/teams-teams
 * Returns the teacher's joined Microsoft Teams teams.
 * Used for linking a Nexus classroom to a Teams team.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));

    // Fetch joined teams from Microsoft Graph
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text().catch(() => 'Unknown error');
      return NextResponse.json(
        { error: `Failed to fetch Teams: ${graphRes.status} ${errText}` },
        { status: graphRes.statusText === 'Forbidden' ? 403 : 500 }
      );
    }

    const data = await graphRes.json();
    const teams = (data.value || []).map((team: { id: string; displayName: string; description: string | null }) => ({
      id: team.id,
      displayName: team.displayName,
      description: team.description,
    }));

    return NextResponse.json({ teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Teams';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * GET /api/classrooms/teams-teams?team_id={id}
 * Returns channels for a specific team (for future batch → channel mapping).
 */

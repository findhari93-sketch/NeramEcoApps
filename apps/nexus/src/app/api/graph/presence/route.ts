import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';

/**
 * POST /api/graph/presence
 * Body: { ids: ["oid1", "oid2", ...] }
 *
 * Bulk-fetches presence status for multiple users via Microsoft Graph.
 * Returns array of { id, availability, activity }.
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'Provide ids array' }, { status: 400 });
  }

  // Graph API supports up to 650 IDs per request
  const ids = body.ids.slice(0, 650);

  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/communications/getPresencesByUserId',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      }
    );

    if (response.status === 401) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Graph presence error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch presence' }, { status: response.status });
    }

    const data = await response.json();
    const presences = (data.value || []).map((p: { id: string; availability: string; activity: string }) => ({
      id: p.id,
      availability: p.availability,
      activity: p.activity,
    }));

    return NextResponse.json(
      { presences },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    );
  } catch (err) {
    console.error('Graph presence proxy error:', err);
    return NextResponse.json({ error: 'Graph API request failed' }, { status: 502 });
  }
}

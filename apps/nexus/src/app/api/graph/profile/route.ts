import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { isImpersonationToken, verifyImpersonationToken } from '@/lib/impersonation-token';
import { getAppOnlyToken } from '@neram/auth';

const PROFILE_FIELDS = [
  'displayName',
  'givenName',
  'surname',
  'jobTitle',
  'department',
  'officeLocation',
  'city',
  'state',
  'country',
  'mobilePhone',
  'businessPhones',
  'employeeId',
  'mail',
  'userPrincipalName',
].join(',');

/**
 * GET /api/graph/profile?oid={ms_oid}
 * GET /api/graph/profile?self=true
 *
 * Proxies Microsoft Graph user profile data.
 */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const self = request.nextUrl.searchParams.get('self') === 'true';
  const oid = request.nextUrl.searchParams.get('oid');

  if (!self && !oid) {
    return NextResponse.json({ error: 'Provide oid or self=true' }, { status: 400 });
  }

  // Under impersonation the bearer is not a real Graph token; resolve the
  // target oid and call Graph with an app-only token instead.
  let graphUrl: string;
  let graphToken = token;

  if (isImpersonationToken(token)) {
    const payload = verifyImpersonationToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid impersonation token' }, { status: 401 });
    }
    const effectiveOid = self ? payload.targetMsOid : oid;
    if (!effectiveOid) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    try {
      graphToken = await getAppOnlyToken();
    } catch (err) {
      console.error('App-only token error (profile):', err);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 502 });
    }
    graphUrl = `https://graph.microsoft.com/v1.0/users/${effectiveOid}?$select=${PROFILE_FIELDS}`;
  } else {
    graphUrl = self
      ? `https://graph.microsoft.com/v1.0/me?$select=${PROFILE_FIELDS}`
      : `https://graph.microsoft.com/v1.0/users/${oid}?$select=${PROFILE_FIELDS}`;
  }

  try {
    const response = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (response.status === 401) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    if (response.status === 404) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json(
      {
        displayName: data.displayName || null,
        givenName: data.givenName || null,
        surname: data.surname || null,
        jobTitle: data.jobTitle || null,
        department: data.department || null,
        officeLocation: data.officeLocation || null,
        city: data.city || null,
        state: data.state || null,
        country: data.country || null,
        mobilePhone: data.mobilePhone || null,
        businessPhones: data.businessPhones || [],
        employeeId: data.employeeId || null,
        mail: data.mail || null,
        userPrincipalName: data.userPrincipalName || null,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (err) {
    console.error('Graph profile proxy error:', err);
    return NextResponse.json({ error: 'Graph API request failed' }, { status: 502 });
  }
}

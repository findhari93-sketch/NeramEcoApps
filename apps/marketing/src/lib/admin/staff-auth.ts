import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const STAFF_COOKIE_NAME = 'neram_staff_session';
const COOKIE_TTL_DAYS = 7;

export interface StaffSession {
  name: string;
  email: string;
}

interface SignedPayload extends StaffSession {
  iat: number;
  exp: number;
}

function getSessionSecret(): string {
  const secret = process.env.NERAM_STAFF_SESSION_SECRET;
  if (!secret) throw new Error('NERAM_STAFF_SESSION_SECRET is not set');
  return secret;
}

function getAdminSecret(): string {
  const secret = process.env.NERAM_STAFF_ADMIN_SECRET;
  if (!secret) throw new Error('NERAM_STAFF_ADMIN_SECRET is not set');
  return secret;
}

export function verifyAdminSecret(candidate: string): boolean {
  const expected = getAdminSecret();
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmac(value: string): string {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

export function signStaffSession(session: StaffSession): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedPayload = {
    name: session.name,
    email: session.email,
    iat: now,
    exp: now + COOKIE_TTL_DAYS * 24 * 60 * 60,
  };
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8').toString('base64url');
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifyStaffSession(cookieValue: string | undefined): StaffSession | null {
  if (!cookieValue) return null;
  const [body, sig] = cookieValue.split('.');
  if (!body || !sig) return null;
  const expectedSig = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as SignedPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.name || !payload.email) return null;
    return { name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

export function requireNeramStaff(req?: NextRequest): StaffSession {
  const cookie = req
    ? req.cookies.get(STAFF_COOKIE_NAME)?.value
    : cookies().get(STAFF_COOKIE_NAME)?.value;
  const session = verifyStaffSession(cookie);
  if (!session) {
    const err = new Error('Unauthorized: Neram staff session required');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return session;
}

export function getStaffSessionOptional(req?: NextRequest): StaffSession | null {
  const cookie = req
    ? req.cookies.get(STAFF_COOKIE_NAME)?.value
    : cookies().get(STAFF_COOKIE_NAME)?.value;
  return verifyStaffSession(cookie);
}

export const COOKIE_MAX_AGE_SECONDS = COOKIE_TTL_DAYS * 24 * 60 * 60;

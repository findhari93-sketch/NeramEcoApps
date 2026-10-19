export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listUserContacts } from '@neram/database';

/**
 * GET /api/crm/contacts?person=<user id>
 * The extra numbers and emails a person is reachable on (user_contacts), for
 * the Family card on User 360. Staff only (middleware.ts).
 */
export async function GET(request: NextRequest) {
  const person = request.nextUrl.searchParams.get('person');
  if (!person || !/^[0-9a-f-]{36}$/i.test(person)) {
    return NextResponse.json({ error: 'Choose a person.' }, { status: 400 });
  }
  try {
    const contacts = await listUserContacts(person);
    return NextResponse.json({ contacts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Contacts list error:', error);
    return NextResponse.json({ error: 'Could not load the contacts.' }, { status: 500 });
  }
}

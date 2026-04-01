// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAutoMessagesForUser } from '@neram/database';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const messages = await getAutoMessagesForUser(params.id);
    return NextResponse.json({ messages });
  } catch (error: any) {
    // Return empty array if table doesn't exist yet or query fails
    console.error('Error fetching auto messages:', error);
    return NextResponse.json({ messages: [] });
  }
}

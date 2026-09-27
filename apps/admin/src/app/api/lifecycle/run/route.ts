export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { runLifecycleSuggestions } from '@neram/database';

/** POST /api/lifecycle/run - refresh suggestions now (e.g. after changing the rules). */
export async function POST() {
  try {
    return NextResponse.json({ added: await runLifecycleSuggestions() });
  } catch (error) {
    console.error('Run lifecycle suggestions error:', error);
    return NextResponse.json({ error: 'Could not refresh suggestions.' }, { status: 500 });
  }
}

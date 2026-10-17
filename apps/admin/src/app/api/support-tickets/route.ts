export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupportTicketQueueCounts, listSupportTicketInbox } from '@neram/database';
import type { SupportTicketCategory, SupportTicketPriority, SupportTicketQueue } from '@neram/database';
import { TICKET_CATEGORY_LABEL } from '@neram/database/support-ticket-status';
import { resolveVerifiedStaff } from '@/lib/staff-actor';
import { unauthorized } from '@/lib/support-inbox/server';

const QUEUES: SupportTicketQueue[] = ['new', 'in_progress', 'waiting', 'to_confirm', 'closed', 'all'];
const PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high'];
const ASSIGNEES = ['me', 'unassigned', 'any'] as const;
const SOURCES = ['app', 'nexus', 'marketing'];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * GET /api/support-tickets: the Admin inbox list.
 *
 * ?queue=new|in_progress|waiting|to_confirm|closed|all  (default new)
 * ?assignee=me|unassigned|any  ?source  ?category  ?priority  ?q
 * ?page ?limit (max 100)  ?counts=1 adds the tab counts.
 *
 * Status changes go through PATCH /api/support-tickets/[id] with an action.
 */
export async function GET(request: NextRequest) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();

  try {
    const p = new URL(request.url).searchParams;
    const queue = pick(p.get('queue'), QUEUES) ?? 'new';
    const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '30', 10) || 30));
    const supabase = getSupabaseAdminClient() as any;

    const [list, counts] = await Promise.all([
      listSupportTicketInbox(
        {
          queue,
          assignee: pick(p.get('assignee'), ASSIGNEES),
          actorId: staff.id,
          source: pick(p.get('source'), SOURCES),
          category: pick(p.get('category'), Object.keys(TICKET_CATEGORY_LABEL)) as SupportTicketCategory | undefined,
          priority: pick(p.get('priority'), PRIORITIES),
          search: p.get('q') || undefined,
          page,
          limit,
        },
        supabase
      ),
      p.get('counts') === '1' ? getSupportTicketQueueCounts(staff.id, supabase) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      data: list.data,
      total: list.total,
      page,
      limit,
      hasMore: page * limit < list.total,
      ...(counts ? { counts } : {}),
    });
  } catch (error) {
    console.error('Error listing support tickets:', error);
    return NextResponse.json({ error: 'Failed to list support tickets' }, { status: 500 });
  }
}

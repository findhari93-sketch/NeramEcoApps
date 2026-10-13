export const dynamic = 'force-dynamic';

/**
 * GET /api/college-hub/colleges/:id/faqs   the college's FAQs, in page order
 * PUT /api/college-hub/colleges/:id/faqs   { faqs: [{ id?, question, answer, intent?, locked? }] }
 *
 * PUT replaces the college's FAQ list with what staff sent. Every row sent is
 * saved as generated_by 'staff' and locked, so the nightly writer keeps it;
 * send `locked: false` on a row to let the writer replace it next time the
 * college's facts change. Staff only (admin
 * API middleware). No em dashes: the same house rule the writer follows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FAQS = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown college' }, { status: 400 });
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('college_faqs')
    .select('id,position,question,answer,intent,fact_keys,generated_by,locked,updated_at')
    .eq('college_id', params.id)
    .order('position');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

interface InFaq {
  question?: unknown;
  answer?: unknown;
  intent?: unknown;
  locked?: unknown;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown college' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { faqs?: InFaq[] } | null;
  if (!body || !Array.isArray(body.faqs) || body.faqs.length > MAX_FAQS) {
    return NextResponse.json({ error: `Send { faqs: [...] } with at most ${MAX_FAQS} items` }, { status: 400 });
  }

  const rows = [];
  for (const [i, f] of body.faqs.entries()) {
    const question = typeof f.question === 'string' ? f.question.trim() : '';
    const answer = typeof f.answer === 'string' ? f.answer.trim() : '';
    if (!question || !answer) return NextResponse.json({ error: `FAQ ${i + 1} needs a question and an answer` }, { status: 400 });
    if (/[—–]|--/.test(question + answer)) {
      return NextResponse.json({ error: `FAQ ${i + 1} has a dash; use a comma, colon or full stop instead` }, { status: 400 });
    }
    rows.push({
      college_id: params.id,
      position: (i + 1) * 10,
      question: question.slice(0, 300),
      answer: answer.slice(0, 1500),
      intent: typeof f.intent === 'string' ? f.intent.slice(0, 40) : null,
      generated_by: 'staff',
      locked: f.locked !== false,
    });
  }

  const supabase = getSupabaseAdminClient() as any;
  const { error: delErr } = await supabase.from('college_faqs').delete().eq('college_id', params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (rows.length) {
    const { error } = await supabase.from('college_faqs').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, count: rows.length });
}

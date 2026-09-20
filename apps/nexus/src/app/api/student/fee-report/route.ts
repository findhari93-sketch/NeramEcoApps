import { NextResponse } from 'next/server';

/**
 * Withdrawn 2026-09-19. Students are never asked about money.
 *
 * This route let a student POST an amount and a receipt, which inserted a
 * `payments` row under their own name. That is the wrong way round: a fee is
 * agreed per student by the office and differs between students, so the student
 * is the one person who does not know the number. Fees are set by staff in Admin
 * and read there.
 *
 * The Fee Status step that called this was removed from
 * /student/complete-profile in the same change. The route is answered here
 * rather than deleted so that the door is explicitly shut: removing only the
 * button would have left any student token able to insert payment rows at will,
 * which is the same hole with no sign on it.
 *
 * Two defects it carried, recorded so they are not rebuilt by accident:
 *   - GET selected a `notes` column that does not exist on `payments`. PostgREST
 *     rejected the query, the error was discarded, and Payment History therefore
 *     never rendered for anyone. Same family as the direct-enrolment insert that
 *     silently wrote 0 of 59 rows.
 *   - POST accepted a `payment_date` and dropped it. `payments` has `paid_at`,
 *     not `payment_date`, so the date a student typed was never stored.
 *
 * If a student-facing fee VIEW is ever wanted, build it read-only against
 * lead_profiles.final_fee and paid `payments` rows (see
 * apps/nexus/src/lib/student-finance.ts for which figures are canonical and
 * which are a cache). Do not restore the write path.
 */

const GONE = {
  error:
    'Fee details are handled by the office. Please ask your teacher if something looks wrong.',
} as const;

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}

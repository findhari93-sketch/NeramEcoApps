export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { AiBlockedError, generateGeminiText, hashClientKey, ipFromHeaders } from '@neram/ai';

/**
 * Aintra on a Gold or Platinum college page.
 *
 * Was pinned to gemini-1.5-flash, a model Google retired, so every question a
 * visitor asked came back as "AI service temporarily unavailable". Now on
 * @neram/ai, which owns the model list and meters the spend.
 *
 * The college context moved from a fake opening exchange (a user turn holding
 * the instructions plus a scripted model reply agreeing to them) into a real
 * systemInstruction. Same behaviour, two fewer turns resent on every message,
 * and the instructions can no longer be mistaken for something the visitor said.
 */

export async function POST(request: NextRequest) {
  try {
    const { college_id, message, history } = await request.json();

    if (!college_id || !message) {
      return NextResponse.json({ error: 'college_id and message required' }, { status: 400 });
    }

    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('colleges')
      .select(
        `
        name, short_name, city, state, type, about, neram_tier,
        annual_fee_approx, annual_fee_min, annual_fee_max,
        total_barch_seats, coa_approved, naac_grade, nirf_rank_architecture,
        arch_index_score, accepted_exams, counseling_systems,
        website, admissions_phone, admissions_email,
        has_management_quota, has_nri_quota
      `
      )
      .eq('id', college_id)
      .single();

    /**
     * Cast because database.generated.ts is stale for `colleges`: it carries
     * only a handful of the columns the table actually has. All 22 selected
     * here were verified present in the live schema, so the query is correct
     * and it is the checked-in type that is behind. Regenerating it is a
     * separate job (`pnpm supabase:gen:types`) that would touch this whole
     * file. The `@ts-nocheck` that used to sit at the top of this route hid
     * this, along with everything else, including the retired model that had
     * left the route dead for months.
     */
    const college = data as unknown as {
      name: string;
      short_name: string | null;
      city: string | null;
      state: string | null;
      type: string | null;
      about: string | null;
      neram_tier: string | null;
      annual_fee_approx: number | null;
      total_barch_seats: number | null;
      coa_approved: boolean | null;
      naac_grade: string | null;
      nirf_rank_architecture: number | null;
      accepted_exams: string[] | null;
      counseling_systems: string[] | null;
      website: string | null;
      admissions_phone: string | null;
      admissions_email: string | null;
      has_management_quota: boolean | null;
      has_nri_quota: boolean | null;
    } | null;

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    if (!['gold', 'platinum'].includes(college.neram_tier as string)) {
      return NextResponse.json(
        { error: 'Aintra is available for Gold and Platinum colleges only' },
        { status: 403 }
      );
    }

    const systemContext = `You are Aintra, the AI assistant for ${college.name} on Neram Architecture Portal.
Answer student queries about this college using ONLY the data provided below.
If you don't have specific information, say: "I don't have that data yet. Please check the college's official website or contact admissions directly."
Be helpful, concise, and student-friendly. Never make up information. Keep responses under 150 words.
Do not discuss other colleges. Do not mention that you are built on Gemini.

College Data:
- Name: ${college.name} (${college.short_name || ''})
- Location: ${college.city}, ${college.state}
- Type: ${college.type || 'N/A'}
- About: ${college.about || 'N/A'}
- COA Approved: ${college.coa_approved ? 'Yes' : 'No'}
- NAAC Grade: ${college.naac_grade || 'N/A'}
- NIRF Rank (Architecture): ${college.nirf_rank_architecture ? '#' + college.nirf_rank_architecture : 'N/A'}
- Annual Fee: ${college.annual_fee_approx ? '~₹' + (college.annual_fee_approx / 100000).toFixed(1) + ' Lakhs/yr' : 'N/A'}
- Total B.Arch Seats: ${college.total_barch_seats || 'N/A'}
- Accepted Exams: ${(college.accepted_exams || []).join(', ') || 'N/A'}
- Counseling: ${(college.counseling_systems || []).join(', ') || 'N/A'}
- Management Quota: ${college.has_management_quota ? 'Yes' : 'No'}
- NRI Quota: ${college.has_nri_quota ? 'Yes' : 'No'}
- Admissions Phone: ${college.admissions_phone || 'Contact college website'}
- Admissions Email: ${college.admissions_email || 'N/A'}
- Official Website: ${college.website || 'N/A'}`;

    const turns = ((history || []) as Array<{ role: string; content: string }>)
      .slice(-6)
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: m.content }],
      }));

    let reply: string;
    try {
      reply = await generateGeminiText({
        feature: 'marketing.college-aintra',
        // No session id in this widget's payload, so the visitor key is the
        // IP alone. Weaker than session plus IP, but it still stops one
        // machine spending the whole cap.
        clientKey: hashClientKey(ipFromHeaders(request.headers)),
        systemInstruction: systemContext,
        contents: [...turns, { role: 'user', parts: [{ text: message }] }],
        responseMimeType: 'text/plain',
      });
    } catch (err) {
      // A visitor has nobody to run a prompt for them, so a refusal reads the
      // same as any other outage.
      if (err instanceof AiBlockedError) {
        return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 503 });
      }
      throw err;
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Aintra error:', err);
    return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 500 });
  }
}

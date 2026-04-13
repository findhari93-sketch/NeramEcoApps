export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  try {
    const { college_id, message, history } = await request.json();

    if (!college_id || !message) {
      return NextResponse.json(
        { error: 'college_id and message required' },
        { status: 400 }
      );
    }

    if (message.length > 500) {
      return NextResponse.json(
        { error: 'Message too long (max 500 chars)' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: college } = await supabase
      .from('colleges')
      .select(`
        name, short_name, city, state, type, about, neram_tier,
        annual_fee_approx, annual_fee_min, annual_fee_max,
        total_barch_seats, coa_approved, naac_grade, nirf_rank_architecture,
        arch_index_score, accepted_exams, counseling_systems,
        website, admissions_phone, admissions_email,
        has_management_quota, has_nri_quota
      `)
      .eq('id', college_id)
      .single();

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    if (!['gold', 'platinum'].includes(college.neram_tier)) {
      return NextResponse.json(
        { error: 'Aintra is available for Gold and Platinum colleges only' },
        { status: 403 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
- Annual Fee: ${college.annual_fee_approx ? '~\u20b9' + (college.annual_fee_approx / 100000).toFixed(1) + ' Lakhs/yr' : 'N/A'}
- Total B.Arch Seats: ${college.total_barch_seats || 'N/A'}
- Accepted Exams: ${(college.accepted_exams || []).join(', ') || 'N/A'}
- Counseling: ${(college.counseling_systems || []).join(', ') || 'N/A'}
- Management Quota: ${college.has_management_quota ? 'Yes' : 'No'}
- NRI Quota: ${college.has_nri_quota ? 'Yes' : 'No'}
- Admissions Phone: ${college.admissions_phone || 'Contact college website'}
- Admissions Email: ${college.admissions_email || 'N/A'}
- Official Website: ${college.website || 'N/A'}`;

    const chatHistory = (history || [])
      .slice(-6)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        {
          role: 'model',
          parts: [
            {
              text: `Understood. I am Aintra, the AI assistant for ${college.name}. How can I help you?`,
            },
          ],
        },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    return NextResponse.json({ reply: response });
  } catch (err) {
    console.error('Aintra error:', err);
    return NextResponse.json(
      { error: 'AI service temporarily unavailable' },
      { status: 500 }
    );
  }
}

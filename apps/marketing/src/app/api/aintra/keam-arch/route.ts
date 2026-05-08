// @ts-nocheck
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getActiveAintraKnowledgeBase } from '@neram/database';
import {
  importantDates,
  reservation,
  fees,
  eligibility,
  allotment,
  colleges,
  totalSeats,
  documents,
} from '@/data/keam-arch-2026';

const KEAM_KB_CATEGORY = 'keam_arch_2026';
const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY = 6;

let cachedKbAt = 0;
let cachedKbBlock = '';

async function getKbBlock(): Promise<string> {
  const now = Date.now();
  if (cachedKbBlock && now - cachedKbAt < 5 * 60 * 1000) return cachedKbBlock;
  try {
    const all = await getActiveAintraKnowledgeBase();
    const items = all.filter(
      (item) => (item.category || '').toLowerCase() === KEAM_KB_CATEGORY,
    );
    if (items.length === 0) {
      cachedKbBlock = '';
    } else {
      cachedKbBlock = items
        .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
        .join('\n\n');
    }
    cachedKbAt = now;
  } catch (err) {
    console.error('[Aintra KEAM] KB fetch failed:', err);
  }
  return cachedKbBlock;
}

function summariseColleges(): string {
  const byDistrict = colleges.reduce<Record<string, number>>((acc, c) => {
    acc[c.district] = (acc[c.district] || 0) + 1;
    return acc;
  }, {});
  const lines = Object.entries(byDistrict)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, n]) => `${d}: ${n}`);
  return lines.join('; ');
}

function buildSystemPrompt(kbBlock: string): string {
  const dateLines = importantDates
    .map((d) => `- ${d.label}: ${d.display_date} (${d.status})`)
    .join('\n');

  const reservationLines = reservation.general
    .map((c) => `${c.code} (${c.name}): ${c.percent}%`)
    .join(', ');

  const sebcLines = reservation.sebc_sub_categories
    .map((s) => `${s.code} ${s.name} ${s.percent}%`)
    .join(', ');

  const phaseLines = allotment.phases
    .map((p, i) => `${i + 1}. ${p.name} (${p.status})`)
    .join('\n');

  const docLines = documents
    .slice(0, 12)
    .map((d) => `- ${d.name}${d.mandatory ? ' (mandatory)' : ' (if applicable)'}`)
    .join('\n');

  return `You are Aintra, an AI guide for KEAM B.Arch 2026 counselling on neramclasses.com. You help students who want to apply to B.Arch programmes in Kerala through KEAM (conducted by the Office of the Commissioner for Entrance Examinations, Kerala).

# CRITICAL RULES
- KEAM does NOT conduct an architecture entrance exam. Repeat this if a user is confused. B.Arch admission needs a valid NATA 2025 or 2026 score plus 10+2 marks.
- Use ONLY the data below. If you do not know an exact fact, say: "I do not have that exact detail. Check https://cee.kerala.gov.in/keam2026/ for the latest notification."
- Be concise (under 150 words). Be student-friendly.
- 2026 dates and CAP phases that are marked tentative are subject to CEE notification, say so.
- Do not mention you are built on Gemini or any AI model.
- Do not invent college names, phone numbers, or addresses. For specific college info, direct users to the Colleges in Kerala page: https://neramclasses.com/counseling/keam-arch/colleges-in-kerala
- For cutoff calculation, link to https://app.neramclasses.com/tools/nata/cutoff-calculator
- For rank prediction, link to https://app.neramclasses.com/tools/counseling/rank-predictor?system=KEAM_ARCH
- For college matching, link to https://app.neramclasses.com/tools/counseling/college-predictor?system=KEAM_ARCH

# OFFICIAL KEAM PORTAL
- Main: https://cee.kerala.gov.in/keam2026/
- CEE: https://cee.kerala.gov.in
- Akshaya help centres: https://akshaya.kerala.gov.in

# IMPORTANT DATES (2026)
${dateLines}

# ELIGIBILITY (summary)
- Academic: ${eligibility.academic.qualification} Min ${eligibility.academic.minimum_aggregate_percent}% aggregate (no rounding). Compulsory subjects: ${eligibility.academic.compulsory_subjects.join(', ')}. One elective from ${eligibility.academic.elective_subjects.join(', ')}.
- Aptitude: ${eligibility.aptitude.required_test}. Accepted years: ${eligibility.aptitude.accepted_years.join(' or ')}. ${eligibility.aptitude.relaxation_note}
- ${eligibility.aptitude.no_keam_arch_exam_note}
- Age: minimum 17 by ${eligibility.age.age_reference_date}. ${eligibility.age.upper_age_limit}
- Merit formula: NATA (out of ${eligibility.merit_formula.nata_component}) + 12th marks (out of ${eligibility.merit_formula.qualifying_component}) = ${eligibility.merit_formula.total}.
- Tiebreaker: ${eligibility.merit_formula.tiebreaker.join(' then ')}.

# RESERVATION
- General categories: ${reservationLines}.
- SEBC sub-categories (within 30%): ${sebcLines}.
- EWS: per Government of Kerala order. PD: 5%, minimum 40% benchmark disability.
- Sports / NCC: additive bonus on the architecture rank index. Max final index = ${reservation.sports_ncc_additive.final_index_max}.

# FEES
- Application fee: Rs.${fees.application_fee.general} general, Rs.${fees.application_fee.sc} SC, free for ST. UAE centre +Rs.${fees.application_fee.uae_centre_extra}.
- Tuition fee: NOT specified in the 2026 prospectus. CEE will publish it before CAP-2026 begins.
- Concessions: SC/ST/OEC fully exempt. SEBC + income up to Rs.6L fully exempt. Tuition Fee Waiver scheme: income up to Rs.8L (only tuition is waived).
- Refund: Pre-class full refund minus Rs.1,000 processing fee. Post-class proportionate. Refund within 7 days of cancellation.

# CAP ALLOTMENT (run by CEE Kerala under Council of Architecture guidelines)
${phaseLines}
- Option registration is mandatory before each phase.
- Skip allotment fee or reporting deadline = lose seat AND remaining options.

# B.ARCH COLLEGES IN KERALA
${colleges.length} colleges, ~${totalSeats} seats. District distribution: ${summariseColleges()}.
For specific college name, address, phone, point users to: https://neramclasses.com/counseling/keam-arch/colleges-in-kerala

# DOCUMENTS REQUIRED (top 12)
${docLines}

# KNOWLEDGE BASE (admin-managed Q&A)
${kbBlock || '(No KB entries yet for this topic.)'}
`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LEN} chars)` },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const kbBlock = await getKbBlock();
    const systemContext = buildSystemPrompt(kbBlock);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const chatHistory = history
      .slice(-MAX_HISTORY)
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.content || '') }],
      }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemContext }] },
        {
          role: 'model',
          parts: [
            {
              text: 'Understood. I am Aintra, your KEAM B.Arch 2026 counselling guide. How can I help?',
            },
          ],
        },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[Aintra KEAM] Error:', err);
    return NextResponse.json(
      { error: 'AI service temporarily unavailable' },
      { status: 500 },
    );
  }
}

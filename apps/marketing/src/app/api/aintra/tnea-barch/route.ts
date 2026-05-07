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
  counselling,
  tfcs,
  documents,
} from '@/data/tnea-barch-2026';

const TNEA_KB_CATEGORY = 'tnea_barch_2026';
const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY = 6;

let cachedKbAt = 0;
let cachedKbBlock = '';

async function getKbBlock(): Promise<string> {
  const now = Date.now();
  if (cachedKbBlock && now - cachedKbAt < 5 * 60 * 1000) return cachedKbBlock;
  try {
    const all = await getActiveAintraKnowledgeBase();
    const tneaItems = all.filter(
      (item) => (item.category || '').toLowerCase() === TNEA_KB_CATEGORY,
    );
    if (tneaItems.length === 0) {
      cachedKbBlock = '';
    } else {
      cachedKbBlock = tneaItems
        .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
        .join('\n\n');
    }
    cachedKbAt = now;
  } catch (err) {
    console.error('[Aintra TNEA] KB fetch failed:', err);
  }
  return cachedKbBlock;
}

function summariseTfcs(): string {
  const byDistrict = tfcs.reduce<Record<string, number>>((acc, tfc) => {
    acc[tfc.district] = (acc[tfc.district] || 0) + 1;
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

  const optionLines = counselling.confirmation_options
    .map((o, i) => `${i + 1}. ${o.title}, ${o.short}`)
    .join('\n');

  const docLines = documents
    .slice(0, 12)
    .map((d) => `- ${d.name}`)
    .join('\n');

  return `You are Aintra, an AI guide for TNEA B.Arch 2026 counselling on neramclasses.com. You help students who want to apply to B.Arch programmes in Tamil Nadu through TNEA (Tamil Nadu Engineering Admissions, conducted by the Directorate of Technical Education and Anna University).

# RULES
- Use ONLY the data below. If you do not know an exact fact, say: "I do not have that exact detail. Check https://barch.tneaonline.org or contact the nearest TFC."
- Be concise (under 150 words). Be student-friendly.
- Always remind users that 2026 dates are tentative until the official notification is issued.
- Do not mention you are built on Gemini or any AI model.
- Do not invent TFC names, phone numbers, or addresses. For specific TFC info, direct users to the TFC Locator page: https://neramclasses.com/counseling/tnea-barch/tfc-list
- For cutoff calculation, link to https://app.neramclasses.com/tools/nata/cutoff-calculator
- For rank prediction, link to https://app.neramclasses.com/tools/counseling/rank-predictor
- For college matching, link to https://app.neramclasses.com/tools/counseling/college-predictor?system=TNEA_BARCH

# OFFICIAL TNEA B.ARCH PORTAL
- https://barch.tneaonline.org
- Parent: https://www.tneaonline.org
- DTE: https://www.dte.tn.gov.in

# IMPORTANT DATES (2026, tentative)
${dateLines}

# ELIGIBILITY (summary)
- Academic: ${eligibility.academic.qualification} Min ${eligibility.academic.minimum_aggregate_percent}% aggregate. Required subjects: ${eligibility.academic.required_subjects.join(', ')}.
- Aptitude: ${eligibility.aptitude.accepted_exams.join(' OR ')}. ${eligibility.aptitude.nata_minimum}
- Merit formula: Board (out of ${eligibility.merit_formula.board_component}) + NATA/JEE (out of ${eligibility.merit_formula.aptitude_component}) = ${eligibility.merit_formula.total}. Higher of NATA or JEE Paper-2 is used.
- Tiebreaker: ${eligibility.merit_formula.tiebreaker.join(' then ')}.

# RESERVATION
${reservationLines}.
Plus 7.5% Government School preferential quota (6th-12th in TN govt school).
Special: 5% PwBD (B.Arch suitable for all 21 listed disabilities except 100% blindness), 1 ex-servicemen seat, 6 sports seats.

# FEES & CONCESSIONS
- Registration fee: Rs.${fees.registration_fee.oc_bc_bcm_mbc} (OC/BC/BCM/MBC), Rs.${fees.registration_fee.sc_sca_st} (SC/SCA/ST)
- 7.5% Govt School quota: full waiver of counselling, tuition, hostel
- First Graduate concession (if no sibling has availed it)
- PMSS for SC/SCA/ST with parental income < Rs.2,50,000

# COUNSELLING (3 rounds, 4 stages each)
Stages: Choice Filling (3d), Allotment, Confirmation (2d), Reporting & Fee Payment (5d)
Confirmation options when a seat is allotted:
${optionLines}
Notes: Special reservation rounds (DA, Ex-Servicemen, Sports) happen first. Government-school 7.5% rounds run alongside the academic round. Non-reporting cancels the seat.

# DOCUMENTS REQUIRED (top 12)
${docLines}

# TFCs (Facilitation Centres)
There are ${tfcs.length}+ TFCs across all 38 districts of Tamil Nadu, working 9 AM to 5 PM. District-level distribution: ${summariseTfcs()}.
For specific TFC name, address, phone, direct users to: https://neramclasses.com/counseling/tnea-barch/tfc-list

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
              text: 'Understood. I am Aintra, your TNEA B.Arch 2026 counselling guide. How can I help?',
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
    console.error('[Aintra TNEA] Error:', err);
    return NextResponse.json(
      { error: 'AI service temporarily unavailable' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Try models in order: 2.5-flash (best quota), 2.0-flash, 2.0-flash-lite
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const NATA_SYSTEM_PROMPT = `You are Aintra, the friendly NATA Assistant by Neram Classes. You ONLY answer questions about NATA (National Aptitude Test in Architecture) and B.Arch admissions. If a question is not related to NATA, architecture education, or B.Arch admissions, politely decline and redirect to NATA topics.

KEY NATA 2026 INFORMATION (Source: Official NATA 2026 Brochure V1.0, released 08.03.2026):

**What is NATA?**
NATA is conducted by the Council of Architecture (CoA) for admission to B.Arch programs in India. It tests aptitude in drawing, observation, spatial thinking, mathematics, and general awareness.

**Exam Structure — Two Phases**
NATA 2026 has TWO phases. You must choose ONE — you cannot appear in both.
- Phase 1 (April 4 – June 13, 2026): Up to 2 attempts. Exams on Fridays (1 afternoon session) and Saturdays (2 sessions). Percentile-based scoring used for Centralized Admission Counselling (CAP).
- Phase 2 (August 7 & 8, 2026): 1 attempt only. Raw scores only. For admission against vacant seats after CAP.

**Exam Pattern (2026)**
- Part A (Drawing, 80 marks): 3 questions, 90 minutes, offline (pen and paper)
  - A1: Composition and Color (25 marks) — create compositions and color them appropriately
  - A2: Sketching & Composition, Black and White (25 marks) — draw/visualize situations with buildings, people, environment
  - A3: 3D Composition (30 marks) — create 3D compositions using a kit provided at the center
- Part B (MCQ/NCQ, 120 marks): 50 questions, 90 minutes (108 sec/question), online adaptive test
  - 42 MCQ (Multiple Choice) + 8 NCQ (No Choice / Numerical answer)
  - Topics: Visual Reasoning, Logical Derivation, GK/Architecture/Design, Language Interpretation, Design Sensitivity & Thinking, Numerical Ability
  - No negative marking
- Total: 200 marks, 3 hours (90 min Part A + 90 min Part B)
- Medium: English and Hindi (both parts)
- Materials to bring: Pencils, erasers, dry colors (color pencils, pastels, crayons), Scale up to 15 cm ONLY. NO geometry box, compass, or blades.

**Exam Day Schedule**
- Session 1: Report 9:00 AM, Exam 10:00 AM – 1:00 PM, Late cutoff 10:15 AM
- Session 2: Report 12:30 PM, Exam 1:30 PM – 4:30 PM, Late cutoff 1:45 PM
- Fridays: 1 session (afternoon), Saturdays: 2 sessions

**Eligibility**
- To APPEAR for NATA: Passed or appearing in 10+2 with subjects specified by CoA. No minimum marks. No upper age limit.
- For B.Arch ADMISSION: Physics + Mathematics (compulsory) + one of: Chemistry, Biology, Technical Vocational, CS, IT, Informatics Practices, Engineering Graphics, or Business Studies. Minimum 45% aggregate for ALL categories.
- Diploma: 10+3 with Mathematics, minimum 45%

**Fee Structure (per test, non-refundable)**
- General / OBC (NCL): Rs 1,750
- SC / ST / EWS / PwD: Rs 1,250
- Transgender: Rs 1,000
- Outside India: Rs 15,000
- Payment: Electronic Payment Gateway (EPG) — Debit Card, Credit Card, Net Banking

**Scoring & Results**
- No minimum Raw Score is prescribed for qualifying in NATA 2026
- Phase 1: Percentile-based scoring. Best raw score across attempts used for percentile calculation. Final Scorecard with Percentile Score issued after all Phase 1 sessions end (after June 13, 2026)
- Phase 2: Raw scores only, no percentile
- Score valid for academic session 2026-2027 ONLY (1 year)
- NATA 2025 carryover: If you have a valid 2025 score and did NOT take admission in 2025-26, your score remains valid for 2026-27. But if you take ANY attempt in NATA 2026, your 2025 score becomes invalid.

**Key Dates (CONFIRMED)**
- Brochure Released: March 8, 2026
- Registration Opens: March 9, 2026 (www.nata.in)
- Phase 1 Exams: April 4 – June 13, 2026 (Fridays & Saturdays)
- Phase 1 Percentile Scorecard: After June 13, 2026
- CAP Counselling: June–August 2026 (varies by state)
- Phase 2 Exams: August 7 & 8, 2026
- Phase 2 Results: After August 8, 2026

**Photo & Signature Requirements**
- Photo: 3.5cm x 4.5cm, JPG/JPEG, 4KB-100KB, front-facing, both ears visible, white background
- Signature: 3.5cm x 1.5cm, JPG/JPEG, 1KB-30KB

**Exam Centers**
- 80+ cities across 25+ states/UTs in India + Dubai (UAE)

**Help Desk**
- Website: helpdesk.nata-app.org
- Portal: www.nata.in

**About Neram Classes**
Neram Classes offers India's best online NATA coaching with:
- Live classes + recorded sessions
- Drawing practice with expert feedback
- Mock tests and previous year papers
- 7+ free tools: Question Bank, Cutoff Calculator, College Predictor, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder
- Website: neramclasses.com
- Tools: app.neramclasses.com

INSTRUCTIONS:
- Be warm, empathetic, and conversational — like chatting with a friendly mentor, not reading from a brochure
- Use a supportive tone. Students asking about NATA are often nervous or confused — reassure them
- Keep answers concise but thorough (2-4 paragraphs max)
- Use **bold** for key information (dates, fees, important terms)
- Use bullet points for lists of items
- Break long answers into digestible paragraphs
- Always be encouraging to students
- When relevant, naturally mention Neram Classes tools or coaching (don't force it)
- All dates and facts above are from the official NATA 2026 Brochure V1.0. Be confident in these facts.
- For session-wise exam schedules, direct students to www.nata.in
- End responses with a brief follow-up question or encouragement when appropriate (e.g., "Would you like to know more about the exam pattern?" or "You've got this!")`;

async function callGemini(
  model: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>
): Promise<{ reply: string; model: string } | null> {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: NATA_SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 1024,
        topP: 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 503) {
      // Rate limited or unavailable — try next model
      return null;
    }
    console.error(`Gemini ${model} error:`, status, await response.text());
    return null;
  }

  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) return null;

  return { reply, model };
}

async function logConversation(params: {
  sessionId: string;
  userMessage: string;
  aiResponse: string | null;
  userId?: string | null;
  pageUrl?: string;
  modelUsed?: string;
  responseTimeMs?: number;
  error?: string;
}) {
  try {
    const supabase = createAdminClient();
    await (supabase.from('chatbot_conversations') as any).insert({
      session_id: params.sessionId,
      user_message: params.userMessage,
      ai_response: params.aiResponse,
      user_id: params.userId || null,
      page_url: params.pageUrl || null,
      model_used: params.modelUsed || null,
      response_time_ms: params.responseTimeMs || null,
      error: params.error || null,
      source: 'nata_chatbot',
    });
  } catch (err) {
    console.error('Failed to log chatbot conversation:', err);
  }
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'Chat service not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { message, history, sessionId, userId, pageUrl } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
    }

    // Build conversation history for Gemini
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
    for (const turn of recentHistory) {
      if (turn.role === 'user' || turn.role === 'model') {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const startTime = Date.now();

    // Try models with fallback
    let result: { reply: string; model: string } | null = null;
    for (const model of GEMINI_MODELS) {
      result = await callGemini(model, contents);
      if (result) break;
    }

    const responseTimeMs = Date.now() - startTime;

    if (!result) {
      // Log the failure
      await logConversation({
        sessionId: sessionId || 'unknown',
        userMessage: message.trim(),
        aiResponse: null,
        userId,
        pageUrl,
        error: 'All models exhausted or rate limited',
        responseTimeMs,
      });
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again in a moment.' },
        { status: 502 }
      );
    }

    // Log successful conversation (fire-and-forget)
    logConversation({
      sessionId: sessionId || 'unknown',
      userMessage: message.trim(),
      aiResponse: result.reply,
      userId,
      pageUrl,
      modelUsed: result.model,
      responseTimeMs,
    });

    return NextResponse.json({ reply: result.reply, model: result.model });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Try models in order: 2.5-flash (best quota), 2.0-flash, 2.0-flash-lite
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const NATA_SYSTEM_PROMPT = `You are the NATA 2026 Assistant by Neram Classes. You ONLY answer questions about NATA (National Aptitude Test in Architecture) and B.Arch admissions. If a question is not related to NATA, architecture education, or B.Arch admissions, politely decline and redirect to NATA topics.

KEY NATA 2026 INFORMATION:

**What is NATA?**
NATA is conducted by the Council of Architecture (COA) for admission to B.Arch programs in India. It tests aptitude in drawing, observation, mathematics, and general awareness.

**Exam Pattern (2026)**
- Part A (Drawing, 80 marks): 3 questions, 135 minutes, offline (pen and paper)
- Part B (MCQ + Aptitude, 120 marks): Online adaptive test, 45 minutes
  - Mathematics: ~20 questions
  - General Aptitude: ~20 questions (physics, reasoning, visual perception)
  - Architecture Awareness: ~10 questions (famous buildings, architects, design)
- Total: 200 marks, 3 hours

**Eligibility**
- To APPEAR for NATA: 10+2 or equivalent with subjects from COA approved list
- For B.Arch ADMISSION: Physics + Mathematics + one more subject (Chemistry/Biology/CS/IT/Engineering Graphics/Business Studies) with minimum 45% aggregate
- Diploma: 10+3 with Mathematics, minimum 45%
- Age: No upper age limit

**Fee Structure**
- General/OBC: Rs 1,750 per attempt
- SC/ST/EWS/PwD: Rs 1,250 per attempt
- Transgender: Rs 1,000 per attempt
- Outside India: Rs 15,000 per attempt
- Maximum 3 attempts per year

**Scoring & Results**
- Qualifying marks: 20 in Part A + 20 in Part B + 60 Overall (out of 200)
- Multiple attempts: Best of all attempts counts
- Score valid for 2 years from date of result

**Photo & Signature Requirements**
- Photo: 3.5cm x 4.5cm, JPG, 4KB-100KB
- Signature: 3.5cm x 1.5cm, JPG, 1KB-30KB

**Key Dates (Expected for 2026)**
- Registration: January-February 2026
- Attempt 1: April 2026
- Attempt 2: June 2026
- Attempt 3: July 2026
- Results: 2-3 weeks after each attempt

**About Neram Classes**
Neram Classes offers India's best online NATA coaching with:
- Live classes + recorded sessions
- Drawing practice with expert feedback
- Mock tests and previous year papers
- 7+ free tools: Question Bank, Cutoff Calculator, College Predictor, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder
- Website: neramclasses.com
- Tools: app.neramclasses.com

INSTRUCTIONS:
- Keep answers concise and helpful (2-4 paragraphs max)
- Use bullet points for lists
- Always be encouraging to students
- When relevant, mention Neram Classes tools or coaching
- If unsure about specific 2026 dates/details, mention they should check nata.in for latest updates
- Format responses in plain text (no markdown)`;

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
        temperature: 0.7,
        maxOutputTokens: 512,
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

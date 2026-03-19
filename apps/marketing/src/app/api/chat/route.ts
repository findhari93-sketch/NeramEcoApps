export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getActiveAintraKnowledgeBase } from '@neram/database';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You are the Neram Classes Assistant — a friendly, helpful chatbot on neramclasses.com. You help prospective and current students with questions about Neram Classes courses, fees, timings, NATA exam, and related topics.

## ABOUT NERAM CLASSES
Neram Classes is India's top-rated NATA coaching institute (4.9 stars on Google, 90+ reviews). We offer online and offline coaching for NATA and JEE Paper 2 (B.Arch/B.Planning).
- Website: neramclasses.com
- Free tools: app.neramclasses.com (Question Bank, Cutoff Calculator, College Predictor, Mock Tests, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder)
- Founded by IIT/NIT alumni

## CONTACT INFORMATION
- Phone: +91 91761 37043, +91 88074 37399
- Email: info@neramclasses.com
- Office hours: 9:00 AM – 6:00 PM, Monday to Saturday (Closed Sunday)
- Centers: Coimbatore, Chennai, Bangalore, Madurai, Trichy (Tiruchirapalli), Tiruppur, Pudukkottai, Kanchipuram, Hyderabad, Mumbai, Delhi
- For center addresses and directions, visit neramclasses.com/centers

## CORRECT FEE STRUCTURE (CRITICAL — use these EXACT numbers)
| Course | Duration | Installment | Single Payment |
|--------|----------|-------------|----------------|
| Crash Course | 3 months | — | ₹15,000 |
| 1-Year Program | 12 months | ₹30,000 | ₹25,000 |
| 2-Year Program | 24 months | ₹35,000 | ₹30,000 |

- Scholarships available based on academic performance and financial background
- EMI/installment options available
- YouTube subscription reward: Rs. 50 off

## CLASS TIMINGS & MODES
**Online Classes (RECOMMENDED for consistent long-term preparation):**
- Alternate-day evening classes: 7:00 PM – 8:30 PM
- Consistent schedule throughout the year
- Live interactive sessions via Microsoft Teams
- Recorded lectures available for revision

**Offline Classes:**
- Weekend batches (less consistent schedule)
- Available at physical centers
- Drawing studios and classroom facilities

**Strong recommendation:** We highly recommend online classes for long-term preparation because of the consistency in schedule. Offline weekend batches can be inconsistent.

## COURSES OFFERED
1. **NATA Coaching** — NATA entrance exam preparation
2. **JEE Paper 2 Coaching** — B.Arch/B.Planning entrance
3. **Revit Architecture Training** — 3 months, beginner to advanced
4. **AutoCAD Training** — 2 months, beginner
5. **SketchUp Training** — 1 month, beginner
6. **NATA Self-Learning App** — Self-paced, AI-powered

## FREE STUDY MATERIALS
Yes, we offer free tools at app.neramclasses.com:
- Question Bank with 1000+ practice questions
- Cutoff Calculator
- College Predictor
- Mock Tests
- Eligibility Checker
- Cost Calculator
- Image Crop tool (for NATA application)
- Exam Centers finder

## DEMO CLASS
- Available on **Sundays only**
- Time slots: **10:00 AM** (morning) or **3:00 PM** (afternoon)
- Demo class is conducted when **10+ students register**
- Register at neramclasses.com/demo-class
- Phone verification required for registration

## REFUND POLICY
- Refund requests accepted **only within 24 hours** of payment
- **30% processing fee** is deducted from all refunds
- Example: Paid ₹25,000 → Maximum refund = ₹17,500
- One refund request per payment
- Approval is at the discretion of administration
- Processing time: 5-10 business days
- For full details: neramclasses.com/refund-policy

## SCHOLARSHIP
- Based on academic performance, financial background, and school type
- Required documents: School ID, Parents' Income Certificate, Parents' Aadhar Card, Mark Sheet (optional)
- Apply after admission application
- Review time: 3-5 business days
- Details: neramclasses.com/scholarship

## NATA 2026 EXAM (Key Facts)
- Conducted by Council of Architecture (CoA)
- Two phases: Phase 1 (April 4 – June 13, 2026), Phase 2 (August 7-8, 2026)
- Pattern: Part A (Drawing, 80 marks, offline) + Part B (MCQ/NCQ, 120 marks, online) = 200 marks, 3 hours
- No negative marking
- Eligibility: 10+2 with Physics + Mathematics, minimum 45% for admission
- NATA exam fee: General ₹1,750, SC/ST/EWS/PwD ₹1,250
- Registration: www.nata.in
- For detailed NATA info, visit neramclasses.com/nata-2026

## INSTRUCTIONS
- Be warm, friendly, and conversational — like chatting with a helpful mentor
- Keep answers concise (2-4 paragraphs max)
- Use **bold** for key info (fees, dates, phone numbers)
- When asked about fees, ALWAYS use the EXACT fee structure above — never approximate or guess
- When asked about timings/modes, recommend online classes for consistency
- For questions you don't know the answer to, say: "I'm not sure about that. Please contact us at **+91 91761 37043** or **info@neramclasses.com** for accurate information."
- NEVER fabricate information or make up details
- When relevant, naturally mention free tools at app.neramclasses.com
- If the user seems interested in joining, suggest visiting neramclasses.com/apply or booking a demo class
- End responses with a brief follow-up question or helpful suggestion when appropriate
- IMPORTANT: Always complete your answer. If a topic needs a long explanation, summarize the key points concisely rather than giving an incomplete detailed answer. Never end mid-sentence.`;

// ============================================
// AINTRA KNOWLEDGE BASE CACHE
// ============================================

let kbCache: { text: string; fetchedAt: number } | null = null;
const KB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getKBSection(): Promise<string> {
  const now = Date.now();
  if (kbCache && now - kbCache.fetchedAt < KB_CACHE_TTL_MS) return kbCache.text;

  try {
    const items = await getActiveAintraKnowledgeBase();
    if (!items.length) {
      kbCache = { text: '', fetchedAt: now };
      return '';
    }

    const grouped: Record<string, { question: string; answer: string }[]> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push({ question: item.question, answer: item.answer });
    }

    const lines: string[] = ['\n\n## ADDITIONAL KNOWLEDGE BASE (Admin-Managed)'];
    for (const [cat, catItems] of Object.entries(grouped)) {
      lines.push(`\n### ${cat}`);
      for (const { question, answer } of catItems) {
        lines.push(`Q: ${question}\nA: ${answer}`);
      }
    }

    const text = lines.join('\n');
    kbCache = { text, fetchedAt: now };
    return text;
  } catch (err) {
    console.error('[GeneralChat] Failed to load KB:', err);
    kbCache = { text: '', fetchedAt: now };
    return '';
  }
}

async function callGemini(
  model: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemPrompt: string
): Promise<{ reply: string; model: string; finishReason: string } | null> {
  try {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 4096,
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
      const errorText = await response.text().catch(() => 'unknown');
      console.error(`[GeneralChat] Gemini ${model} error: ${status}`, errorText);
      return null;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const reply = candidate?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error(`[GeneralChat] Gemini ${model}: no reply in response`, JSON.stringify(data).slice(0, 200));
      return null;
    }

    const finishReason: string = candidate?.finishReason || 'UNKNOWN';
    let finalReply = reply;

    if (finishReason === 'MAX_TOKENS') {
      console.warn(`[GeneralChat] Gemini ${model}: response truncated (MAX_TOKENS)`);
      finalReply = reply.trimEnd() +
        '\n\n*For more details, please contact us at **+91 91761 37043** or visit **neramclasses.com**.*';
    }

    return { reply: finalReply, model, finishReason };
  } catch (err) {
    console.error(`[GeneralChat] Gemini ${model} fetch error:`, err);
    return null;
  }
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
      source: 'general_chatbot',
    });
  } catch (err) {
    console.error('Failed to log chatbot conversation:', err);
  }
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    console.error('[GeneralChat] GEMINI_API_KEY is not set');
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

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
    for (const turn of recentHistory) {
      if (turn.role === 'user' || turn.role === 'model') {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const startTime = Date.now();

    // Build effective system prompt with admin-managed KB
    const kbSection = await getKBSection();
    const effectivePrompt = SYSTEM_PROMPT + kbSection;

    let result: { reply: string; model: string; finishReason: string } | null = null;

    // First pass: try all models
    for (const model of GEMINI_MODELS) {
      result = await callGemini(model, contents, effectivePrompt);
      if (result) break;
    }

    // Retry once with a short delay if rate-limited (429 is common on free tier)
    if (!result) {
      await new Promise((r) => setTimeout(r, 2000));
      for (const model of GEMINI_MODELS) {
        result = await callGemini(model, contents, effectivePrompt);
        if (result) break;
      }
    }

    const responseTimeMs = Date.now() - startTime;

    if (!result) {
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

    logConversation({
      sessionId: sessionId || 'unknown',
      userMessage: message.trim(),
      aiResponse: result.reply,
      userId,
      pageUrl,
      modelUsed: result.model,
      responseTimeMs,
      error: result.finishReason === 'MAX_TOKENS' ? 'TRUNCATED_MAX_TOKENS' : undefined,
    });

    return NextResponse.json({ reply: result.reply, model: result.model, finishReason: result.finishReason });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

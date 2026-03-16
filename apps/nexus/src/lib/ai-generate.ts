/**
 * AI-powered section & question generator using Google Gemini Flash
 * Analyzes video transcripts and generates logical sections with MCQ questions
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TranscriptEntry } from '@neram/database';

export interface GeneratedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}

export interface GeneratedSection {
  title: string;
  description: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  questions: GeneratedQuestion[];
}

export interface GeneratedContent {
  sections: GeneratedSection[];
}

const SYSTEM_INSTRUCTION = `You are an expert educational content specialist who creates structured learning content from video lecture transcripts. Your task is to analyze a transcript and create logical sections with quiz questions.

Rules:
1. Identify 3-8 logical topic sections based on content transitions in the transcript.
2. Each section should cover a distinct topic or subtopic discussed in the video.
3. Section timestamps MUST align with actual transcript entry timestamps — use the start time of the first relevant entry as start_timestamp_seconds and the end time of the last relevant entry as end_timestamp_seconds.
4. Create 2-4 MCQ questions per section that test understanding of the content covered in that section.
5. Questions should test comprehension, not just recall. Include a mix of conceptual and factual questions.
6. Each question must have exactly 4 options (a, b, c, d) with exactly one correct answer.
7. Provide a brief explanation for each correct answer.
8. Section titles should be concise and descriptive (3-8 words).
9. Section descriptions should be 1-2 sentences summarizing what the section covers.
10. Ensure timestamps don't overlap between sections and cover the full video duration.`;

function buildPrompt(transcript: TranscriptEntry[], itemTitle: string): string {
  // Format transcript entries with timestamps
  const transcriptText = transcript
    .map((e) => {
      const mm = Math.floor(e.start / 60);
      const ss = Math.floor(e.start % 60);
      return `[${mm}:${ss.toString().padStart(2, '0')}] ${e.text}`;
    })
    .join('\n');

  return `Video Title: "${itemTitle}"

Transcript (with timestamps):
${transcriptText}

Based on this transcript, generate sections and MCQ questions. Return a JSON object with this exact structure:
{
  "sections": [
    {
      "title": "Section title",
      "description": "Brief description of section content",
      "start_timestamp_seconds": 0,
      "end_timestamp_seconds": 300,
      "questions": [
        {
          "question_text": "The question",
          "option_a": "First option",
          "option_b": "Second option",
          "option_c": "Third option",
          "option_d": "Fourth option",
          "correct_option": "a",
          "explanation": "Why this answer is correct"
        }
      ]
    }
  ]
}`;
}

export async function generateSectionsAndQuestions(
  transcript: TranscriptEntry[],
  itemTitle: string
): Promise<GeneratedContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const prompt = buildPrompt(transcript, itemTitle);
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  const parsed: GeneratedContent = JSON.parse(text);

  // Validate the structure
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('AI returned empty or invalid sections');
  }

  // Validate and sanitize each section
  for (const section of parsed.sections) {
    if (!section.title || section.start_timestamp_seconds == null || section.end_timestamp_seconds == null) {
      throw new Error('AI returned section with missing required fields');
    }
    if (!section.questions || !Array.isArray(section.questions)) {
      section.questions = [];
    }
    for (const q of section.questions) {
      if (!['a', 'b', 'c', 'd'].includes(q.correct_option)) {
        q.correct_option = 'a';
      }
    }
  }

  // Sort sections by start timestamp
  parsed.sections.sort((a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds);

  return parsed;
}

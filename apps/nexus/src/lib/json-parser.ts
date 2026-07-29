import { validateAndConvertJSON, type ValidationResult } from './bulk-upload-schema';

/**
 * Pull a JSON object out of whatever an outside chatbot pasted back.
 *
 * Chatbots wrap their answer: a ```json fence, a "Here you go:" preamble, a
 * closing sentence. Every copy-prompt/paste-JSON flow in the app has to cope
 * with that, so the extraction lives here rather than being written out again
 * per feature. Returns null when nothing parses.
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  let jsonText = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    jsonText = fence[1].trim();
  } else {
    const first = jsonText.indexOf('{');
    const last = jsonText.lastIndexOf('}');
    if (first >= 0 && last > first) jsonText = jsonText.slice(first, last + 1);
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/**
 * Parse a JSON string (from file upload or paste) and validate against the bulk upload schema.
 */
export function parseUploadedJSON(jsonString: string): ValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {
      valid: false,
      errors: ['Invalid JSON format. Make sure the file contains valid JSON.'],
      warnings: [],
      questions: [],
    };
  }

  return validateAndConvertJSON(parsed);
}

/**
 * Read a File object and parse its JSON contents.
 */
export async function parseJSONFile(file: File): Promise<ValidationResult> {
  if (!file.name.endsWith('.json')) {
    return {
      valid: false,
      errors: ['Please upload a .json file'],
      warnings: [],
      questions: [],
    };
  }

  if (file.size > 50 * 1024 * 1024) {
    return {
      valid: false,
      errors: ['File is too large (max 50 MB)'],
      warnings: [],
      questions: [],
    };
  }

  const text = await file.text();
  return parseUploadedJSON(text);
}

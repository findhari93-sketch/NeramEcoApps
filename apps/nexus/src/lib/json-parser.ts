import { validateAndConvertJSON, type ValidationResult } from './bulk-upload-schema';

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

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

const KNOWN_LABELS: Record<string, string> = {
  student_name: 'Student Name',
  class: 'Class (11th/12th/Dropper)',
  exam: 'Exam (NATA/JEE/Both)',
  fee: 'Fee Amount',
  installment_fee: 'Installment Amount',
  program: 'Program (1-year/2-year)',
  batch: 'Batch',
  parent_name: 'Parent Name',
  date: 'Date',
};

export function extractPlaceholders(body: string): string[] {
  const matches = [...body.matchAll(PLACEHOLDER_REGEX)];
  return [...new Set(matches.map((m) => m[1]))];
}

export function replacePlaceholders(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(PLACEHOLDER_REGEX, (match, key) => {
    return values[key]?.trim() || match;
  });
}

export function placeholderToLabel(key: string): string {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasUnfilledPlaceholders(
  body: string,
  values: Record<string, string>
): boolean {
  const placeholders = extractPlaceholders(body);
  return placeholders.some((p) => !values[p]?.trim());
}

/**
 * Where a follow-up came from, in words, for the Follow-ups card.
 * query_type is set by the form that created the row; source by the route.
 */

const KIND_LABELS: Record<string, string> = {
  post_demo: 'After demo',
  demo_rebook: 'Rebook demo',
  aintra_chat: 'Callback',
  b_arch_counselling: 'B.Arch counselling',
  keam_arch_counselling: 'KEAM counselling',
  application_help: 'Help with the application',
};

/** The request line: "After demo", "B.Arch counselling", "Callback". */
export function followUpKindLabel(queryType: string | null | undefined): string {
  if (!queryType) return 'Callback';
  return KIND_LABELS[queryType] ?? humanize(queryType);
}

/** "From: ..." line. Null when there is nothing useful to say. */
export function followUpSourceLabel(row: { query_type?: string | null; source?: string | null; assigned_by_staff?: boolean }): string | null {
  const q = row.query_type || '';
  if (q === 'post_demo' || q === 'demo_rebook') return 'Demo class desk';
  if (row.source === 'aintra' || q === 'aintra_chat') return 'Aintra chat';
  if (q.endsWith('_counselling')) return 'Counselling page form';
  if (q === 'application_help') return 'Apply chat';
  if (row.source === 'website_form' || row.source === 'website') return 'Website form';
  if (row.assigned_by_staff) return 'Scheduled by staff';
  if (row.source) return humanize(row.source);
  return null;
}

/** Exam chip text: "2027 exam", or "2027 exam (est.)" when only guessed from the sign-up date. */
export function examYearLabel(examYear: number | null | undefined, source: string | null | undefined): string | null {
  if (!examYear) return null;
  return source === 'signup' ? `${examYear} exam (est.)` : `${examYear} exam`;
}

/** The chat session id an Aintra callback carries in its notes ("Aintra chat: <id>"). */
export function aintraSessionFromNotes(notes: string | null | undefined): string | null {
  const m = notes?.match(/Aintra chat: ([\w-]{6,80})/);
  return m ? m[1] : null;
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

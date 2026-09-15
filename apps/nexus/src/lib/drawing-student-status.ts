/**
 * How a drawing's status reads to the student who drew it. One table, used by
 * the assignment panel, the workspace and its attempt switcher.
 */
export const STATUS_META: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted, awaiting review', color: '#1565C0' },
  under_review: { label: 'Under review', color: '#1565C0' },
  redo: { label: 'Redo requested', color: '#B54700' },
  completed: { label: 'Reviewed', color: '#2E7D32' },
  reviewed: { label: 'Reviewed', color: '#2E7D32' },
};

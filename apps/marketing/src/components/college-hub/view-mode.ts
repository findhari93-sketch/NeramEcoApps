export type ViewMode = 'detailed' | 'grid' | 'list';

export function parseViewMode(raw: string | undefined): ViewMode {
  if (raw === 'grid' || raw === 'list') return raw;
  return 'detailed';
}

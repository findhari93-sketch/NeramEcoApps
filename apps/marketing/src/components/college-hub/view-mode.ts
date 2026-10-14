export type ViewMode = 'list' | 'grid' | 'table';

/** List is the default; old ?view=detailed links land on it too. */
export function parseViewMode(raw: string | undefined): ViewMode {
  if (raw === 'grid' || raw === 'table') return raw;
  return 'list';
}

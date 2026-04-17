'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Stack, Chip, Button } from '@mui/material';

const PARAM_LABELS: Record<string, (v: string) => string> = {
  coa: () => 'COA Approved',
  type: (v) => v,
  exam: (v) => v === 'JEE_PAPER_2' ? 'JEE Paper 2' : v,
  naac: (v) => `NAAC ${v}`,
  city: (v) => v.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  minFee: (v) => `Min ₹${Number(v) >= 100000 ? `${(Number(v) / 100000).toFixed(0)}L` : `${(Number(v) / 1000).toFixed(0)}K`}`,
  maxFee: (v) => `Max ₹${Number(v) >= 100000 ? `${(Number(v) / 100000).toFixed(0)}L` : `${(Number(v) / 1000).toFixed(0)}K`}`,
  q: (v) => `"${v}"`,
  rating: (v) => `${v}★+`,
};

const FILTER_PARAMS = ['coa', 'type', 'exam', 'naac', 'city', 'minFee', 'maxFee', 'q', 'rating'];

export default function ActiveFilterPills({ stateName }: { stateName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilters: { key: string; label: string }[] = [];
  for (const key of FILTER_PARAMS) {
    const val = searchParams.get(key);
    if (val) {
      activeFilters.push({ key, label: PARAM_LABELS[key]?.(val) ?? val });
    }
  }

  if (activeFilters.length === 0 && !stateName) return null;

  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearAll = () => {
    router.push(pathname);
  };

  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.5 }}>
      {stateName && (
        <Chip
          label={stateName}
          size="small"
          sx={{ bgcolor: '#eff6ff', color: '#1565C0', borderColor: '#bfdbfe', fontWeight: 500, fontSize: '0.75rem' }}
          variant="outlined"
        />
      )}
      {activeFilters.map((f) => (
        <Chip
          key={f.key}
          label={f.label}
          size="small"
          onDelete={() => removeFilter(f.key)}
          sx={{ bgcolor: '#eff6ff', color: '#1565C0', borderColor: '#bfdbfe', fontWeight: 500, fontSize: '0.75rem' }}
          variant="outlined"
        />
      ))}
      {activeFilters.length >= 2 && (
        <Button size="small" onClick={clearAll} sx={{ fontSize: '0.7rem', textTransform: 'none', ml: 0.5 }}>
          Clear all
        </Button>
      )}
    </Stack>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MegaMenuPanel, { type NavAside, type NavColumn, type NavFooter } from '@/components/nav/MegaMenuPanel';

interface Props {
  columns: NavColumn[];
  aside?: NavAside;
  footer?: NavFooter;
  pathname: string;
  onNavigate: () => void;
}

/** Desktop Colleges menu (canvas: Desktop · Colleges menu): the shared panel plus a college search. */
export default function CollegesMegaMenu({ columns, aside, footer, pathname, onNavigate }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const search = (
    <Box
      component="form"
      role="search"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        const term = q.trim();
        onNavigate();
        router.push(term ? `/colleges?q=${encodeURIComponent(term)}#browse` : '/colleges#browse');
      }}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', px: 3.5, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', gap: 1.25, height: 46, px: 1.75, boxSizing: 'border-box', border: '1.5px solid', borderColor: 'grey.400', borderRadius: 2, color: 'text.secondary', '&:focus-within': { borderColor: 'primary.main' } }}>
        <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
        <Box component="label" htmlFor="mega-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          Search colleges
        </Box>
        <Box
          component="input"
          id="mega-q"
          type="search"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          placeholder="Search a college or city"
          sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: 'text.primary', bgcolor: 'transparent' }}
        />
      </Box>
      <Typography sx={{ m: 0, fontSize: '0.9rem', color: 'text.secondary' }}>Or browse by one of these</Typography>
    </Box>
  );

  return (
    <MegaMenuPanel
      label="Colleges"
      top={search}
      columns={columns}
      aside={aside}
      footer={footer}
      pathname={pathname}
      onNavigate={onNavigate}
    />
  );
}

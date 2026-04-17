'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface CollegeSearchProps {
  defaultValue?: string;
  placeholder?: string;
}

export default function CollegeSearch({
  defaultValue = '',
  placeholder = 'Search colleges...',
}: CollegeSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue.trim()) {
        params.set('q', newValue.trim());
      } else {
        params.delete('q');
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
  };

  return (
    <TextField
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      fullWidth
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          </InputAdornment>
        ),
        sx: { borderRadius: 2.5, fontSize: '0.875rem' },
      }}
    />
  );
}

'use client';

import { Pagination } from '@mui/material';
import { useRouter, usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

interface ClientPaginationProps {
  totalPages: number;
  currentPage: number;
}

export default function ClientPagination({ totalPages, currentPage }: ClientPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (_: React.ChangeEvent<unknown>, page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', page.toString());
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Pagination
      count={totalPages}
      page={currentPage}
      color="primary"
      shape="rounded"
      onChange={handleChange}
    />
  );
}

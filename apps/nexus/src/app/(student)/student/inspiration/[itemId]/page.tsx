'use client';

import { useParams } from 'next/navigation';
import InspirationItemView from '@/components/inspiration/InspirationItemView';

export default function StudentInspirationItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  return <InspirationItemView mode="student" itemId={itemId} />;
}

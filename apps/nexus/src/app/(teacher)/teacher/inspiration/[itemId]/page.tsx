'use client';

import { useParams } from 'next/navigation';
import InspirationItemView from '@/components/inspiration/InspirationItemView';

export default function TeacherInspirationItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  return <InspirationItemView mode="staff" itemId={itemId} />;
}

import dynamic from 'next/dynamic';
import { common } from '@/lib/common';
import { PaperView } from '@/components/PaperView';
const Heavy = dynamic(() => import('@/components/Heavy'));
export default function PaperPage() { return [common, PaperView, Heavy]; }

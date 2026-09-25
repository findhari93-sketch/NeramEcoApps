import { notFound } from 'next/navigation';

// Any path that matches no route lands here, so its 404 renders inside the
// [locale] layout (header, footer, navigation) through [locale]/not-found.tsx
// instead of the bare root not-found page.
export default function CatchAllNotFound() {
  notFound();
}

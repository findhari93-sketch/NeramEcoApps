import { redirect } from 'next/navigation';

/**
 * The old lead detail page ran on mock data and never fetched. Every person now
 * has one detail screen, User 360 at /crm/[id].
 */
export default function LeadDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/crm/${encodeURIComponent(params.id)}?from=leads`);
}

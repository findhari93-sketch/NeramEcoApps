import { enrolmentLinkUrl } from '@neram/database/enrolment-link';
import { marketingOriginFor } from './marketing-links';

/**
 * What every enrolment-link route returns: the row, its public URL (built for
 * the environment the admin is on) and the name of the staff member who made it.
 */
export interface EnrolmentLinkView {
  [column: string]: unknown;
  id: string;
  token: string;
  url: string;
  created_by_name: string | null;
}

export function linkOrigin(request: Request): string {
  return marketingOriginFor(new URL(request.url).origin, process.env.NEXT_PUBLIC_MARKETING_URL);
}

export async function toLinkView(link: any, request: Request, supabase: any): Promise<EnrolmentLinkView> {
  let createdByName: string | null = null;
  if (link?.created_by) {
    const { data } = await supabase.from('users').select('name').eq('id', link.created_by).maybeSingle();
    createdByName = data?.name ?? null;
  }
  return { ...link, url: enrolmentLinkUrl(link.token, linkOrigin(request)), created_by_name: createdByName };
}

/** A link past its expiry still reads 'active' until the daily sweep; show the truth. */
export function effectiveStatus(link: { status: string; expires_at?: string | null }): string {
  return link.status === 'active' && link.expires_at && new Date(link.expires_at).getTime() < Date.now()
    ? 'expired'
    : link.status;
}

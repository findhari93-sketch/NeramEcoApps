/**
 * The stat chips on the College Outreach page, over every college matching the
 * filters (the table itself is paged). Same rules the page used to apply to its
 * full in-memory list.
 */

export interface OutreachStats {
  total: number;
  neverContacted: number;
  emailed: number;
  engaged: number;
  partner: number;
  needsEmail: number;
  free: number;
  paid: number;
}

export const EMPTY_OUTREACH_STATS: OutreachStats = {
  total: 0,
  neverContacted: 0,
  emailed: 0,
  engaged: 0,
  partner: 0,
  needsEmail: 0,
  free: 0,
  paid: 0,
};

export function summariseOutreach(
  rows: Array<{
    contact_status?: string | null;
    admissions_email?: string | null;
    email?: string | null;
    neram_tier?: string | null;
  }>,
): OutreachStats {
  const acc = { ...EMPTY_OUTREACH_STATS };
  for (const c of rows) {
    acc.total++;
    if (c.contact_status === 'never_contacted' || !c.contact_status) acc.neverContacted++;
    if (c.contact_status === 'emailed_v1') acc.emailed++;
    if (c.contact_status === 'replied' || c.contact_status === 'engaged' || c.contact_status === 'claimed') acc.engaged++;
    if (c.contact_status === 'partner') acc.partner++;
    if (!c.admissions_email && !c.email) acc.needsEmail++;
    if (!c.neram_tier || c.neram_tier === 'free') acc.free++;
    else acc.paid++;
  }
  return acc;
}

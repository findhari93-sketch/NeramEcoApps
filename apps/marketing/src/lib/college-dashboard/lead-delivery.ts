import { sendDashboardEmail, simpleEmail, siteOrigin } from './email';

/**
 * Tells a college's dashboard accounts (owners and editors) that a new
 * enquiry arrived. The email carries no phone number: they open the dashboard
 * to see the student. Colleges without a dashboard account get no email (the
 * lead waits in the dashboard). Never throws.
 */
export async function deliverLeadToCollege(
  db: any,
  opts: {
    leadId: string;
    college: { id: string; name: string };
    student: { name: string; city: string | null; nataScore: number | null };
    origin?: string | null;
  }
): Promise<number> {
  try {
    const { data: people } = await db
      .from('college_admins')
      .select('email, name, role')
      .eq('college_id', opts.college.id)
      .eq('is_active', true)
      .in('role', ['owner', 'editor', 'admin']);
    const link = `${siteOrigin(opts.origin)}/college-dashboard/leads?highlight=${opts.leadId}`;
    const details = [
      opts.student.city ? `from ${opts.student.city}` : null,
      opts.student.nataScore != null ? `NATA score ${opts.student.nataScore}` : null,
    ].filter(Boolean);
    let sent = 0;
    for (const p of (people ?? []) as Array<{ email: string; name: string }>) {
      const res = await sendDashboardEmail(
        p.email,
        `New admission enquiry for ${opts.college.name}`,
        simpleEmail({
          heading: 'A student asked about admission',
          lines: [
            `Hello ${p.name},`,
            `${opts.student.name}${details.length ? ` (${details.join(', ')})` : ''} asked about admission at ${opts.college.name} on Neram Classes and agreed to share their details with you.`,
            'Open your dashboard to see their contact details and mark what happened next.',
          ],
          button: { label: 'Open the enquiry', href: link },
        })
      );
      if (res.sent) sent++;
    }
    return sent;
  } catch (e) {
    console.warn('[lead-delivery]', (e as Error).message);
    return 0;
  }
}

import { describe, it, expect } from 'vitest';
import { buildTicketUpdateEmail, type TicketUpdateKind } from './ticket-email';

const base = {
  to: 'student@example.com',
  name: 'Jay Surya Thangam',
  ticketNumber: 'NERAM-TKT-00001',
  subject: 'Password incorrect',
  ticketUrl: 'https://app.neramclasses.com/support/abc',
};

const KINDS: TicketUpdateKind[] = ['reply', 'info_requested', 'resolved', 'closed', 'auto_closed'];

describe('buildTicketUpdateEmail', () => {
  it('greets by first name and names the ticket', () => {
    const { subject, html } = buildTicketUpdateEmail({ ...base, kind: 'reply' });
    expect(subject).toContain('NERAM-TKT-00001');
    expect(html).toContain('Hi Jay,');
    expect(html).toContain('https://app.neramclasses.com/support/abc');
  });

  it('escapes the staff message', () => {
    const { html } = buildTicketUpdateEmail({ ...base, kind: 'reply', message: '<script>x</script> & more' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; more');
  });

  it('shows "Name from Neram" with the staff first name', () => {
    const { html } = buildTicketUpdateEmail({ ...base, kind: 'reply', message: 'Hi', staffName: 'Hari Babu' });
    expect(html).toContain('Hari from Neram');
  });

  it('falls back to a phone line when there is no ticket link', () => {
    const { html } = buildTicketUpdateEmail({ ...base, kind: 'closed', ticketUrl: null });
    expect(html).not.toContain('<a href');
    expect(html).toContain('NERAM-TKT-00001');
  });

  it('no copy uses em dashes or double dashes', () => {
    for (const kind of KINDS) {
      const { subject, html } = buildTicketUpdateEmail({ ...base, kind, outcomeLabel: 'Fixed', message: 'ok' });
      expect(subject).not.toMatch(/—|--/);
      // Strip the doctype and comments-free markup; check visible text only.
      const text = html.replace(/<[^>]+>/g, ' ');
      expect(text, kind).not.toMatch(/—|\s--\s/);
    }
  });
});

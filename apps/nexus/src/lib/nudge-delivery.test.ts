import { describe, it, expect } from 'vitest';
import { escapeHtml, plainToHtml, plainToHtmlWithLink } from './nudge-delivery';

/**
 * The link is the point of the whole change, so what is pinned here is that it
 * survives as something a student can press.
 *
 * A reminder that names a class and gives no way to reach it is what these
 * emails were, and the failure was silent: plainToHtml escapes everything it is
 * handed, so a URL pasted into the body arrived as inert characters that looked
 * fine in a code review and were unclickable in a mailbox.
 */

const URL = 'https://nexus.neramclasses.com/student/timetable/abc-123/catch-up';

describe('plainToHtmlWithLink', () => {
  it('renders a real anchor at the given URL', () => {
    const html = plainToHtmlWithLink('You missed Monday.', URL, 'Open your catch-up page');
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('Open your catch-up page');
  });

  it('repeats the bare address, for a client that strips the styled anchor', () => {
    const html = plainToHtmlWithLink('You missed Monday.', URL, 'Open');
    // Twice: once in the href, once as copyable text.
    expect(html.split(URL).length - 1).toBe(2);
  });

  it('still escapes the message body', () => {
    const html = plainToHtmlWithLink('<script>alert(1)</script>', URL, 'Open');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the URL too, so a crafted class id cannot break out of the href', () => {
    const html = plainToHtmlWithLink('hi', 'https://x.test/"onmouseover="evil()', 'Open');
    expect(html).not.toContain('onmouseover="evil()"');
    expect(html).toContain('&quot;onmouseover=');
  });

  it('keeps line breaks, the same as the plain shell', () => {
    expect(plainToHtmlWithLink('one\ntwo', URL, 'Open')).toContain('one<br/>two');
    expect(plainToHtml('one\ntwo')).toContain('one<br/>two');
  });
});

describe('escapeHtml', () => {
  it('covers the four characters that matter in an attribute or a body', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

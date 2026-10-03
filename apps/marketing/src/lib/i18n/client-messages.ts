import type { AbstractIntlMessages } from 'next-intl';

/**
 * Which translation messages are serialised into the HTML for client components.
 *
 * NextIntlClientProvider puts every message it is given into the RSC payload of
 * every page. The layout used to pass the whole file (about 57 KB per page, per
 * locale). Now the layout passes only what the site chrome needs, and pages
 * whose client components translate text wrap them in <ClientIntl> with their
 * own list.
 *
 * Entries are namespaces ('header') or a namespace plus a first-level key
 * ('apply.shell'). A nested NextIntlClientProvider REPLACES the outer messages,
 * so a page list must name everything its client subtree uses, including
 * namespaces the layout also passes.
 *
 * src/lib/i18n/client-messages.test.ts fails when a client component uses a
 * namespace its page or the layout does not pass.
 */

/** Header, mobile nav and the apply/pay/enrol shell (rendered by SiteChrome). */
export const LAYOUT_CLIENT_MESSAGES = ['header', 'nav', 'apply.shell'] as const;

type Messages = AbstractIntlMessages;

/** A copy of `messages` holding only the listed namespaces / namespace.key paths. */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  const out: Messages = {};
  for (const path of paths) {
    const [ns, key] = path.split('.', 2);
    const nsValue = messages[ns];
    if (nsValue === undefined) continue;
    if (!key) {
      out[ns] = nsValue;
      continue;
    }
    if (!nsValue || typeof nsValue !== 'object') continue;
    const value = (nsValue as Messages)[key];
    if (value === undefined) continue;
    const existing = out[ns];
    // A whole namespace already picked wins over a single key of it.
    if (existing !== undefined && existing === nsValue) continue;
    out[ns] = { ...((existing as Messages) || {}), [key]: value } as Messages;
  }
  return out;
}

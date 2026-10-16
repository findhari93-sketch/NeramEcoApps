/**
 * Colours the site tokens deliberately leave out: other companies' brand
 * colours, and the one error red. Use these instead of a hex literal in sx.
 * Anything with a role in siteTokens (status, success, gold, navy, ink) must
 * use the token, not a value from here.
 */
export const brandColors = {
  /** WhatsApp buttons and the chat bubble. */
  whatsapp: '#25D366',
  whatsappDark: '#128C7E',
  /** YouTube subscribe and play affordances. */
  youtube: '#FF0000',
} as const;

/** Field errors, destructive actions and the error rail. */
export const errorColor = '#c62828';

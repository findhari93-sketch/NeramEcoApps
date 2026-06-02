import type { CollegeOutreachRow } from './types';

export type OutreachTemplateVariant =
  | 'first_touch_v1' // @deprecated, retained so historical college_outreach_log rows still render
  | 'first_touch_v2'
  | 'content_request_v1'
  | 'partnership_pitch_v1'
  | 'payment_details_v1'
  | 'onboarding_v1';
export type SubjectVariant = 1 | 2 | 3;

interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

type CollegeInput = Pick<
  CollegeOutreachRow,
  | 'name'
  | 'slug'
  | 'state'
  | 'state_slug'
  | 'city'
  | 'established_year'
  | 'naac_grade'
  | 'total_barch_seats'
  | 'annual_fee_approx'
  | 'affiliated_university'
  | 'highlights'
  | 'data_completeness'
>;

interface RenderOpts {
  variant: OutreachTemplateVariant;
  subjectVariant?: SubjectVariant;
  college: CollegeInput;
  senderName: string;
  // Optional deal context, used only by the later-stage templates:
  dealTier?: string; // e.g. "Gold"
  dealAmountInr?: number; // e.g. 75000
  dealTerm?: string; // e.g. "the 2026 admission cycle"
  loginEmail?: string; // onboarding dashboard login
  // One-click unsubscribe URL for this college (built from its unsubscribe_token).
  // Rendered in the compliance footer of every v2-era template; the send route
  // also mirrors it into the List-Unsubscribe header.
  unsubscribeUrl?: string;
}

// ─── Single source of truth for the numbers we quote ──────────────────────────
// Change a value here and it propagates through every template + the plain-text
// and HTML renders. All numbers are verified from Google Search Console
// (last 3 months) and must be defensible on a live call.
export const PROOF = {
  impressions: '315,000', // GSC search impressions, last 3 months
  clicks: '5,400', // GSC clicks (visits from Google search)
  avgPosition: '7.2', // average position => "first page of Google"
  topQueries: ['nata college predictor', 'nata rank predictor'],
  // Confirmed by founder: 2,000+ active students across India. Update in ONE place.
  activeStudents: '2,000+',
};

const SITE_URL = 'https://neramclasses.com';
const COLLEGE_HUB_URL = `${SITE_URL}/colleges`; // the public College Hub landing
const DASHBOARD_URL = `${SITE_URL}/college-dashboard`;
// Sender identity shown in the signature of every v2-era template. `info@` stays
// the generic inbox (used as the BCC archive in the send route); the signature
// shows the direct, professionally-named address.
const SENDER_NAME = 'Ar. Tamilselvan';
const SENDER_TITLE = 'Senior Strategic Manager, Neram Classes';
const SENDER_EMAIL = 'TamilSelvan@neramclasses.com';

// Physical postal address shown in the compliance footer of every outreach email.
// A real mailing address is required for cold bulk email (CAN-SPAM and a big
// signal for Gmail/Outlook spam scoring).
const SENDER_POSTAL_ADDRESS =
  'Neram Classes, Bharathi Park, 10/38, 5th Cross Rd, Saibaba Colony, Coimbatore, Tamil Nadu 641011';

// What a partnership adds on top of the free listing (used in the pitch email).
// `state` is the college's state name so the regional-guide benefit reads naturally.
function partnershipBenefits(state: string): string[] {
  return [
    "Priority placement in your region's college search results",
    'Direct, opt-in student enquiries routed to your admissions team',
    `A feature in our "Top architecture colleges in ${state}" guide, optimised for Google and for AI answers (ChatGPT, Gemini)`,
    'A presenting slot at #AskSeniors, our annual event where aspirants meet current students',
  ];
}

// Tier reference (names + one-line value). Pricing is per-deal and lives in the
// payment email, not here. Kept as the single source for tier naming.
export const TIERS = {
  free: { name: 'Free', summary: 'A permanent free listing with a backlink to your official website.' },
  silver: { name: 'Silver', summary: 'Free listing plus priority placement during the admission window.' },
  gold: { name: 'Gold', summary: 'Silver plus direct student enquiries and a regional guide feature.' },
  platinum: { name: 'Platinum', summary: 'Gold plus an #AskSeniors presenting slot and full profile management.' },
} as const;

// Bank details for the payment email. Fill these in before any payment_details
// send (left blank on purpose so a half-finished email is obvious in preview).
const BANK = {
  accountName: '',
  accountNumber: '',
  ifsc: '',
  bankName: '',
  upi: '',
};

// Email-safe color tokens (Trust & Authority palette: navy ink, professional blue CTA)
const C = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  cta: '#0369a1',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  hair: '#e8eef5',
  page: '#eef2f7',
  link: '#0369a1',
};

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function getCollegePageUrl(college: Pick<CollegeOutreachRow, 'state_slug' | 'slug'>): string {
  const state = college.state_slug ?? 'india';
  return `${SITE_URL}/en/colleges/${state}/${college.slug}`;
}

// Public one-click unsubscribe link for a college, keyed by its unsubscribe_token.
// Resolved by the marketing app at neramclasses.com/unsubscribe. Falls back to the
// tokenless page (manual reply path) when a token is somehow missing.
export function getUnsubscribeUrl(token: string | null | undefined): string {
  const base = `${SITE_URL}/unsubscribe`;
  return token ? `${base}?c=${encodeURIComponent(token)}` : base;
}

function formatFeeInr(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  if (value >= 100000) return `Rs ${(value / 100000).toFixed(1)} Lakh per year`;
  return `Rs ${Math.round(value / 1000)},000 per year`;
}

function buildHighlightsBullets(c: CollegeInput): string[] {
  const stored = (c.highlights ?? []).filter((h): h is string => typeof h === 'string' && h.trim().length > 0);
  if (stored.length >= 2) return stored.slice(0, 5);

  const computed: string[] = [];
  if (c.established_year) computed.push(`Established in ${c.established_year}`);
  if (c.affiliated_university) computed.push(`Affiliated to ${c.affiliated_university}`);
  if (c.naac_grade) computed.push(`NAAC ${c.naac_grade} accredited`);
  if (c.total_barch_seats) computed.push(`${c.total_barch_seats} B.Arch seats (current intake)`);
  const fee = formatFeeInr(c.annual_fee_approx);
  if (fee) computed.push(`Approximate annual fee: ${fee}`);

  if (computed.length >= 2) return computed;
  return ['Basic contact details', 'Location and official website', 'Council of Architecture approval status'];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCompletenessLine(dc: number | null | undefined): string {
  if (typeof dc !== 'number' || dc >= 80) return '';
  return `Your profile is about ${dc}% complete on our side; we would love your help filling the rest.`;
}

function ensureNoUnresolvedTokens(s: string, label: string): void {
  if (s.includes('{{') || s.includes('}}')) {
    throw new Error(`Outreach template ${label} has unresolved tokens`);
  }
}

function ensureNoEmDashes(s: string, label: string): void {
  if (s.includes('—') || s.includes(' -- ') || s.includes('&mdash;')) {
    throw new Error(`Outreach template ${label} contains em dash or double dash`);
  }
}

function finalize(subject: string, html: string, text: string): RenderResult {
  ensureNoUnresolvedTokens(subject, 'subject');
  ensureNoUnresolvedTokens(html, 'html');
  ensureNoUnresolvedTokens(text, 'text');
  ensureNoEmDashes(subject, 'subject');
  ensureNoEmDashes(html, 'html');
  ensureNoEmDashes(text, 'text');
  return { subject, html, text };
}

// ─── Shared HTML building blocks (email-client-safe: tables + inline CSS) ──────

function emailShell(innerHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${C.cardBorder};border-radius:14px">
<tr><td style="padding:30px 32px 34px">
${innerHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Brand wordmark lockup, recreated from the marketing site header in email-safe
// HTML (tables + bgcolor, no images) so it renders even when image loading is
// blocked. "neram" bold + "Classes" light, with the "Supported by Microsoft"
// badge. The whole mark links to the College Hub.
function headerBlock(): string {
  const msSquares = `<table role="presentation" cellpadding="0" cellspacing="1" border="0" style="border-collapse:separate"><tr>
<td width="5" height="5" bgcolor="#F25022" style="width:5px;height:5px;font-size:0;line-height:0">&nbsp;</td>
<td width="5" height="5" bgcolor="#7FBA00" style="width:5px;height:5px;font-size:0;line-height:0">&nbsp;</td>
</tr><tr>
<td width="5" height="5" bgcolor="#00A4EF" style="width:5px;height:5px;font-size:0;line-height:0">&nbsp;</td>
<td width="5" height="5" bgcolor="#FFB900" style="width:5px;height:5px;font-size:0;line-height:0">&nbsp;</td>
</tr></table>`;
  return `<a href="${COLLEGE_HUB_URL}" target="_blank" style="text-decoration:none;color:${C.ink}"><span style="font-family:${FONT_STACK};font-size:23px;line-height:1;color:${C.ink};font-weight:300"><span style="font-weight:700">neram</span>Classes</span></a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:7px 0 0"><tr>
<td valign="middle" style="font-family:${FONT_STACK};font-size:10px;font-style:italic;color:${C.muted};padding-right:5px">Supported by</td>
<td valign="middle" style="padding-right:5px">${msSquares}</td>
<td valign="middle" style="font-family:${FONT_STACK};font-size:11px;font-weight:700;color:${C.ink}">Microsoft</td>
</tr></table>
<div style="height:1px;line-height:1px;font-size:0;background:${C.hair};margin:18px 0 22px">&nbsp;</div>`;
}

function para(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.body}">${html}</p>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
<td align="center" bgcolor="${C.cta}" style="border-radius:8px">
<a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a>
</td></tr></table>`;
}

// `items` are already HTML-safe (callers escape any dynamic text before passing).
function orderedList(items: string[]): string {
  const lis = items.map((i) => `<li style="margin:8px 0">${i}</li>`).join('\n');
  return `<ol style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.6;color:${C.body}">${lis}</ol>`;
}

function bulletList(items: string[]): string {
  const lis = items.map((i) => `<li style="margin:8px 0">${i}</li>`).join('\n');
  return `<ul style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.6;color:${C.body}">${lis}</ul>`;
}

function formatInr(value: number | null | undefined): string {
  if (!value || value <= 0) return '(amount to be confirmed)';
  return `Rs ${value.toLocaleString('en-IN')}`;
}

function statBand(): string {
  const cells = [
    { num: PROOF.impressions, label: 'Google search<br>impressions' },
    { num: PROOF.clicks, label: 'student visits<br>from Google' },
    { num: 'Page 1', label: `of Google<br>(avg position ${PROOF.avgPosition})` },
  ];
  const tds = cells
    .map(
      (c) => `<td width="33.33%" valign="top" style="padding:0 5px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardBg};border:1px solid ${C.cardBorder};border-radius:10px">
<tr><td align="center" style="padding:16px 6px">
<div style="font-size:23px;font-weight:700;line-height:1.1;color:${C.cta}">${c.num}</div>
<div style="font-size:11.5px;line-height:1.45;color:${C.muted};margin-top:6px">${c.label}</div>
</td></tr>
</table>
</td>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>${tds}</tr></table>`;
}

function signatureBlock(): string {
  return `<div style="height:1px;line-height:1px;font-size:0;background:${C.hair};margin:24px 0 18px">&nbsp;</div>
<p style="margin:0;font-size:15px;line-height:1.6;color:${C.body}">Warm regards,</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.55;color:${C.body}">
<strong style="color:${C.ink};font-size:16px">${escapeHtml(SENDER_NAME)}</strong><br>
${escapeHtml(SENDER_TITLE)}<br>
<a href="mailto:${SENDER_EMAIL}" style="color:${C.link};text-decoration:none">${SENDER_EMAIL}</a>&nbsp; | &nbsp;<a href="${SITE_URL}/colleges" target="_blank" style="color:${C.link};text-decoration:none">neramclasses.com/colleges</a>
</p>`;
}

// CAN-SPAM / Gmail-bulk-sender compliance footer: why-received line (opt-in to
// claim the page by replying), a one-click unsubscribe link, and a postal
// address. Appended to every v2-era template after the signature.
function complianceFooter(unsubscribeUrl: string, collegeName: string): string {
  const name = escapeHtml(collegeName);
  const unsub = escapeHtml(unsubscribeUrl);
  return `<div style="height:1px;line-height:1px;font-size:0;background:${C.hair};margin:22px 0 14px">&nbsp;</div>
<p style="margin:0;font-size:11.5px;line-height:1.65;color:${C.muted}">You are receiving this because ${name} is listed in our free public B.Arch college directory at <a href="${COLLEGE_HUB_URL}" target="_blank" style="color:${C.muted};text-decoration:underline">neramclasses.com</a>. To claim or manage your page, just reply to this email.</p>
<p style="margin:9px 0 0;font-size:11.5px;line-height:1.65;color:${C.muted}">Prefer not to hear from us? <a href="${unsub}" target="_blank" style="color:${C.muted};text-decoration:underline">Unsubscribe here</a> and we will not email this address again.</p>
<p style="margin:9px 0 0;font-size:11.5px;line-height:1.55;color:${C.muted}">${escapeHtml(SENDER_POSTAL_ADDRESS)}</p>`;
}

// Plain-text equivalent of the compliance footer.
function complianceFooterText(unsubscribeUrl: string, collegeName: string): string[] {
  return [
    '',
    '----',
    `You are receiving this because ${collegeName} is listed in our free public B.Arch college directory at neramclasses.com. To claim or manage your page, just reply to this email.`,
    `Prefer not to hear from us? Unsubscribe: ${unsubscribeUrl}`,
    SENDER_POSTAL_ADDRESS,
  ];
}

// ─── first_touch_v2: the beautiful founder letter (one ask + stat band) ───────

function subjectForV2(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return `Students are researching ${name} on our platform, a quick check`;
    case 3:
      return `We built a profile for ${name}, please take a look`;
    case 1:
    default:
      return `${name} now has a page on Neram College Hub, is the info correct?`;
  }
}

// Deliberately plain and personal: no logo lockup, stat band, or button, so Gmail
// reads this cold first-touch as a 1:1 message and files it under Primary rather
// than Promotions. The designed blocks (headerBlock/statBand/ctaButton) are kept
// for the warmer follow-up templates, where the recipient already expects us.
function renderFirstTouchV2(
  college: CollegeInput,
  subjectVariant: SubjectVariant,
  unsubscribeUrl: string,
): RenderResult {
  const collegeName = college.name;
  const url = getCollegePageUrl(college);
  const subject = subjectForV2(subjectVariant, collegeName);

  const name = escapeHtml(collegeName);
  const safeUrl = escapeHtml(url);
  const safeUnsub = escapeHtml(unsubscribeUrl);
  const topQ = PROOF.topQueries[0];

  const text = [
    'Dear Admissions Team,',
    '',
    `We run neramClasses.com, India's first architecture college hub, where B.Arch aspirants research and compare colleges before they apply. ${collegeName} now has a page there, and I wanted to check the details with you.`,
    '',
    `Your page: ${url}`,
    '',
    `Over the last three months that page reached ${PROOF.impressions} Google search impressions and ${PROOF.clicks} student visits, ranking on the first page of Google (average position ${PROOF.avgPosition}) for searches like "${topQ}".`,
    '',
    'We built it from publicly available information, so a few details may be approximate. Could you take a quick look and let me know one thing: is the basic information accurate? That is the only ask in this email.',
    '',
    'If you would like to manage the page yourself, edit details, see how many students viewed it, and receive enquiries from interested students, just reply and we will set up a login for you.',
    '',
    'Warm regards,',
    SENDER_NAME,
    SENDER_TITLE,
    SENDER_EMAIL,
    '',
    `You are receiving this because ${collegeName} is listed in our public architecture college directory at neramclasses.com.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    SENDER_POSTAL_ADDRESS,
  ].join('\n');

  const link = (href: string, label: string): string =>
    `<a href="${href}" target="_blank" style="color:${C.link};text-decoration:underline">${label}</a>`;
  const p = (innerHtml: string): string => `<p style="margin:0 0 14px">${innerHtml}</p>`;

  const body = `${p('Dear Admissions Team,')}
${p(`We run ${link(COLLEGE_HUB_URL, 'neramClasses.com')}, India's first architecture college hub, where B.Arch aspirants research and compare colleges before they apply. ${name} now has a page there, and I wanted to check the details with you.`)}
${p(`Your page: ${link(safeUrl, safeUrl)}`)}
${p(`Over the last three months that page reached ${PROOF.impressions} Google search impressions and ${PROOF.clicks} student visits, ranking on the first page of Google (average position ${PROOF.avgPosition}) for searches like "${escapeHtml(topQ)}".`)}
${p('We built it from publicly available information, so a few details may be approximate. Could you take a quick look and let me know one thing: is the basic information accurate? That is the only ask in this email.')}
${p('If you would like to manage the page yourself, edit details, see how many students viewed it, and receive enquiries from interested students, just reply and we will set up a login for you.')}
${p(`Warm regards,<br>${escapeHtml(SENDER_NAME)}<br>${escapeHtml(SENDER_TITLE)}<br>${link('mailto:' + SENDER_EMAIL, SENDER_EMAIL)}`)}
<p style="margin:22px 0 0;font-size:11.5px;line-height:1.5;color:#999999">You are receiving this because ${name} is listed in our public architecture college directory at neramclasses.com. To stop receiving these emails, ${link(safeUnsub, 'unsubscribe')}.<br>${escapeHtml(SENDER_POSTAL_ADDRESS)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:560px;margin:0 auto;padding:18px 20px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#1a1a1a">
${body}
</div>
</body>
</html>`;

  return finalize(subject, html, text);
}

// ─── content_request_v1: sent after a college replies / claims ────────────────

function subjectForContentRequest(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return `A few things that would make ${name}'s page stand out`;
    case 3:
      return `${name}: a quick content checklist for your page`;
    case 1:
    default:
      return `Thank you, here is how we can make ${name}'s page shine`;
  }
}

function renderContentRequestV1(
  college: CollegeInput,
  subjectVariant: SubjectVariant,
  unsubscribeUrl: string,
): RenderResult {
  const subject = subjectForContentRequest(subjectVariant, college.name);
  const name = escapeHtml(college.name);
  const url = getCollegePageUrl(college);
  const safeUrl = escapeHtml(url);
  const items = [
    'Confirm the fee structure, seat intake, and NAAC grade are accurate.',
    'Your latest brochure (we will make it downloadable on your page).',
    'Three to five campus photos (studios, workshops, hostels).',
    'Recent placement highlights, if available.',
    'A short note from one or two current students.',
    'Recent counselling or cutoff details, if you have them.',
  ];

  const text = [
    `Dear ${college.name} Admissions Team,`,
    '',
    `Thank you for getting back to us. Here is the page we have built for ${college.name}:`,
    '',
    url,
    '',
    `To present it at its best to the students researching the 2026 cycle, could you share any of the following when convenient:`,
    '',
    ...items.map((it, i) => `${i + 1}. ${it}`),
    '',
    'Even two or three of these make a noticeable difference to how students engage with your page. Send whatever is easy, and we will handle the formatting.',
    '',
    'Warm regards,',
    SENDER_NAME,
    SENDER_TITLE,
    `${SENDER_EMAIL} | neramclasses.com/colleges`,
    ...complianceFooterText(unsubscribeUrl, college.name),
  ].join('\n');

  const inner = `${headerBlock()}
${para(`Dear ${name} Admissions Team,`)}
${para(`Thank you for getting back to us. Here is the page we have built for ${name}:`)}
${ctaButton(safeUrl, 'View your college page &rarr;')}
${para('To present it at its best to the students researching the 2026 cycle, could you share any of the following when convenient:')}
${orderedList(items.map(escapeHtml))}
${para('Even two or three of these make a noticeable difference to how students engage with your page. Send whatever is easy, and we will handle the formatting.')}
${signatureBlock()}
${complianceFooter(unsubscribeUrl, college.name)}`;

  return finalize(subject, emailShell(inner, subject), text);
}

// ─── partnership_pitch_v1: the proof + tiers, for warm colleges only ──────────

function subjectForPitch(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return 'Partnering with Neram for the 2026 admission window';
    case 3:
      return `${name}: priority reach and direct student enquiries`;
    case 1:
    default:
      return `The reach behind ${name}'s page, and how to grow it`;
  }
}

function renderPartnershipPitchV1(
  college: CollegeInput,
  subjectVariant: SubjectVariant,
  unsubscribeUrl: string,
): RenderResult {
  const subject = subjectForPitch(subjectVariant, college.name);
  const name = escapeHtml(college.name);
  const url = getCollegePageUrl(college);
  const safeUrl = escapeHtml(url);
  const stateName = college.state || 'your state';
  const benefits = partnershipBenefits(stateName);
  const topQText = PROOF.topQueries.map((q) => `"${q}"`).join(' and ');
  const topQHtml = PROOF.topQueries.map((q) => `"${escapeHtml(q)}"`).join(' and ');

  const text = [
    `Dear ${college.name} Admissions Team,`,
    '',
    'Thank you for engaging with your page on Neram College Hub. Here is a snapshot of the reach behind it.',
    '',
    `Your page: ${url}`,
    '',
    `- ${PROOF.impressions} Google search impressions in the last 3 months`,
    `- ${PROOF.clicks} student visits from Google`,
    `- First page of Google, average position ${PROOF.avgPosition}, and growing month over month`,
    '',
    `Among the top searches on our platform are ${topQText}, students who are actively deciding where to apply.`,
    '',
    'Every college has a free listing. Colleges that want stronger reach during the admission window can opt into a partnership, which adds:',
    '',
    ...benefits.map((b) => `- ${b}`),
    '',
    'The #AskSeniors slot is the one thing a pure search listing cannot offer.',
    '',
    'If this is useful, I would be glad to walk your team through it on a short call. What time suits you this week?',
    '',
    'Warm regards,',
    SENDER_NAME,
    SENDER_TITLE,
    `${SENDER_EMAIL} | neramclasses.com/colleges`,
    ...complianceFooterText(unsubscribeUrl, college.name),
  ].join('\n');

  const inner = `${headerBlock()}
${para(`Dear ${name} Admissions Team,`)}
${para('Thank you for engaging with your page on Neram College Hub. Here is a snapshot of the reach behind it.')}
${ctaButton(safeUrl, 'View your college page &rarr;')}
${statBand()}
${para(`We rank on the first page of Google (average position ${PROOF.avgPosition}) for these searches, and traffic is growing month over month. Among the top searches on our platform are ${topQHtml}, students who are actively deciding where to apply.`)}
${para('Every college has a free listing. Colleges that want stronger reach during the admission window can opt into a partnership, which adds:')}
${bulletList(benefits.map(escapeHtml))}
${para('The #AskSeniors slot is the one thing a pure search listing cannot offer.')}
${para('If this is useful, I would be glad to walk your team through it on a short call. What time suits you this week?')}
${signatureBlock()}
${complianceFooter(unsubscribeUrl, college.name)}`;

  return finalize(subject, emailShell(inner, subject), text);
}

// ─── payment_details_v1: only after a verbal yes on the call ──────────────────

function subjectForPayment(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return `Confirming your Neram partnership for ${name}`;
    case 3:
      return `${name}: invoice and account details`;
    case 1:
    default:
      return `${name} and Neram: partnership details and next step`;
  }
}

function renderPaymentDetailsV1(
  college: CollegeInput,
  subjectVariant: SubjectVariant,
  opts: RenderOpts,
  unsubscribeUrl: string,
): RenderResult {
  const subject = subjectForPayment(subjectVariant, college.name);
  const name = escapeHtml(college.name);
  const url = getCollegePageUrl(college);
  const safeUrl = escapeHtml(url);
  const tier = opts.dealTier || '(tier to be confirmed)';
  const amount = formatInr(opts.dealAmountInr);
  const term = opts.dealTerm || 'the agreed term';
  const bankVal = (v: string): string => (v && v.trim() ? v.trim() : '(to be added)');
  const bankRows: Array<[string, string]> = [
    ['Account name', BANK.accountName],
    ['Account number', BANK.accountNumber],
    ['IFSC', BANK.ifsc],
    ['Bank', BANK.bankName],
    ['UPI', BANK.upi],
  ];

  const text = [
    `Dear ${college.name} Admissions Team,`,
    '',
    `Thank you for the call and for choosing to partner with Neram Classes. As agreed, here are the details to confirm the ${tier} partnership for ${term}.`,
    '',
    'This is a service fee for your enhanced profile, priority reach, and opt-in student enquiries. We will raise a formal invoice against this payment. It is a commercial service, not a donation.',
    '',
    `Amount: ${amount}`,
    `Tier: ${tier}`,
    `Term: ${term}`,
    '',
    'Account details for the transfer:',
    ...bankRows.map(([k, v]) => `${k}: ${bankVal(v)}`),
    '',
    `The page we will upgrade once payment is confirmed: ${url}`,
    '',
    'Once you initiate the transfer, reply with the reference number and your GST details, and we will send the invoice and begin upgrading your page the same day.',
    '',
    'Warm regards,',
    SENDER_NAME,
    SENDER_TITLE,
    `${SENDER_EMAIL} | neramclasses.com/colleges`,
    ...complianceFooterText(unsubscribeUrl, college.name),
  ].join('\n');

  const dealHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${C.cardBg};border:1px solid ${C.cardBorder};border-radius:10px">
<tr><td style="padding:16px 18px;font-size:15px;line-height:1.75;color:${C.body}">
<strong style="color:${C.ink}">Amount:</strong> ${escapeHtml(amount)}<br>
<strong style="color:${C.ink}">Tier:</strong> ${escapeHtml(tier)}<br>
<strong style="color:${C.ink}">Term:</strong> ${escapeHtml(term)}
</td></tr></table>`;

  const bankHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#ffffff;border:1px solid ${C.cardBorder};border-radius:10px">
<tr><td style="padding:16px 18px;font-size:14px;line-height:1.85;color:${C.body}">
${bankRows.map(([k, v]) => `<strong style="color:${C.ink}">${escapeHtml(k)}:</strong> ${escapeHtml(bankVal(v))}`).join('<br>')}
</td></tr></table>`;

  const inner = `${headerBlock()}
${para(`Dear ${name} Admissions Team,`)}
${para(`Thank you for the call and for choosing to partner with Neram Classes. As agreed, here are the details to confirm the <strong style="color:${C.ink}">${escapeHtml(tier)}</strong> partnership for ${escapeHtml(term)}.`)}
${para('This is a service fee for your enhanced profile, priority reach, and opt-in student enquiries. We will raise a formal invoice against this payment. It is a commercial service, not a donation.')}
${dealHtml}
${para('Account details for the transfer:')}
${bankHtml}
${para('Here is the page we will upgrade as soon as payment is confirmed:')}
${ctaButton(safeUrl, 'View your college page &rarr;')}
${para('Once you initiate the transfer, reply with the reference number and your GST details, and we will send the invoice and begin upgrading your page the same day.')}
${signatureBlock()}
${complianceFooter(unsubscribeUrl, college.name)}`;

  return finalize(subject, emailShell(inner, subject), text);
}

// ─── onboarding_v1: partnership live ──────────────────────────────────────────

function subjectForOnboarding(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return `Welcome aboard, ${name}'s partner page is live`;
    case 3:
      return `${name}: your page is live and your login is ready`;
    case 1:
    default:
      return `${name}'s upgraded page is live on Neram College Hub`;
  }
}

function renderOnboardingV1(
  college: CollegeInput,
  subjectVariant: SubjectVariant,
  opts: RenderOpts,
  unsubscribeUrl: string,
): RenderResult {
  const subject = subjectForOnboarding(subjectVariant, college.name);
  const name = escapeHtml(college.name);
  const url = getCollegePageUrl(college);
  const safeUrl = escapeHtml(url);
  const loginEmail = opts.loginEmail && opts.loginEmail.trim() ? opts.loginEmail.trim() : 'your registered email';
  const stateName = college.state || 'your region';
  const doneItems = [
    `Priority placement in ${stateName} results`,
    'Direct student enquiries routed to your admissions inbox',
    'Your brochure and photos featured on the page',
  ];

  const text = [
    `Dear ${college.name} Admissions Team,`,
    '',
    `Your partnership is now live. ${college.name}'s page on Neram College Hub has been upgraded, and it is already visible to students researching the 2026 cycle.`,
    '',
    url,
    '',
    'What is done:',
    ...doneItems.map((d) => `- ${d}`),
    '',
    `Your dashboard login: sign in at ${DASHBOARD_URL} using ${loginEmail}. From there you can edit details, see how many students viewed your page, and respond to enquiries.`,
    '',
    'If anything needs a change, just reply and we will take care of it.',
    '',
    'Warm regards,',
    SENDER_NAME,
    SENDER_TITLE,
    `${SENDER_EMAIL} | neramclasses.com/colleges`,
    ...complianceFooterText(unsubscribeUrl, college.name),
  ].join('\n');

  const inner = `${headerBlock()}
${para(`Dear ${name} Admissions Team,`)}
${para(`Your partnership is now live. ${name}'s page on Neram College Hub has been upgraded, and it is already visible to students researching the 2026 cycle.`)}
${ctaButton(safeUrl, 'View your live page &rarr;')}
${para(`<strong style="color:${C.ink}">What is done</strong>`)}
${bulletList(doneItems.map(escapeHtml))}
${para(`<strong style="color:${C.ink}">Your dashboard login</strong><br>Sign in at <a href="${escapeHtml(DASHBOARD_URL)}" target="_blank" style="color:${C.link};text-decoration:none">${escapeHtml(DASHBOARD_URL)}</a> using <strong style="color:${C.ink}">${escapeHtml(loginEmail)}</strong>. From there you can edit details, see how many students viewed your page, and respond to enquiries.`)}
${para('If anything needs a change, just reply and we will take care of it.')}
${signatureBlock()}
${complianceFooter(unsubscribeUrl, college.name)}`;

  return finalize(subject, emailShell(inner, subject), text);
}

// ─── first_touch_v1: legacy template, preserved verbatim for old log rows ─────

function subjectForV1(variant: SubjectVariant, name: string): string {
  switch (variant) {
    case 2:
      return `We showcased ${name} for NATA 2026 aspirants, a few minutes of your time?`;
    case 3:
      return `${name} profile on neramclasses.com, help us keep it accurate`;
    case 1:
    default:
      return `${name} is featured on Neram College Hub, quick review request`;
  }
}

function renderFirstTouchV1(college: CollegeInput, subjectVariant: SubjectVariant, senderName: string): RenderResult {
  const collegePageUrl = getCollegePageUrl(college);
  const bullets = buildHighlightsBullets(college);
  const completenessLine = buildCompletenessLine(college.data_completeness);
  const subject = subjectForV1(subjectVariant, college.name);

  const bulletsTextLines = bullets.map((b) => `- ${b}`).join('\n');
  const bulletsHtmlItems = bullets.map((b) => `<li style="margin:4px 0">${escapeHtml(b)}</li>`).join('\n');

  const text = [
    `Dear ${college.name} Admissions Team,`,
    '',
    `Greetings from Neram Classes. We run one of South India's largest online learning platforms for NATA and JEE B.Arch aspirants, with over 2,000 active students (mostly from Tamil Nadu) using our apps daily for mock tests, study material, and college research.`,
    '',
    `We recently launched the Neram College Hub, a free directory built to help architecture aspirants discover and compare B.Arch colleges across India. ${college.name} now has a dedicated page on our platform:`,
    '',
    collegePageUrl,
    '',
    'We have already populated the page with publicly available information about your college, including:',
    '',
    bulletsTextLines,
    '',
    completenessLine,
    '',
    `Why this matters for ${college.name}`,
    '',
    `Every student browsing our College Hub can see your page, save it to their shortlist, compare it with other colleges, and reach out to you directly through a lead form. Your profile also carries a permanent backlink to your official website, and your ranking is visible alongside peer institutions on our NIRF and ArchIndex boards. This is completely free for your institution.`,
    '',
    'What we would love your help with',
    '',
    'Some of the information we have is approximate, and a few sections are still empty. Before we promote your profile more widely to our student base, could you kindly review the page and let us know:',
    '',
    '1. Are the fee structure, seat intake, and NAAC grade accurate?',
    '2. Can you share your latest brochure? We will make it downloadable from your page.',
    '3. Would you share 3 to 5 campus photos (hostels, studios, workshops)?',
    '4. Can you provide recent placement statistics (average package, top recruiters)?',
    '5. Would a few of your current students be willing to write short reviews on the page?',
    '6. Are there TNEA cutoff details from recent years you can share?',
    '',
    `Anything you send will help us present ${college.name} in the best possible way to our 2,000+ students who are actively researching colleges for the 2026 admission cycle.`,
    '',
    'We can also give you a dedicated login to manage your page yourself, edit content, see which students viewed it, and receive lead alerts. Just reply to this email and we will set it up.',
    '',
    'Neram Classes is backed by Microsoft for Startups, and we are building the complete ecosystem for architecture aspirants in India. We would be delighted to have ' +
      college.name +
      ' featured prominently.',
    '',
    'Looking forward to hearing from you.',
    '',
    'Warm regards,',
    senderName,
    'Neram Classes',
    'info@neramclasses.com',
    'https://neramclasses.com/colleges',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const name = escapeHtml(college.name);
  const sender = escapeHtml(senderName);
  const url = escapeHtml(collegePageUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1e293b;max-width:620px;margin:0 auto;padding:24px;background:#ffffff">
<p>Dear ${name} Admissions Team,</p>

<p>Greetings from Neram Classes. We run one of South India's largest online learning platforms for NATA and JEE B.Arch aspirants, with over 2,000 active students (mostly from Tamil Nadu) using our apps daily for mock tests, study material, and college research.</p>

<p>We recently launched the Neram College Hub, a free directory built to help architecture aspirants discover and compare B.Arch colleges across India. ${name} now has a dedicated page on our platform:</p>

<p><a href="${url}" style="color:#2563eb;text-decoration:underline">${url}</a></p>

<p>We have already populated the page with publicly available information about your college, including:</p>

<ul style="padding-left:20px">
${bulletsHtmlItems}
</ul>

${completenessLine ? `<p>${escapeHtml(completenessLine)}</p>` : ''}

<h3 style="margin-top:28px;font-size:16px;color:#0f172a">Why this matters for ${name}</h3>

<p>Every student browsing our College Hub can see your page, save it to their shortlist, compare it with other colleges, and reach out to you directly through a lead form. Your profile also carries a permanent backlink to your official website, and your ranking is visible alongside peer institutions on our NIRF and ArchIndex boards. This is completely free for your institution.</p>

<h3 style="margin-top:28px;font-size:16px;color:#0f172a">What we would love your help with</h3>

<p>Some of the information we have is approximate, and a few sections are still empty. Before we promote your profile more widely to our student base, could you kindly review the page and let us know:</p>

<ol style="padding-left:20px">
<li style="margin:6px 0">Are the fee structure, seat intake, and NAAC grade accurate?</li>
<li style="margin:6px 0">Can you share your latest brochure? We will make it downloadable from your page.</li>
<li style="margin:6px 0">Would you share 3 to 5 campus photos (hostels, studios, workshops)?</li>
<li style="margin:6px 0">Can you provide recent placement statistics (average package, top recruiters)?</li>
<li style="margin:6px 0">Would a few of your current students be willing to write short reviews on the page?</li>
<li style="margin:6px 0">Are there TNEA cutoff details from recent years you can share?</li>
</ol>

<p>Anything you send will help us present ${name} in the best possible way to our 2,000+ students who are actively researching colleges for the 2026 admission cycle.</p>

<p>We can also give you a dedicated login to manage your page yourself, edit content, see which students viewed it, and receive lead alerts. Just reply to this email and we will set it up.</p>

<p>Neram Classes is backed by Microsoft for Startups, and we are building the complete ecosystem for architecture aspirants in India. We would be delighted to have ${name} featured prominently.</p>

<p>Looking forward to hearing from you.</p>

<p style="margin-top:28px">Warm regards,<br>
<strong>${sender}</strong><br>
Neram Classes<br>
<a href="mailto:info@neramclasses.com" style="color:#2563eb">info@neramclasses.com</a><br>
<a href="https://neramclasses.com/colleges" style="color:#2563eb">https://neramclasses.com/colleges</a></p>
</body>
</html>`;

  return finalize(subject, html, text);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export function renderOutreachEmail(opts: RenderOpts): RenderResult {
  const subjectVariant: SubjectVariant = opts.subjectVariant ?? 1;
  // Falls back to the tokenless unsubscribe page if the caller did not pass a URL
  // (e.g. an old code path); the send route always supplies the token-bearing URL.
  const unsub = opts.unsubscribeUrl ?? getUnsubscribeUrl(null);
  switch (opts.variant) {
    case 'first_touch_v1':
      return renderFirstTouchV1(opts.college, subjectVariant, opts.senderName);
    case 'first_touch_v2':
      return renderFirstTouchV2(opts.college, subjectVariant, unsub);
    case 'content_request_v1':
      return renderContentRequestV1(opts.college, subjectVariant, unsub);
    case 'partnership_pitch_v1':
      return renderPartnershipPitchV1(opts.college, subjectVariant, unsub);
    case 'payment_details_v1':
      return renderPaymentDetailsV1(opts.college, subjectVariant, opts, unsub);
    case 'onboarding_v1':
      return renderOnboardingV1(opts.college, subjectVariant, opts, unsub);
    default:
      throw new Error(`Outreach template variant not implemented yet: ${opts.variant}`);
  }
}

export function getRecipientEmail(
  college: Pick<CollegeOutreachRow, 'admissions_email' | 'email'>,
  override?: string | null,
): string | null {
  if (override && override.trim()) return override.trim();
  if (college.admissions_email && college.admissions_email.trim()) return college.admissions_email.trim();
  if (college.email && college.email.trim()) return college.email.trim();
  return null;
}

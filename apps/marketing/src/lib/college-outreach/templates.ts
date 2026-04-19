import type { CollegeDetail } from '@/lib/college-hub/types';

export type OutreachTemplateVariant = 'first_touch_v1';
export type SubjectVariant = 1 | 2 | 3;

interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

interface RenderOpts {
  variant: OutreachTemplateVariant;
  subjectVariant?: SubjectVariant;
  college: Pick<
    CollegeDetail,
    | 'name'
    | 'slug'
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
  senderName: string;
}

const SITE_URL = 'https://neramclasses.com';

export function getCollegePageUrl(college: Pick<CollegeDetail, 'state_slug' | 'slug'>): string {
  const state = college.state_slug ?? 'india';
  return `${SITE_URL}/en/colleges/${state}/${college.slug}`;
}

function formatFeeInr(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  if (value >= 100000) return `Rs ${(value / 100000).toFixed(1)} Lakh per year`;
  return `Rs ${Math.round(value / 1000)},000 per year`;
}

function buildHighlightsBullets(c: RenderOpts['college']): string[] {
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

function subjectFor(variant: SubjectVariant, name: string): string {
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
  if (s.includes('\u2014') || s.includes(' -- ') || s.includes('&mdash;')) {
    throw new Error(`Outreach template ${label} contains em dash or double dash`);
  }
}

export function renderOutreachEmail(opts: RenderOpts): RenderResult {
  if (opts.variant !== 'first_touch_v1') {
    throw new Error(`Unknown outreach template variant: ${opts.variant}`);
  }

  const { college, senderName } = opts;
  const subjectVariant: SubjectVariant = opts.subjectVariant ?? 1;
  const collegePageUrl = getCollegePageUrl(college);
  const bullets = buildHighlightsBullets(college);
  const completenessLine = buildCompletenessLine(college.data_completeness);
  const subject = subjectFor(subjectVariant, college.name);

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
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === '')) // collapse double blanks when completenessLine is empty
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

  ensureNoUnresolvedTokens(subject, 'subject');
  ensureNoUnresolvedTokens(html, 'html');
  ensureNoUnresolvedTokens(text, 'text');
  ensureNoEmDashes(subject, 'subject');
  ensureNoEmDashes(html, 'html');
  ensureNoEmDashes(text, 'text');

  return { subject, html, text };
}

export function getRecipientEmail(
  college: Pick<CollegeDetail, 'admissions_email' | 'email'>,
  override?: string | null
): string | null {
  if (override && override.trim()) return override.trim();
  if (college.admissions_email && college.admissions_email.trim()) return college.admissions_email.trim();
  if (college.email && college.email.trim()) return college.email.trim();
  return null;
}

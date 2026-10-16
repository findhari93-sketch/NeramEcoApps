'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { Box, Typography } from '@neram/ui';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { PageHero, Section, SectionHeader, PersonCard, CtaBand, CtaButton, eyebrowSx, tokens as tk } from '@/design-system';

// Team members (could be moved to CMS/database later)
// Cards degrade gracefully: empty fields are hidden and an empty image shows the initials avatar.
// Only set `image` once the file exists in public/images/team, otherwise every visit requests a 404.
// `honorific` is shown before the name but kept out of the initials.
const teamMembers: Array<{
  honorific?: string;
  name: string;
  role: string;
  institute: string;
  bio: string;
  image: string;
  linkedin?: string;
}> = [
  {
    name: 'TamilSelvan',
    role: 'Chief Information Officer (CIO)',
    institute: 'MBA, Alagappa University',
    bio: 'Student Guidance | Academic Coordination | Operations',
    image: '',
    linkedin: 'https://www.linkedin.com/in/tamil-selvan-b7395b177/',
  },
  {
    honorific: 'Ar.',
    name: 'Haribabu Manoharan',
    role: 'Student Advisor & Ex-Chief Technology Officer (CTO)',
    institute: 'NIT Trichy',
    bio: '',
    image: '/images/team/haribabu-manoharan.jpg',
    linkedin: 'https://www.linkedin.com/in/findhari/',
  },
  {
    name: 'Sudharshini Arjun',
    role: 'Architectural Mentor',
    institute: 'University of Oxford, UK',
    bio: 'RIBA Part 2 Architectural Assistant | Senior Architect at KOID India',
    image: '',
    linkedin: 'https://www.linkedin.com/in/sudharshini-rajan-47a0566b/',
  },
  {
    honorific: 'Ar.',
    name: 'Sivaram',
    role: 'Architecture Faculty & Mentor',
    institute: 'B.Arch, Anna University',
    bio: 'NATA & JEE Paper 2 | Architectural Aptitude | Drawing & Design',
    image: '/images/team/sivaram.jpg',
  },
  {
    honorific: 'Ms.',
    name: 'Shanthi Manoharan',
    role: 'Administration & Student Support Coordinator',
    institute: '',
    bio: 'Student Guidance | Parent Communication | Academic Administration',
    image: '',
  },
];

// Statistics
// Founder-confirmed proof points only (lib/seo/facts.ts PROOF_POINTS).
const stats: Array<{ key: string; value: string; label?: string }> = [
  { key: 'yearsOfExcellence', value: '10+' },
  { key: 'studentsEnrolled', value: '1,000+' },
  { key: 'airOne', value: 'AIR 1', label: 'JEE B.Arch 2024' },
];

// Story paragraphs (rendered in order)
const storyParagraphs = ['story.paragraph1', 'story.paragraph2', 'story.paragraph3'] as const;

// Core values
const coreValues = ['excellence', 'integrity', 'innovation', 'inclusivity'] as const;

/** One heading + paragraphs, in a ruled 2-up (Mission / Vision, values). */
function RuledBlock({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return (
    <Box sx={{ py: 3.5, pr: { sm: 4 }, display: 'flex', flexDirection: 'column', gap: 1.5, borderBottom: `1px solid ${tk.line}` }}>
      <Typography component="h3" sx={{ m: 0, fontSize: '1.5rem', fontWeight: 800 }}>
        {title}
      </Typography>
      {paragraphs.map((p) => (
        <Typography key={p} component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.7, color: tk.inkMuted }}>
          {p}
        </Typography>
      ))}
    </Box>
  );
}

const ruledGrid = (min: number) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  columnGap: 4,
  borderTop: `1px solid ${tk.ink}`,
});

/** T9 About: dark hero with stats, story, ruled Mission/Vision, team, values, CtaBand. */
export default function AboutPageContent() {
  const t = useTranslations('about');
  // Button labels already translated in every locale (the page's ClientIntl passes just these keys).
  const tHeader = useTranslations('header');
  const tContact = useTranslations('contact');

  return (
    <Box>
      <PageHero
        title={t('pageTitle')}
        lede={t('heroSubtitle')}
        stats={stats.map((s) => ({ value: s.value, label: s.label ?? t(`impact.${s.key}`) }))}
      />

      <Section id="story" rule={false} py={{ xs: 7, md: 9 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 5 }}>
          <SectionHeader align="start" title={t('story.title')} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
            {storyParagraphs.map((key) => (
              <Typography key={key} component="p" sx={{ m: 0, fontSize: '1.0625rem', lineHeight: 1.7 }}>
                {t(key)}
              </Typography>
            ))}
          </Box>
        </Box>
      </Section>

      <Section id="mission" tone="white" py={{ xs: 7, md: 9 }}>
        <Box sx={ruledGrid(400)}>
          <RuledBlock title={t('mission.title')} paragraphs={[t('mission.paragraph1'), t('mission.paragraph2')]} />
          <RuledBlock title={t('vision.title')} paragraphs={[t('vision.paragraph1'), t('vision.paragraph2')]} />
        </Box>
      </Section>

      <Section id="team" py={{ xs: 7, md: 9 }} gap={3.5} header={{ align: 'start', title: t('team.title'), lede: t('team.subtitle'), ledeWidth: 720 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 2 }}>
          {teamMembers.map((member) => {
            const fullName = [member.honorific, member.name].filter(Boolean).join(' ');
            return (
              <PersonCard
                key={member.name}
                name={member.name}
                honorific={member.honorific}
                role={member.role}
                photo={member.image || null}
                size={56}
              >
                {member.institute && (
                  <Typography component="span" sx={{ fontSize: '0.875rem', color: tk.inkMuted }}>
                    {member.institute}
                  </Typography>
                )}
                {member.bio && (
                  <Typography component="span" sx={{ fontSize: '0.875rem', lineHeight: 1.5, color: tk.inkMuted }}>
                    {/* Keep each "|" on the same line as the item before it so a wrap never starts with one */}
                    {member.bio.split(' | ').map((item, i, items) => (
                      <Fragment key={item}>
                        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                          {item}
                          {i < items.length - 1 ? ' |' : ''}
                        </Box>
                        {i < items.length - 1 ? ' ' : ''}
                      </Fragment>
                    ))}
                  </Typography>
                )}
                {member.linkedin && (
                  // mt: auto pins the link to the card bottom so links line up across a row
                  <Box
                    component="a"
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${fullName} on LinkedIn (opens in a new tab)`}
                    sx={{
                      mt: 'auto',
                      alignSelf: 'flex-start',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 44,
                      height: 44,
                      ml: -1.25,
                      borderRadius: `${tk.radius}px`,
                      color: tk.ink,
                      '&:hover': { color: tk.gold800 },
                      '&:focus-visible': { outline: tk.focusOutline, outlineOffset: '2px' },
                    }}
                  >
                    <LinkedInIcon sx={{ fontSize: 26 }} />
                  </Box>
                )}
              </PersonCard>
            );
          })}
        </Box>
      </Section>

      <Section id="values" tone="white" py={{ xs: 7, md: 9 }} gap={3.5}>
        <Typography component="h2" sx={{ ...eyebrowSx }}>
          {t('values.title')}
        </Typography>
        <Box sx={ruledGrid(240)}>
          {coreValues.map((value) => (
            <RuledBlock key={value} title={t(`values.${value}.title`)} paragraphs={[t(`values.${value}.description`)]} />
          ))}
        </Box>
      </Section>

      <CtaBand
        eyebrow={null}
        title={t('closing.title')}
        actions={
          <>
            <CtaButton href="/demo-class">{tHeader('freeDemoClass')}</CtaButton>
            <CtaButton variant="link" href="/contact" endIcon={<NorthEastIcon aria-hidden />}>
              {tContact('title')}
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}

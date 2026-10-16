'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookIcon from '@mui/icons-material/Facebook';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Surface, CtaButton, eyebrowSx, tokens as tk } from '@/design-system';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';

/** `labelKey` is a footer.links.* message; `label` is a proper noun shown as is. */
interface FooterLink {
  label?: string;
  labelKey?: string;
  href: string;
}

// Every link here is an internal SEO link. Moving one is fine; dropping one is not.
const footerLinks: Record<
  'quickLinks' | 'resources' | 'topCities' | 'topStates' | 'counselling' | 'legal',
  FooterLink[]
> = {
  quickLinks: [
    { labelKey: 'home', href: '/' },
    { labelKey: 'about', href: '/about' },
    { labelKey: 'courses', href: '/courses' },
    { labelKey: 'colleges', href: '/colleges' },
    { labelKey: 'compareColleges', href: '/colleges/compare' },
    { labelKey: 'coaching', href: '/coaching' },
    { labelKey: 'demoClass', href: '/demo-class' },
    { labelKey: 'apply', href: '/apply' },
    { labelKey: 'contact', href: '/contact' },
    { labelKey: 'fees', href: '/fees' },
    { labelKey: 'scholarships', href: '/scholarship' },
    { labelKey: 'careers', href: '/careers' },
  ],
  resources: [
    { labelKey: 'freeTools', href: '/tools' },
    { labelKey: 'nataSyllabus', href: '/nata-syllabus' },
    { labelKey: 'nataCoaching', href: '/nata-entrance-exam-coaching' },
    { labelKey: 'nataGuide', href: '/nata-preparation-guide' },
    { labelKey: 'score150', href: '/how-to-score-150-in-nata' },
    { labelKey: 'importantQuestions', href: '/nata-important-questions' },
    { labelKey: 'bestBooks', href: '/best-books-nata-jee' },
    { labelKey: 'previousPapers', href: '/previous-year-papers' },
    { labelKey: 'cutoffCalculator', href: '/tools/cutoff-calculator' },
    { labelKey: 'nataApp', href: '/nata-app' },
    { labelKey: 'aiarchitek', href: '/aiarchitek' },
    { labelKey: 'nexusLms', href: 'https://nexus.neramclasses.com' },
    { labelKey: 'nataOnline', href: '/nata-online-coaching' },
    { labelKey: 'blog', href: '/blog' },
  ],
  topCities: [
    { label: 'Chennai', href: '/coaching/nata-coaching/nata-coaching-centers-in-chennai' },
    { label: 'Bangalore', href: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore' },
    { label: 'Hyderabad', href: '/coaching/nata-coaching/nata-coaching-centers-in-hyderabad' },
    { label: 'Mumbai', href: '/coaching/nata-coaching/nata-coaching-centers-in-mumbai' },
    { label: 'Delhi NCR', href: '/coaching/nata-coaching/nata-coaching-centers-in-delhi' },
    { label: 'Pune', href: '/coaching/nata-coaching/nata-coaching-centers-in-pune' },
    { label: 'Kolkata', href: '/coaching/nata-coaching/nata-coaching-centers-in-kolkata' },
    { label: 'Kochi', href: '/coaching/nata-coaching/nata-coaching-centers-in-kochi' },
    { label: 'Ahmedabad', href: '/coaching/nata-coaching/nata-coaching-centers-in-ahmedabad' },
    { label: 'Coimbatore', href: '/coaching/nata-coaching/nata-coaching-centers-in-coimbatore' },
    { label: 'Madurai', href: '/coaching/nata-coaching/nata-coaching-centers-in-madurai' },
    { label: 'Trichy', href: '/coaching/nata-coaching/nata-coaching-centers-in-trichy' },
  ],
  topStates: [
    { label: 'Tamil Nadu', href: '/coaching/nata-coaching-in-tamil-nadu' },
    { label: 'Karnataka', href: '/coaching/nata-coaching-in-karnataka' },
    { label: 'Kerala', href: '/coaching/nata-coaching-in-kerala' },
    { label: 'Maharashtra', href: '/coaching/nata-coaching-in-maharashtra' },
    { label: 'Delhi', href: '/coaching/nata-coaching-in-delhi' },
    { label: 'Andhra Pradesh', href: '/coaching/nata-coaching-in-andhra-pradesh' },
    { label: 'Telangana', href: '/coaching/nata-coaching-in-telangana' },
    { label: 'Gujarat', href: '/coaching/nata-coaching-in-gujarat' },
    { label: 'Rajasthan', href: '/coaching/nata-coaching-in-rajasthan' },
    { label: 'West Bengal', href: '/coaching/nata-coaching-in-west-bengal' },
    { label: 'Uttar Pradesh', href: '/coaching/nata-coaching-in-uttar-pradesh' },
  ],
  counselling: [
    { label: 'TNEA B.Arch (Tamil Nadu)', href: '/counseling/tnea-barch' },
    { label: 'KEAM B.Arch (Kerala)', href: '/counseling/keam-arch' },
    { label: 'JoSAA (NIT/IIT/SPA)', href: '/counseling/josaa' },
    { label: 'CEPT University', href: '/counseling/cept-university' },
    { label: 'MHT-CET (Maharashtra)', href: '/counseling/mht-cet-barch' },
    { labelKey: 'allCounsellings', href: '/counseling' },
  ],
  legal: [
    { labelKey: 'privacy', href: '/privacy' },
    { labelKey: 'terms', href: '/terms' },
    { labelKey: 'refund', href: '/refund-policy' },
  ],
};

const socialLinks = [
  { network: 'YouTube', href: 'https://www.youtube.com/@neramclasses', Icon: YouTubeIcon },
  { network: 'Instagram', href: 'https://www.instagram.com/neramclasses', Icon: InstagramIcon },
  { network: 'Facebook', href: 'https://www.facebook.com/neramclasses', Icon: FacebookIcon },
];

const focusSx = {
  '&:focus-visible': { outline: tk.focusOutline, outlineOffset: '2px', borderRadius: '2px' },
} as const;

/** 14px muted link; 44px tall on phones (padding, not a bigger font). */
const linkSx = {
  display: 'flex',
  alignItems: 'center',
  minHeight: { xs: 44, md: 32 },
  py: 0.5,
  fontSize: '0.875rem',
  lineHeight: 1.4,
  color: tk.paperMuted,
  textDecoration: 'none',
  transition: 'color 150ms ease',
  '&:hover': { color: tk.gold300 },
  ...focusSx,
} as const;

const headingSx = { ...eyebrowSx, mb: 1.5 } as const;

/** Two link columns inside a column on phones, one from the tablet up. */
const listSx = {
  listStyle: 'none',
  m: 0,
  p: 0,
  display: 'grid',
  gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr' },
  columnGap: 2,
} as const;

const isExternal = (href: string) => /^https?:\/\//.test(href);

function FooterLinkItem({ link }: { link: FooterLink }) {
  const t = useTranslations('footer.links');
  const label = link.labelKey ? t(link.labelKey) : link.label;
  return (
    <li>
      {isExternal(link.href) ? (
        <Box component="a" href={link.href} sx={linkSx}>
          {label}
        </Box>
      ) : (
        <Box component={Link} href={link.href} sx={linkSx}>
          {label}
        </Box>
      )}
    </li>
  );
}

function LinkGroup({ id, title, children, first = true }: { id: string; title: string; children: ReactNode; first?: boolean }) {
  return (
    <Box component="nav" aria-labelledby={id} sx={{ mt: first ? 0 : 3 }}>
      <Typography component="h2" id={id} sx={headingSx}>
        {title}
      </Typography>
      <Box component="ul" sx={listSx}>
        {children}
      </Box>
    </Box>
  );
}

export default function Footer() {
  const t = useTranslations('footer');
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  return (
    <Surface
      tone="dark"
      component="footer"
      sx={{
        borderTop: `1px solid ${tk.lineDark}`,
        pt: 8,
        pb: 3,
        px: { xs: 2, sm: 3 },
      }}
    >
      <Box
        sx={{
          maxWidth: tk.container.page,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {/* Five columns: auto-fit stacks them on phones. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 4,
          }}
        >
          {/* About */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: '0.875rem', lineHeight: 1.55, color: tk.paperMuted }}>
            <Typography component="p" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, color: tk.gold500 }}>
              Neram Classes
            </Typography>
            <Typography component="p" sx={{ m: 0, fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
              {t('about')}
            </Typography>
            <Box component="address" sx={{ fontStyle: 'normal', display: 'flex', flexDirection: 'column' }}>
              <span>{t('location')}</span>
              <Box component="a" href="tel:+919176137043" sx={{ ...linkSx, minHeight: { xs: 44, md: 28 }, py: 0 }}>
                {t('phone', { number: '+91-9176137043' })}
              </Box>
              <Box component="a" href="mailto:info@neramclasses.com" sx={{ ...linkSx, minHeight: { xs: 44, md: 28 }, py: 0 }}>
                {t('email', { address: 'info@neramclasses.com' })}
              </Box>
            </Box>
            <Box
              component="span"
              sx={{
                alignSelf: 'flex-start',
                px: 1.5,
                py: 0.5,
                borderRadius: `${tk.radiusPill}px`,
                bgcolor: tk.goldTintBg,
                border: `1px solid ${tk.goldTintBorder}`,
                color: tk.gold300,
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {t('supportedBy')}
            </Box>

            <Box component="nav" aria-labelledby="footer-follow" sx={{ mt: 1.5 }}>
              <Typography component="h2" id="footer-follow" sx={{ ...headingSx, mb: 0.5 }}>
                {t('followUs')}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 1, ml: -1.25 }}>
                {socialLinks.map(({ network, href, Icon }) => (
                  <li key={href}>
                    <Box
                      component="a"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('socialLabel', { network })}
                      sx={{
                        width: 44,
                        height: 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: `${tk.radius}px`,
                        color: tk.paperMuted,
                        transition: 'color 150ms ease',
                        '&:hover': { color: tk.gold300 },
                        '& svg': { fontSize: 24 },
                        ...focusSx,
                      }}
                    >
                      <Icon aria-hidden />
                    </Box>
                  </li>
                ))}
              </Box>
            </Box>
          </Box>

          {/* Quick Links */}
          <LinkGroup id="footer-quick-links" title={t('quickLinks')}>
            {footerLinks.quickLinks.map((link) =>
              link.href === '/apply' && isEnrolled ? (
                <li key={link.href}>
                  <Box
                    component="button"
                    type="button"
                    onClick={goToApp}
                    sx={{ ...linkSx, width: '100%', p: 0, border: 0, bgcolor: 'transparent', font: 'inherit', fontSize: '0.875rem', textAlign: 'left', cursor: 'pointer' }}
                  >
                    {t('goToApp')}
                  </Box>
                </li>
              ) : (
                <FooterLinkItem key={link.href} link={link} />
              ),
            )}
          </LinkGroup>

          {/* Resources */}
          <LinkGroup id="footer-resources" title={t('resources')}>
            {footerLinks.resources.map((link) => (
              <FooterLinkItem key={link.href} link={link} />
            ))}
          </LinkGroup>

          {/* Top Cities, then Top States in the same column */}
          <Box>
            <LinkGroup id="footer-top-cities" title={t('topCities')}>
              {footerLinks.topCities.map((link) => (
                <FooterLinkItem key={link.href} link={link} />
              ))}
            </LinkGroup>
            <LinkGroup id="footer-top-states" title={t('topStates')} first={false}>
              {footerLinks.topStates.map((link) => (
                <FooterLinkItem key={link.href} link={link} />
              ))}
            </LinkGroup>
          </Box>

          {/* B.Arch Counselling */}
          <LinkGroup id="footer-counselling" title={t('counselling')}>
            {footerLinks.counselling.map((link) => (
              <FooterLinkItem key={link.href} link={link} />
            ))}
          </LinkGroup>
        </Box>

        {/* Nexus promo */}
        <Box
          sx={{
            border: `1px solid ${tk.goldTintBorder}`,
            borderRadius: `${tk.radius}px`,
            px: { xs: 2, sm: 3 },
            py: 2.5,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxWidth: 640 }}>
            <Typography component="p" sx={{ m: 0, fontSize: '1rem', fontWeight: 700, color: tk.gold500 }}>
              Nexus by Neram Classes
            </Typography>
            <Typography component="p" sx={{ m: 0, fontSize: '0.875rem', lineHeight: 1.55, color: tk.paperMuted }}>
              {t('nexusBody')}
            </Typography>
            <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: '0.8125rem', lineHeight: 1.5, color: tk.paperSubtle }}>
              {t('nexusNote')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <CtaButton variant="outline" size="md" href="/nata-app" endIcon={null}>
              {t('tryFreeTools')}
            </CtaButton>
            <CtaButton variant="primary" size="md" href="https://nexus.neramclasses.com" external>
              {t('exploreNexus')}
            </CtaButton>
          </Box>
        </Box>

        {/* Legal */}
        <Box
          sx={{
            borderTop: `1px solid ${tk.lineDark}`,
            pt: 2.5,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1.5,
            fontSize: '0.8125rem',
            color: tk.paperSubtle,
          }}
        >
          <Typography component="p" sx={{ m: 0, fontSize: 'inherit', color: 'inherit' }}>
            {t('copyright', { year: new Date().getFullYear() })}
          </Typography>
          <Box component="nav" aria-label={t('legal')}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Box
                    component={Link}
                    href={link.href}
                    sx={{ ...linkSx, fontSize: '0.8125rem', color: tk.paperSubtle, '&:hover': { color: tk.paper } }}
                  >
                    {t(`links.${link.labelKey}`)}
                  </Box>
                </li>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Surface>
  );
}

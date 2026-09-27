'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import { Box, Button, Container, Menu, MenuItem, Typography } from '@neram/ui';
import HelpOutline from '@mui/icons-material/HelpOutline';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import { useTranslations } from 'next-intl';

const OFFICE_PHONE = '+91 91761 37043';
const OFFICE_TEL = 'tel:+919176137043';

/** Inline text links, but still a 44 px target on a phone. */
const legalLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, padding: '0 8px' };

interface ApplicationShellProps {
  children: React.ReactNode;
  /** Reserved for the Nera sheet (sub-project D-B). When set, Help opens it instead of the menu. */
  onHelp?: () => void;
}

/**
 * The focused shell for /apply, /pay and /enroll: a 56 px bar with the
 * wordmark and one Help button, the page, and a one-line legal strip. No
 * navigation, no footer, nothing floating. Step titles and progress live
 * inside the form (StepShell), so this component holds no form state.
 */
export default function ApplicationShell({ children, onHelp }: ApplicationShellProps) {
  const t = useTranslations('apply');
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
      <Box
        component="header"
        role="banner"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="sm" sx={{ px: 2 }}>
          <Box sx={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link
              href="/"
              aria-label={t('shell.home')}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, minWidth: 48 }}
            >
              <Image src="/logo.png" alt="" width={112} height={32} style={{ height: 32, width: 'auto' }} priority />
            </Link>
            <Button
              variant="text"
              startIcon={<HelpOutline />}
              onClick={(e) => (onHelp ? onHelp() : setAnchor(e.currentTarget))}
              aria-haspopup={onHelp ? undefined : 'menu'}
              sx={{ minHeight: 48, px: 1.5 }}
            >
              {t('shell.help')}
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem component="a" href={OFFICE_TEL} onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                <PhoneOutlined fontSize="small" sx={{ mr: 1.5 }} />
                {t('shell.callUs')} {OFFICE_PHONE}
              </MenuItem>
              <MenuItem component={Link} href="/contact" onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>
                <MailOutline fontSize="small" sx={{ mr: 1.5 }} />
                {t('shell.contactPage')}
              </MenuItem>
            </Menu>
          </Box>
        </Container>
      </Box>

      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>

      <Box component="footer" sx={{ py: 2, px: 2 }}>
        <Container maxWidth="sm" sx={{ px: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
            sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <Link href="/terms" style={legalLinkStyle}>{t('shell.terms')}</Link>
            <Link href="/privacy" style={legalLinkStyle}>{t('shell.privacy')}</Link>
            <Link href="/refund-policy" style={legalLinkStyle}>{t('shell.refund')}</Link>
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

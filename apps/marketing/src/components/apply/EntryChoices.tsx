'use client';

import { Box, Button, Card, CardActionArea, Stack, Typography } from '@neram/ui';
import MicNoneOutlined from '@mui/icons-material/MicNoneOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import { useTranslations } from 'next-intl';

interface EntryChoicesProps {
  onManual: () => void;
  onSignIn: () => void;
  /** Supplied by the Nera sheet (sub-project D-B). Hidden until then. */
  onTalkToNera?: () => void;
  onUploadDocument?: () => void;
}

interface ChoiceCardProps {
  icon: React.ReactNode;
  title: string;
  body?: string;
  onClick: () => void;
}

function ChoiceCard({ icon, title, body, onClick }: ChoiceCardProps) {
  return (
    <Card variant="outlined">
      <CardActionArea
        onClick={onClick}
        sx={{ p: 2, minHeight: 64, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-start' }}
      >
        <Box sx={{ color: 'primary.main', display: 'flex' }} aria-hidden>
          {icon}
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          {body && (
            <Typography variant="body2" color="text.secondary">
              {body}
            </Typography>
          )}
        </Box>
      </CardActionArea>
    </Card>
  );
}

/** How would you like to fill this in? Nera, a document, or by hand. */
export default function EntryChoices({ onManual, onSignIn, onTalkToNera, onUploadDocument }: EntryChoicesProps) {
  const t = useTranslations('apply');

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom component="h2">
        {t('aboutYou.entryTitle')}
      </Typography>
      <Stack spacing={1.5}>
        {onTalkToNera && (
          <ChoiceCard
            icon={<MicNoneOutlined />}
            title={t('aboutYou.entryNera')}
            body={t('aboutYou.entryNeraBody')}
            onClick={onTalkToNera}
          />
        )}
        {onUploadDocument && (
          <ChoiceCard
            icon={<UploadFileOutlined />}
            title={t('aboutYou.entryDocument')}
            body={t('aboutYou.entryDocumentBody')}
            onClick={onUploadDocument}
          />
        )}
        <ChoiceCard icon={<EditNoteOutlined />} title={t('aboutYou.entryManual')} onClick={onManual} />
      </Stack>
      <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 2 }}>
        {t('aboutYou.haveAccount')}{' '}
        <Button variant="text" size="small" onClick={onSignIn} sx={{ minHeight: 44, textTransform: 'none' }}>
          {t('aboutYou.signIn')}
        </Button>
      </Typography>
    </Box>
  );
}

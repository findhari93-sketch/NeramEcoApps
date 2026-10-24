'use client';

/**
 * The hover card on PersonAvatar: who this is, in short, without a click.
 *
 * Name and role first (the ring in words), then only the lines that are known:
 * class and exam year, language, place, classroom, CRM stage, last activity and
 * the interest logged on an open follow-up. A line with nothing to say is left
 * out rather than shown as "Not set", so a short card means "we know little",
 * which is itself worth seeing.
 *
 * Built from the same facts as the avatar's corners, so the card and the marks
 * can never disagree.
 */
import type { ReactNode } from 'react';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { AvatarRing, Box, Typography, type AvatarRingVariant } from '@neram/ui';
import { LIFECYCLE_STAGE_LABELS } from '@neram/database';
import {
  RING_LABEL,
  activityLine,
  avatarLanguageSentence,
  interestLabel,
  placeLine,
  showsGlanceMarks,
  studyLine,
  type AvatarLanguage,
  type PersonFacts,
} from '@/lib/person-avatar';

function Line({ icon, children, tone }: { icon: ReactNode; children: ReactNode; tone?: 'hot' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box
        aria-hidden
        sx={{
          display: 'inline-flex',
          mt: '1px',
          color: tone === 'hot' ? '#C2410C' : 'text.secondary',
          '& svg': { fontSize: 16 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="body2" sx={{ lineHeight: 1.4, fontWeight: tone === 'hot' ? 700 : 400 }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function PersonGlanceCard({
  name,
  ring,
  role,
  facts,
  language,
  loading,
}: {
  name: string | null;
  ring: AvatarRingVariant;
  role?: string;
  facts: Partial<PersonFacts>;
  language: AvatarLanguage | null;
  loading: boolean;
}) {
  const funnel = showsGlanceMarks(ring);
  const study = funnel ? studyLine(facts) : null;
  const spoken = avatarLanguageSentence(language)?.replace(/\.$/, '') ?? null;
  const place = funnel ? placeLine(facts) : null;
  const classroom = funnel ? facts.classroomName?.trim() || null : null;
  const roleWord = role || RING_LABEL[ring];
  const stageLabel =
    funnel && facts.lifecycleStage
      ? (LIFECYCLE_STAGE_LABELS as Record<string, string>)[facts.lifecycleStage] ?? null
      : null;
  // "Lead" under "Lead" says nothing twice: the stage line only when it adds something.
  const stage = stageLabel && stageLabel.toLowerCase() !== roleWord.toLowerCase() ? stageLabel : null;
  const activity = funnel ? activityLine(facts.lastActiveAt) : null;
  const interest = ring === 'lead' ? interestLabel(facts.interest) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 200 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {name || 'Unnamed'}
        </Typography>
        {roleWord ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
            {/* The ring itself, tiny, so the word and the colour are learned together. */}
            <AvatarRing variant={ring} size={8}>
              <Box sx={{ width: 8, height: 8 }} />
            </AvatarRing>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {roleWord}
            </Typography>
          </Box>
        ) : loading ? (
          <Typography variant="caption" color="text.secondary">
            Loading details
          </Typography>
        ) : null}
      </Box>

      {interest && (
        <Line icon={<WhatshotIcon />} tone={facts.interest === 'hot' ? 'hot' : undefined}>
          {interest}
        </Line>
      )}
      {study && <Line icon={<SchoolOutlinedIcon />}>{study}</Line>}
      {spoken && <Line icon={<TranslateIcon />}>{spoken}</Line>}
      {place && <Line icon={<PlaceOutlinedIcon />}>{place}</Line>}
      {classroom && <Line icon={<GroupsOutlinedIcon />}>{classroom}</Line>}
      {stage && <Line icon={<FlagOutlinedIcon />}>{stage}</Line>}
      {activity && <Line icon={<ScheduleIcon />}>{activity}</Line>}
    </Box>
  );
}

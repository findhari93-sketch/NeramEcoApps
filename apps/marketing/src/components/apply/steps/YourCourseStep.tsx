'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Alert,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import ArchitectureOutlined from '@mui/icons-material/ArchitectureOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import JoinInnerOutlined from '@mui/icons-material/JoinInnerOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PhoneCallbackOutlined from '@mui/icons-material/PhoneCallbackOutlined';
import LaptopOutlined from '@mui/icons-material/LaptopOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import DirectionsOutlined from '@mui/icons-material/DirectionsOutlined';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import { useTranslations } from 'next-intl';
import { tokens as tk } from '@/design-system';
import StepHeading from '../StepHeading';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useFormContext } from '../FormContext';
import { iconTile40Sx, outlineButtonSx, railCardSx, selectedCardSx } from '../styles';
import Field from '../fields/Field';
import type { CourseType, OfflineCenter } from '@neram/database';
import { leadAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import ProgrammePicker, { type ProgrammePick } from '../ProgrammePicker';
import FeeSummaryCard from '../FeeSummaryCard';
import YourStudiesBlock from './YourStudiesBlock';

// Course options
const COURSE_OPTIONS: { value: CourseType; labelKey: string; bodyKey: string; icon: React.ReactNode }[] = [
  { value: 'nata', labelKey: 'yourCourse.nata', bodyKey: 'yourCourse.nataBody', icon: <ArchitectureOutlined /> },
  { value: 'jee_paper2', labelKey: 'yourCourse.jee', bodyKey: 'yourCourse.jeeBody', icon: <SchoolOutlined /> },
  { value: 'both', labelKey: 'yourCourse.both', bodyKey: 'yourCourse.bothBody', icon: <JoinInnerOutlined /> },
  { value: 'not_sure', labelKey: 'yourCourse.notSure', bodyKey: 'yourCourse.notSureBody', icon: <HelpOutlineOutlined /> },
];

type TimeSlot = 'morning' | 'afternoon' | 'evening';

/** Step 2 sections sit under a 1px line with 28px above the content. */
const sectionSx = { borderTop: `1px solid ${tk.line}`, pt: 3.5 } as const;

/** Question headings (h2): 17px bold ink. */
const questionSx = { m: 0, mb: 1.5, fontSize: { xs: 17, md: 16 }, fontWeight: 700, lineHeight: 1.35, color: tk.ink } as const;

/** Layout of a choice card (the look comes from selectedCardSx). */
const cardLayout = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  gap: '8px',
  padding: '16px 18px',
  width: '100%',
  height: '100%',
  fontFamily: 'inherit',
} as const;

const centreGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 1,
} as const;

/** Underlined 14px/600 text button, 44px tall. */
const textLinkSx = {
  minHeight: 44,
  px: 0,
  color: tk.ink,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline', color: tk.gold800 },
  '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '2px' },
} as const;

const dialogTitleSx = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 1.5 } as const;
const closeButtonSx = {
  width: 44,
  height: 44,
  color: tk.ink,
  borderRadius: `${tk.radius}px`,
  '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '2px' },
} as const;
const dialogRowSx = { display: 'flex', alignItems: 'flex-start', gap: 1 } as const;
const dialogIconSx = { fontSize: 18, color: tk.inkMuted, mt: '1px' } as const;
const dialogTextSx = { m: 0, fontSize: 14, lineHeight: 1.5, color: tk.inkMuted } as const;

interface ChoiceCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  body: string;
  /** 13px on the exam cards, 14px on the learning-mode cards. */
  bodySize?: number;
}

/** Exam and learning-mode card: navy icon tile, check when selected, label, short body. */
function ChoiceCard({ selected, onClick, icon, label, body, bodySize = 13 }: ChoiceCardProps) {
  return (
    <ButtonBase aria-pressed={selected} onClick={onClick} sx={selectedCardSx(selected, cardLayout)}>
      <Box component="span" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
        <Box component="span" sx={iconTile40Sx} aria-hidden>
          {icon}
        </Box>
        {selected && <CheckCircleOutlined aria-hidden sx={{ fontSize: 22, color: tk.navy900 }} />}
      </Box>
      <Typography component="span" sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: tk.ink }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: bodySize, lineHeight: 1.45, color: tk.inkMuted }}>
        {body}
      </Typography>
    </ButtonBase>
  );
}

/**
 * Step 2, Your course: the exam, the programme (with its standard fee on the
 * card), how to learn, an optional centre, then Your studies. The fee card is
 * inline, never floating.
 */
export default function YourCourseStep() {
  const t = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const [pickedFee, setPickedFee] = useState<{ amount: number; combo: number } | null>(null);
  const { course } = formData;
  const { user } = useFirebaseAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [centersLoading, setCentersLoading] = useState(true);
  const [centerCityFilter, setCenterCityFilter] = useState('all');

  // Dialog state
  const [centersDialogOpen, setCentersDialogOpen] = useState(false);
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);

  // Callback form state
  const [callbackSlot, setCallbackSlot] = useState<TimeSlot | null>(null);
  const [callbackNotes, setCallbackNotes] = useState('');
  const [callbackSubmitting, setCallbackSubmitting] = useState(false);
  const [callbackSuccess, setCallbackSuccess] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  // Fetch centers on mount
  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    try {
      const response = await fetch('/api/centers');
      const data = await response.json();
      if (data.success) {
        setCenters(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch centers:', error);
    } finally {
      setCentersLoading(false);
    }
  };

  // Derive unique cities from centers
  const uniqueCities = useMemo(() => {
    const citySet = new Set(centers.map((c) => c.city));
    return Array.from(citySet).sort();
  }, [centers]);

  // Filter centers by selected city
  const filteredCenters = useMemo(() => {
    if (centerCityFilter === 'all') return centers;
    return centers.filter((c) => c.city === centerCityFilter);
  }, [centers, centerCityFilter]);

  // Auto-set city filter when center is pre-selected (from URL param)
  useEffect(() => {
    if (course.selectedCenterId && centers.length > 0) {
      const selectedCenter = centers.find((c) => c.id === course.selectedCenterId);
      if (selectedCenter) {
        setCenterCityFilter(selectedCenter.city);
      }
    }
  }, [course.selectedCenterId, centers]);

  const handleCourseSelect = (courseType: CourseType) => {
    updateFormData('course', {
      interestCourse: courseType,
      feeStructureId: null,
      feeStructureLabel: null,
      programType: null,
    });
    setPickedFee(null);
  };

  const handleProgrammePick = (pick: ProgrammePick | null) => {
    updateFormData('course', {
      feeStructureId: pick?.id ?? null,
      feeStructureLabel: pick?.label ?? null,
      programType: pick?.programType ?? null,
    });
    setPickedFee(pick ? { amount: pick.feeAmount, combo: pick.comboExtraFee } : null);
    if (pick) trackTaxonomyEvent('course_selected', { course: course.interestCourse, fee_structure_id: pick.id });
  };

  const handleLearningModeSelect = (mode: 'hybrid' | 'online_only') => {
    if (mode === 'online_only') {
      updateFormData('course', {
        learningMode: 'online_only',
        selectedCenterId: null,
        selectedCenterName: null,
        hybridLearningAccepted: false,
      });
    } else {
      updateFormData('course', {
        learningMode: 'hybrid',
        hybridLearningAccepted: true,
      });
    }
  };

  const handleCenterSelect = (center: OfflineCenter) => {
    if (course.selectedCenterId === center.id) {
      // Deselect
      updateFormData('course', {
        selectedCenterId: null,
        selectedCenterName: null,
      });
    } else {
      updateFormData('course', {
        selectedCenterId: center.id,
        selectedCenterName: center.name,
      });
    }
  };

  const handleSelectCenterFromDialog = (center: OfflineCenter) => {
    handleCenterSelect(center);
    setCentersDialogOpen(false);
  };

  const handleGetDirections = (center: OfflineCenter) => {
    if (center.google_maps_url) {
      window.open(center.google_maps_url, '_blank');
    } else if (center.latitude && center.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`,
        '_blank'
      );
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${center.name}, ${center.address}, ${center.city}`
        )}`,
        '_blank'
      );
    }
  };

  const handleCallbackSubmit = useCallback(async () => {
    if (!user) return;

    setCallbackSubmitting(true);
    setCallbackError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const idToken = await currentUser.getIdToken();
      const userName = formData.personal.firstName || user.name || '';
      const userPhone = (formData.personal.phone || user.phone || '').replace(/^\+91/, '');

      const response = await fetch('/api/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: userName,
          phone: userPhone,
          email: user.email || undefined,
          preferred_slot: callbackSlot || undefined,
          notes: callbackNotes.trim() || undefined,
          ...leadAttribution(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes('already requested')) {
          setCallbackError('You have already requested a callback. Our team will reach out soon.');
        } else {
          setCallbackError(data.error || 'Failed to submit callback request. Please try again.');
        }
        return;
      }

      setCallbackSuccess(true);
      trackTaxonomyEvent('callback_requested', { source: 'application_form' });
      // Auto-close after 3 seconds
      setTimeout(() => {
        setCallbackDialogOpen(false);
        setCallbackSuccess(false);
        setCallbackSlot(null);
        setCallbackNotes('');
      }, 3000);
    } catch (err) {
      console.error('Callback request error:', err);
      setCallbackError('Something went wrong. Please try again.');
    } finally {
      setCallbackSubmitting(false);
    }
  }, [user, formData.personal, callbackSlot, callbackNotes]);

  const isPhoneVerified = formData.personal.phoneVerified;

  const openCallback = () => {
    setCallbackError(null);
    setCallbackSuccess(false);
    setCallbackDialogOpen(true);
  };

  return (
    <Box>
      <StepHeading title={t('yourCourse.title')} subtitle={t('yourCourse.subtitle')} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3.5, md: 2.5 } }}>
        {/* Which exam, then the programme (or the not-sure notice) */}
        <Box component="section" aria-labelledby="apply-course-q">
          <Typography id="apply-course-q" component="h2" sx={questionSx}>
            {t('yourCourse.courseQuestion')}
          </Typography>
          <Box
            role="group"
            aria-labelledby="apply-course-q"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 1 }}
          >
            {COURSE_OPTIONS.map((option) => (
              <ChoiceCard
                key={option.value}
                selected={course.interestCourse === option.value}
                onClick={() => handleCourseSelect(option.value)}
                icon={option.icon}
                label={t(option.labelKey)}
                body={t(option.bodyKey)}
              />
            ))}
          </Box>

          {course.interestCourse && course.interestCourse !== 'not_sure' && (
            <Box sx={{ mt: 3.5 }}>
              <Typography component="h2" sx={questionSx}>
                {t('yourCourse.programmeQuestion')}
              </Typography>
              <ProgrammePicker courseType={course.interestCourse} value={course.feeStructureId} onChange={handleProgrammePick} />
            </Box>
          )}

          {course.interestCourse === 'not_sure' && (
            <Box
              sx={{
                ...railCardSx(tk.gold500),
                mt: 2.5,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography component="p" sx={{ m: 0, flex: '1 1 220px', fontSize: 15, lineHeight: 1.5, color: tk.ink }}>
                {t('yourCourse.notSureFee')}
              </Typography>
              <Button variant="outlined" startIcon={<PhoneCallbackOutlined />} onClick={openCallback} sx={outlineButtonSx}>
                {t('yourCourse.askUsToCall')}
              </Button>
            </Box>
          )}
        </Box>

        {/* How to learn */}
        <Box component="section" aria-labelledby="apply-mode-q" sx={sectionSx}>
          <Typography id="apply-mode-q" component="h2" sx={questionSx}>
            {t('yourCourse.modeQuestion')}
          </Typography>
          <Box
            role="group"
            aria-labelledby="apply-mode-q"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 1 }}
          >
            <ChoiceCard
              selected={course.learningMode === 'hybrid'}
              onClick={() => handleLearningModeSelect('hybrid')}
              icon={<GroupsOutlined />}
              label={t('yourCourse.hybrid')}
              body={t('yourCourse.hybridBody')}
              bodySize={14}
            />
            <ChoiceCard
              selected={course.learningMode === 'online_only'}
              onClick={() => handleLearningModeSelect('online_only')}
              icon={<LaptopOutlined />}
              label={t('yourCourse.online')}
              body={t('yourCourse.onlineBody')}
              bodySize={14}
            />
          </Box>
        </Box>

        {/* Centre (hybrid only, optional) */}
        {course.learningMode === 'hybrid' && (
          <Box component="section" aria-labelledby="apply-centre-q" sx={sectionSx}>
            <Typography id="apply-centre-q" component="h2" sx={{ ...questionSx, mb: 0.5 }}>
              Choose your preferred centre (optional)
            </Typography>
            <Typography component="p" sx={{ m: 0, mb: 2, fontSize: 14, lineHeight: 1.5, color: tk.inkMuted }}>
              Pick a centre near you for offline classes. You can also choose later.
            </Typography>

            {centersLoading ? (
              <Box sx={centreGridSx} aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={88} sx={{ borderRadius: `${tk.radius}px` }} />
                ))}
              </Box>
            ) : centers.length === 0 ? (
              <Alert severity="info">
                No offline centres are open at the moment. You can still go ahead with online classes.
              </Alert>
            ) : (
              <>
                {uniqueCities.length > 1 && (
                  <Box sx={{ mb: 2, maxWidth: 320 }}>
                    <Field id="apply-centre-city" label="Filter by city">
                      <Select
                        id="apply-centre-city"
                        labelId="apply-centre-city-label"
                        fullWidth
                        value={centerCityFilter}
                        onChange={(e) => setCenterCityFilter(e.target.value as string)}
                      >
                        <MenuItem value="all" sx={{ minHeight: 48 }}>All cities</MenuItem>
                        {uniqueCities.map((city) => (
                          <MenuItem key={city} value={city} sx={{ minHeight: 48 }}>
                            {city}
                          </MenuItem>
                        ))}
                      </Select>
                    </Field>
                  </Box>
                )}

                <Box role="group" aria-labelledby="apply-centre-q" sx={centreGridSx}>
                  {filteredCenters.map((center) => {
                    const selected = course.selectedCenterId === center.id;
                    return (
                      <ButtonBase
                        key={center.id}
                        aria-pressed={selected}
                        onClick={() => handleCenterSelect(center)}
                        sx={selectedCardSx(selected, cardLayout)}
                      >
                        <Box component="span" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, width: '100%' }}>
                          <Typography component="span" sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35, color: tk.ink }}>
                            {center.name}
                          </Typography>
                          {selected && <CheckCircleOutlined aria-hidden sx={{ fontSize: 22, color: tk.navy900, flexShrink: 0 }} />}
                        </Box>
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LocationOnOutlined aria-hidden sx={{ fontSize: 16, color: tk.inkMuted }} />
                          <Typography component="span" sx={{ fontSize: 14, lineHeight: 1.45, color: tk.inkMuted }}>
                            {center.city}
                            {center.state ? `, ${center.state}` : ''}
                          </Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Box>
              </>
            )}

            <Button
              variant="text"
              onClick={() => setCentersDialogOpen(true)}
              sx={{ ...textLinkSx, mt: 1.5 }}
            >
              View all centres with directions
            </Button>
          </Box>
        )}

        {/* Your studies */}
        <Box sx={sectionSx}>
          <YourStudiesBlock />
        </Box>

        {/* The fee, then the callback band */}
        <Box sx={{ ...sectionSx, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {course.feeStructureLabel && (
            <FeeSummaryCard
              label={course.feeStructureLabel}
              feeAmount={pickedFee?.amount ?? null}
              comboExtraFee={course.interestCourse === 'both' ? pickedFee?.combo ?? 0 : 0}
              scholarship={
                formData.academic.applicantCategory === 'school_student' &&
                formData.academic.schoolType === 'government_school'
              }
            />
          )}

          <Box
            component="aside"
            aria-labelledby="apply-callback-title"
            sx={{
              bgcolor: tk.navy900,
              borderRadius: `${tk.radius}px`,
              px: 3,
              py: 2.5,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ flex: '1 1 260px' }}>
              <Typography id="apply-callback-title" component="h2" sx={{ m: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.35, color: tk.paper }}>
                Need more information?
              </Typography>
              <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: 14, lineHeight: 1.5, color: tk.paperMuted }}>
                Our counsellors can help you choose the right course and answer your questions.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<PhoneCallbackOutlined />}
              onClick={openCallback}
              sx={{
                minHeight: 48,
                px: 2,
                borderRadius: `${tk.radius}px`,
                border: `1px solid ${tk.outlineDark}`,
                bgcolor: 'transparent',
                color: tk.paper,
                fontSize: 15,
                fontWeight: 600,
                '&:hover': { bgcolor: 'transparent', borderColor: tk.gold500 },
                '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '2px' },
              }}
            >
              {t('yourCourse.askUsToCall')}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ============================================ */}
      {/* CENTRES DETAIL DIALOG */}
      {/* ============================================ */}
      <Dialog
        open={centersDialogOpen}
        onClose={() => setCentersDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="md"
        fullWidth
        aria-labelledby="apply-centres-dialog-title"
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : `${tk.radius}px` } }}
      >
        <DialogTitle id="apply-centres-dialog-title" sx={dialogTitleSx}>
          Our learning centres
          <IconButton onClick={() => setCentersDialogOpen(false)} aria-label="Close" sx={closeButtonSx}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: tk.line }}>
          {/* City filter pills */}
          <ToggleButtonGroup
            exclusive
            aria-label="Filter by city"
            value={centerCityFilter}
            onChange={(_, next: string | null) => next && setCenterCityFilter(next)}
            sx={{ flexWrap: 'nowrap', overflowX: 'auto', pb: 1, mb: 2, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
          >
            <ToggleButton value="all" sx={{ flexShrink: 0, minHeight: 44 }}>
              All cities
            </ToggleButton>
            {uniqueCities.map((city) => (
              <ToggleButton key={city} value={city} sx={{ flexShrink: 0, minHeight: 44 }}>
                {city}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Centre cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 2 }}>
            {filteredCenters.map((center) => {
              const selected = course.selectedCenterId === center.id;
              return (
                <Box
                  key={center.id}
                  sx={selectedCardSx(selected, { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 18px', height: '100%' })}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Typography component="h3" sx={{ m: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.35, color: tk.ink }}>
                      {center.name}
                    </Typography>
                    {selected && <CheckCircleOutlined aria-hidden sx={{ fontSize: 22, color: tk.navy900, flexShrink: 0 }} />}
                  </Box>

                  <Box sx={dialogRowSx}>
                    <LocationOnOutlined aria-hidden sx={dialogIconSx} />
                    <Typography component="p" sx={dialogTextSx}>
                      {center.address}
                      <br />
                      {center.city}, {center.state} {center.pincode}
                    </Typography>
                  </Box>

                  {center.preferred_visit_times && center.preferred_visit_times.length > 0 && (
                    <Box sx={dialogRowSx}>
                      <ScheduleOutlined aria-hidden sx={dialogIconSx} />
                      <Typography component="p" sx={dialogTextSx}>
                        Visiting: {center.preferred_visit_times.join(', ')}
                      </Typography>
                    </Box>
                  )}

                  {center.contact_phone && (
                    <Box sx={dialogRowSx}>
                      <PhoneOutlined aria-hidden sx={dialogIconSx} />
                      <Box
                        component="a"
                        href={`tel:${center.contact_phone}`}
                        sx={{ fontSize: 14, fontWeight: 600, color: tk.ink, textDecoration: 'underline', '&:focus-visible': { outline: tk.focusOutline, outlineOffset: '2px' } }}
                      >
                        {center.contact_phone}
                      </Box>
                    </Box>
                  )}

                  {center.facilities && center.facilities.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {center.facilities.map((facility) => (
                        <Box
                          key={facility}
                          component="span"
                          sx={{ px: 1, py: 0.25, borderRadius: '4px', border: `1px solid ${tk.line}`, bgcolor: tk.ground, fontSize: 12, fontWeight: 600, color: tk.inkMuted }}
                        >
                          {facility}
                        </Box>
                      ))}
                    </Box>
                  )}

                  <Box sx={{ mt: 'auto', pt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {selected ? (
                      <Button variant="contained" onClick={() => handleSelectCenterFromDialog(center)} sx={{ minHeight: 44 }}>
                        Selected
                      </Button>
                    ) : (
                      <Button variant="outlined" onClick={() => handleSelectCenterFromDialog(center)} sx={outlineButtonSx}>
                        Select this centre
                      </Button>
                    )}
                    <Button
                      variant="text"
                      startIcon={<DirectionsOutlined />}
                      onClick={() => handleGetDirections(center)}
                      sx={{ ...textLinkSx, px: 1 }}
                    >
                      Directions
                    </Button>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {filteredCenters.length === 0 && (
            <Typography component="p" sx={{ m: 0, py: 4, fontSize: 15, color: tk.inkMuted }}>
              No centres found in this city.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCentersDialogOpen(false)} variant="contained" sx={{ minHeight: 48, px: 3 }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* CALLBACK REQUEST DIALOG */}
      {/* ============================================ */}
      <Dialog
        open={callbackDialogOpen}
        onClose={() => setCallbackDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        aria-labelledby="apply-callback-dialog-title"
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : `${tk.radius}px` } }}
      >
        <DialogTitle id="apply-callback-dialog-title" sx={dialogTitleSx}>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box component="span" sx={iconTile40Sx}>
              <PhoneCallbackOutlined aria-hidden />
            </Box>
            Request a callback
          </Box>
          <IconButton onClick={() => setCallbackDialogOpen(false)} aria-label="Close" sx={closeButtonSx}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: tk.line }}>
          {callbackSuccess ? (
            <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }} role="status">
              <Box component="span" sx={{ ...iconTile40Sx, width: 56, height: 56, '& svg': { fontSize: 30 } }}>
                <CheckOutlined aria-hidden />
              </Box>
              <Typography component="h3" sx={{ m: 0, fontSize: 20, fontWeight: 800, color: tk.ink }}>
                Callback requested
              </Typography>
              <Typography component="p" sx={{ m: 0, fontSize: 15, lineHeight: 1.5, color: tk.inkMuted }}>
                Our counsellors will call you soon to help with your questions.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeOutlined aria-hidden sx={{ fontSize: 18, color: tk.inkMuted }} />
                <Typography component="p" sx={{ m: 0, fontSize: 14, color: tk.inkMuted }}>
                  Usually within 2 to 4 hours during business hours
                </Typography>
              </Box>
            </Box>
          ) : !user || !isPhoneVerified ? (
            <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <Typography component="p" sx={{ m: 0, fontSize: 15, lineHeight: 1.5, color: tk.ink }}>
                {!user
                  ? 'Please complete the login and phone verification in the application form first, then request a callback.'
                  : 'Please verify your phone number in Step 1 (About you) first. We need a verified phone number to call you back.'}
              </Typography>
              <Button variant="contained" onClick={() => setCallbackDialogOpen(false)} sx={{ minHeight: 48, px: 3 }}>
                Go back to the form
              </Button>
            </Box>
          ) : (
            <Stack spacing={3} sx={{ mt: 1 }}>
              {callbackError && (
                <Alert severity="error" onClose={() => setCallbackError(null)}>
                  {callbackError}
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '20px 16px' }}>
                <Field id="apply-callback-name" label="Your name">
                  <TextField
                    id="apply-callback-name"
                    hiddenLabel
                    fullWidth
                    value={formData.personal.firstName || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Field>
                <Field id="apply-callback-phone" label="Your phone">
                  <TextField
                    id="apply-callback-phone"
                    hiddenLabel
                    fullWidth
                    value={formData.personal.phone?.replace(/^\+91/, '') || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Field>
              </Box>

              <Box>
                <Typography id="apply-callback-slot" component="p" sx={{ m: 0, mb: 1, fontSize: 15, fontWeight: 600, color: tk.ink }}>
                  Preferred time for the call (optional)
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  aria-labelledby="apply-callback-slot"
                  value={callbackSlot}
                  onChange={(_, next: TimeSlot | null) => setCallbackSlot(next)}
                  sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1 }}
                >
                  {(['morning', 'afternoon', 'evening'] as TimeSlot[]).map((slot) => (
                    <ToggleButton key={slot} value={slot}>
                      {slot.charAt(0).toUpperCase() + slot.slice(1)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>

              <Field id="apply-callback-notes" label="Any specific questions? (optional)">
                <TextField
                  id="apply-callback-notes"
                  hiddenLabel
                  placeholder="E.g., fee structure, batch timings, centre facilities"
                  value={callbackNotes}
                  onChange={(e) => setCallbackNotes(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                />
              </Field>
            </Stack>
          )}
        </DialogContent>
        {!callbackSuccess && user && isPhoneVerified && (
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button onClick={() => setCallbackDialogOpen(false)} sx={{ minHeight: 48, px: 2, color: tk.ink }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCallbackSubmit}
              disabled={callbackSubmitting}
              startIcon={
                callbackSubmitting ? <CircularProgress size={20} color="inherit" /> : <PhoneCallbackOutlined />
              }
              sx={{ minHeight: 48, px: 3 }}
            >
              {callbackSubmitting ? 'Submitting' : 'Request callback'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}

// @ts-nocheck
'use client';

import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LaptopIcon from '@mui/icons-material/Laptop';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import KeyIcon from '@mui/icons-material/Key';
import LockIcon from '@mui/icons-material/Lock';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import AppleIcon from '@mui/icons-material/Apple';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'need_help';

const ICON_MAP: Record<string, React.ElementType> = {
  WhatsApp: WhatsAppIcon,
  Laptop: LaptopIcon,
  Groups: GroupsIcon,
  Person: PersonIcon,
  Key: KeyIcon,
  Lock: LockIcon,
};

const DEVICE_LABELS: Record<string, { icon: React.ElementType; label: string }> = {
  android: { icon: PhoneAndroidIcon, label: 'Android' },
  ios: { icon: AppleIcon, label: 'iPhone / iPad' },
  desktop: { icon: DesktopWindowsIcon, label: 'Desktop' },
};

function getDeviceType(): 'android' | 'ios' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

interface StepCardProps {
  step: {
    id: string;
    is_completed: boolean;
    status: string;
    step_definition: {
      step_key: string;
      title: string;
      description: string | null;
      icon_name: string | null;
      action_type: string;
      action_config: Record<string, any>;
    };
  };
  isUpdating: boolean;
  disabled?: boolean;
  onToggle: (progressId: string, status: StepStatus) => void;
  onAction: (step: any) => void;
  children?: React.ReactNode;
}

export default function StepCard({
  step,
  isUpdating,
  disabled,
  onToggle,
  onAction,
  children,
}: StepCardProps) {
  const deviceType = useMemo(() => getDeviceType(), []);
  const def = step.step_definition;
  const stepStatus = (step.status || (step.is_completed ? 'completed' : 'pending')) as StepStatus;
  const IconComponent = def.icon_name ? ICON_MAP[def.icon_name] : null;
  const hasDeviceUrl = def.action_config?.[deviceType];
  const deviceInfo = DEVICE_LABELS[deviceType];
  const url = def.action_config?.[deviceType] || def.action_config?.url;
  const isLocked = disabled && stepStatus !== 'completed';

  const handleCardClick = () => {
    if (isUpdating || isLocked) return;
    // Only toggle for simple steps (not special in_app steps with children)
    if (children) return;
    if (def.action_type === 'link' && url) {
      onAction(step);
    } else if (def.action_type === 'manual') {
      if (stepStatus === 'completed') {
        onToggle(step.id, 'pending');
      } else {
        onToggle(step.id, 'completed');
      }
    }
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUpdating || isLocked) return;
    if (stepStatus === 'completed') {
      onToggle(step.id, 'pending');
    } else {
      onToggle(step.id, 'completed');
    }
  };

  return (
    <Paper
      elevation={0}
      onClick={handleCardClick}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: stepStatus === 'completed' ? 'success.light' : stepStatus === 'need_help' ? 'warning.light' : 'divider',
        bgcolor: stepStatus === 'completed' ? 'success.50' : stepStatus === 'need_help' ? 'warning.50' : 'background.paper',
        opacity: isUpdating ? 0.7 : isLocked ? 0.5 : 1,
        cursor: isLocked ? 'not-allowed' : children ? 'default' : 'pointer',
        transition: 'all 0.2s',
        ...(!isLocked && !children && {
          '&:hover': {
            borderColor: 'primary.main',
            transform: 'translateY(-1px)',
            boxShadow: 1,
          },
        }),
      }}
    >
      <Box display="flex" alignItems="flex-start" gap={1.5}>
        {/* Status Icon — always clickable */}
        <Box
          sx={{
            mt: 0.25,
            cursor: isLocked ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
          onClick={handleToggleClick}
        >
          {isUpdating ? (
            <CircularProgress size={24} />
          ) : stepStatus === 'completed' ? (
            <CheckCircleIcon sx={{ fontSize: 24, color: 'success.main' }} />
          ) : stepStatus === 'need_help' ? (
            <HelpOutlineIcon sx={{ fontSize: 24, color: 'warning.main' }} />
          ) : (
            <RadioButtonUncheckedIcon sx={{ fontSize: 24, color: isLocked ? 'grey.300' : 'grey.400' }} />
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
            {IconComponent && (
              <IconComponent sx={{ fontSize: 18, color: stepStatus === 'completed' ? 'success.main' : 'text.secondary' }} />
            )}
            <Typography
              variant="body1"
              fontWeight={600}
              sx={{
                textDecoration: stepStatus === 'completed' ? 'line-through' : 'none',
                color: stepStatus === 'completed' ? 'text.secondary' : isLocked ? 'text.disabled' : 'text.primary',
              }}
            >
              {def.title}
            </Typography>
          </Box>

          {def.description && (
            <Typography variant="body2" color="text.secondary" mb={1}>
              {def.description}
            </Typography>
          )}

          {/* Device badge */}
          {hasDeviceUrl && deviceInfo && stepStatus !== 'completed' && !isLocked && (
            <Chip
              icon={<deviceInfo.icon sx={{ fontSize: 14 }} />}
              label={`For ${deviceInfo.label}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 22, mb: 1 }}
            />
          )}

          {/* Custom children (CredentialCard, ConfirmTerms, NexusPoller, etc.) */}
          {children}

          {/* Action Buttons */}
          {stepStatus !== 'completed' && !isLocked && !children && (
            <Box display="flex" gap={1} flexWrap="wrap" mt={0.5}>
              {(def.action_type === 'link' || def.action_type === 'in_app') && url && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onAction(step);
                  }}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  disabled={isUpdating}
                  sx={{
                    borderRadius: 1, textTransform: 'none', fontWeight: 600,
                    fontSize: '0.8rem', minHeight: 40,
                  }}
                >
                  {def.step_key === 'join_whatsapp' ? 'Join Group' :
                   def.step_key.startsWith('install_') ? 'Install' : 'Open'}
                </Button>
              )}

              {stepStatus !== 'need_help' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onToggle(step.id, 'need_help');
                  }}
                  disabled={isUpdating}
                  sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.75rem', minHeight: 40 }}
                >
                  Need Help
                </Button>
              )}

              {stepStatus === 'need_help' && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<WhatsAppIcon sx={{ fontSize: 16 }} />}
                  href={`https://wa.me/916380194614?text=${encodeURIComponent(
                    `Hi, I need help with "${def.title}" during my onboarding at Neram Classes.`
                  )}`}
                  target="_blank"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  sx={{
                    borderRadius: 1, textTransform: 'none', fontWeight: 600,
                    fontSize: '0.8rem', minHeight: 40, bgcolor: '#25D366',
                    '&:hover': { bgcolor: '#1DA851' },
                  }}
                >
                  Message Us
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

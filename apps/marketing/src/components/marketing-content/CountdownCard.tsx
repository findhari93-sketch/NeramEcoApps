'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Chip, Card, CardContent } from '@neram/ui';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventIcon from '@mui/icons-material/Event';

interface CountdownCardProps {
  title: string;
  description: string;
  metadata: {
    target_date: string;
    original_date?: string | null;
    is_extended?: boolean;
    event_type: string;
  };
}

function calculateTimeLeft(targetDate: string) {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  };
}

const eventTypeLabels: Record<string, string> = {
  application_deadline: 'Application Deadline',
  exam_date: 'Exam Date',
  result_date: 'Result Date',
  other: 'Important Date',
};

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 48 }}>
      <Typography
        variant="h4"
        component="div"
        fontWeight={800}
        sx={{ lineHeight: 1.2 }}
      >
        {String(value).padStart(2, '0')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function CountdownCard({ title, description, metadata }: CountdownCardProps) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(metadata.target_date));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(metadata.target_date));
    }, 1000);
    return () => clearInterval(timer);
  }, [metadata.target_date]);

  const isUrgent = timeLeft.days < 3 && !timeLeft.expired;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderTop: '4px solid',
        borderColor: timeLeft.expired ? 'text.disabled' : isUrgent ? 'error.main' : 'primary.main',
        transition: 'transform 0.2s',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 } }}>
        {/* Event type + Extended badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            icon={<EventIcon sx={{ fontSize: 16 }} />}
            label={eventTypeLabels[metadata.event_type] || metadata.event_type}
            size="small"
            color={isUrgent ? 'error' : 'primary'}
            variant="outlined"
          />
          {metadata.is_extended && (
            <Chip label="Extended!" size="small" color="warning" />
          )}
        </Box>

        {/* Title */}
        <Typography variant="h6" component="div" fontWeight={700} gutterBottom>
          {title}
        </Typography>

        {/* Countdown */}
        {!timeLeft.expired ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: { xs: 1, sm: 2 },
              my: 2,
              py: 2,
              bgcolor: isUrgent ? 'error.50' : 'grey.50',
              borderRadius: 2,
            }}
          >
            <TimeUnit value={timeLeft.days} label="DAYS" />
            <Typography variant="h4" sx={{ lineHeight: 1.2, color: 'text.secondary' }}>:</Typography>
            <TimeUnit value={timeLeft.hours} label="HRS" />
            <Typography variant="h4" sx={{ lineHeight: 1.2, color: 'text.secondary' }}>:</Typography>
            <TimeUnit value={timeLeft.minutes} label="MIN" />
            <Typography variant="h4" sx={{ lineHeight: 1.2, color: 'text.secondary' }}>:</Typography>
            <TimeUnit value={timeLeft.seconds} label="SEC" />
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', my: 2, py: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
            <Typography variant="body1" color="text.secondary">
              This date has passed
            </Typography>
          </Box>
        )}

        {/* Original date strikethrough */}
        {metadata.is_extended && metadata.original_date && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Original date:{' '}
            <span style={{ textDecoration: 'line-through' }}>
              {new Date(metadata.original_date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </Typography>
        )}

        {/* Description */}
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        )}

        {/* Target date display */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 2 }}>
          <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            {new Date(metadata.target_date).toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, UserAvatar, Chip, Skeleton, IconButton, Link, ImageViewerDialog } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import LanguageIcon from '@mui/icons-material/Language';

interface SeniorWork {
  id: string;
  original_image_url: string;
  tutor_rating: number | null;
}

interface Senior {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  college_name: string | null;
  course_branch: string | null;
  exam_name: string | null;
  exam_result: string | null;
  achievement_note: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
  works: SeniorWork[];
}

interface FeaturedSeniorsProps {
  getToken: () => Promise<string | null>;
  academicYear?: string;
  collegeId?: string;
}

const normalizeUrl = (href: string, base?: string) =>
  href.startsWith('http') ? href : `https://${base ? base.replace(/^@/, '') : ''}${href.replace(/^@/, '')}`;

/**
 * The "Seniors who inspire" strip at the top of the Hall of Fame: a horizontally
 * scrollable row of senior cards (achievement + their best drawings). Mobile-first;
 * renders nothing when no seniors are showcased so the works feed stands alone.
 */
export default function FeaturedSeniors({ getToken, academicYear, collegeId }: FeaturedSeniorsProps) {
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ src: string; name?: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (academicYear) params.set('academicYear', academicYear);
      if (collegeId) params.set('collegeId', collegeId);
      const res = await fetch(`/api/drawing/gallery/seniors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSeniors(data.seniors || []);
    } catch {
      setSeniors([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, academicYear, collegeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width={180} height={28} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', gap: 1.5, overflow: 'hidden' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width={280} height={210} sx={{ flexShrink: 0, borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }

  if (seniors.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, px: 0.5 }}>
        <EmojiEventsOutlinedIcon sx={{ color: '#B45309', fontSize: 22 }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={800} lineHeight={1.1}>
            Seniors who inspire
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Where your Neram seniors reached. Aim higher.
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          pb: 1,
          px: 0.5,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 3 },
        }}
      >
        {seniors.map((s) => {
          const achievement = [s.exam_name, s.exam_result].filter(Boolean).join(': ');
          return (
            <Paper
              key={s.user_id}
              variant="outlined"
              sx={{
                flexShrink: 0,
                width: 290,
                maxWidth: '85vw',
                p: 1.5,
                borderRadius: 2.5,
                scrollSnapAlign: 'start',
                borderColor: 'rgba(180,83,9,0.25)',
                background: 'linear-gradient(180deg, #FFFBF5 0%, #ffffff 60%)',
              }}
            >
              {/* Identity */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <UserAvatar src={s.avatar_url} name={s.name} sx={{ width: 48, height: 48 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800} noWrap>
                    {s.name || 'Neram senior'}
                  </Typography>
                  {s.academic_year && (
                    <Typography variant="caption" color="text.secondary">
                      Batch {s.academic_year}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  {s.linkedin_url && (
                    <IconButton size="small" component={Link} href={normalizeUrl(s.linkedin_url)} target="_blank" rel="noopener" aria-label="LinkedIn" sx={{ color: '#0A66C2' }}>
                      <LinkedInIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  )}
                  {s.instagram_url && (
                    <IconButton size="small" component={Link} href={normalizeUrl(s.instagram_url, 'instagram.com/')} target="_blank" rel="noopener" aria-label="Instagram" sx={{ color: '#E1306C' }}>
                      <InstagramIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  )}
                  {s.portfolio_url && (
                    <IconButton size="small" component={Link} href={normalizeUrl(s.portfolio_url)} target="_blank" rel="noopener" aria-label="Portfolio" sx={{ color: 'text.secondary' }}>
                      <LanguageIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>

              {/* Achievement */}
              {achievement && (
                <Chip
                  icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                  label={achievement}
                  size="small"
                  sx={{ mt: 1, height: 24, fontSize: '0.72rem', fontWeight: 700, bgcolor: 'rgba(217,119,6,0.14)', color: '#92400E', '& .MuiChip-icon': { color: '#B45309' } }}
                />
              )}
              {s.college_name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                  <SchoolOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }} noWrap>
                    {s.college_name}
                    {s.course_branch ? ` · ${s.course_branch}` : ''}
                  </Typography>
                </Box>
              )}
              {s.achievement_note && (
                <Typography
                  variant="caption"
                  sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'text.secondary', fontStyle: 'italic', mt: 0.75 }}
                >
                  {s.achievement_note}
                </Typography>
              )}

              {/* Their best works */}
              {s.works.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25 }}>
                  {s.works.slice(0, 4).map((w) => (
                    <Box
                      key={w.id}
                      onClick={() => setViewer({ src: w.original_image_url, name: s.name })}
                      role="button"
                      aria-label={`View drawing by ${s.name || 'senior'}`}
                      sx={{
                        width: 58,
                        height: 58,
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        border: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&:hover': { borderColor: '#B45309' },
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={w.original_image_url}
                        alt={`Drawing by ${s.name || 'senior'}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#f3f4f6' }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          );
        })}
      </Box>

      <ImageViewerDialog
        open={!!viewer}
        onClose={() => setViewer(null)}
        src={viewer?.src || ''}
        name={viewer?.name}
        alt={`Drawing by ${viewer?.name || 'senior'}`}
      />
    </Box>
  );
}

'use client';

/**
 * /demo-class: book a free live demo.
 *
 * The booking card sits in the hero so a phone visitor can pick a day before
 * scrolling. Everything below it answers "why bother": what happens in the
 * demo, what Nexus looks like, why parents should come, and how it compares
 * with offline coaching. Sign-in happens only at the last step of the card.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { alpha } from '@mui/material/styles';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Container,
  Paper,
  Slide,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import { ClassVideo } from '@/components/coaching-location/ClassVideo';
import DemoBookingCard from '@/components/demo-class/DemoBookingCard';
import { COMPARISON, DEMO_FAQ, DEMO_STEPS, NEXUS_SHOTS, PARENT_POINTS } from '@/components/demo-class/demo-content';

const SHOT_ICON: Record<string, typeof PhoneIphoneIcon> = {
  nexus: PhoneIphoneIcon,
  tutor: AutoAwesomeIcon,
  assistant: ForumOutlinedIcon,
  drawing: BrushOutlinedIcon,
};

const STEP_ICON = [SchoolOutlinedIcon, PhoneIphoneIcon, QuestionAnswerOutlinedIcon];

function scrollToBooking() {
  const el = document.getElementById('book');
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function youtubeId(url: string | null): string | null {
  if (!url) return null;
  return url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/)?.[1] ?? null;
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <Box sx={{ mb: { xs: 2.5, md: 4 }, maxWidth: 680 }}>
      <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: 1 }}>
        {eyebrow}
      </Typography>
      <Typography variant="h4" component="h2" fontWeight={800} sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, lineHeight: 1.25 }}>
        {title}
      </Typography>
      {sub && (
        <Typography color="text.secondary" sx={{ mt: 1, fontSize: { xs: '1rem', md: '1.1rem' } }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Mobile-only bar that brings the booking card back once it scrolls away. */
function StickyBookBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById('book');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Slide direction="up" in={show} appear={false}>
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          p: 1.5,
          pb: 'calc(12px + env(safe-area-inset-bottom))',
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <Button variant="contained" fullWidth size="large" onClick={scrollToBooking} sx={{ minHeight: 52, fontWeight: 800 }}>
          Book your free demo
        </Button>
      </Box>
    </Slide>
  );
}

function SampleVideo() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/demo-class/settings')
      .then((r) => r.json())
      .then((d) => setId(youtubeId(d?.settings?.youtube_video_url ?? null)))
      .catch(() => {});
  }, []);
  if (!id) return null;
  return (
    <Box sx={{ maxWidth: 720 }}>
      <ClassVideo youtubeId={id} title="Watch a real Neram class" />
    </Box>
  );
}

export default function DemoClassPageContent() {
  return (
    <Box sx={{ bgcolor: 'background.default', pb: { xs: 10, md: 0 } }}>
      {/* Hero with the booking card */}
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', pt: { xs: 2, md: 7 }, pb: { xs: 3, md: 7 } }}>
        <Container maxWidth="lg" sx={{ px: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.05fr) minmax(0, 0.95fr)' },
              gap: { xs: 2.5, md: 6 },
              alignItems: 'start',
            }}
          >
            <Box sx={{ pt: { md: 2 } }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: { xs: 1, md: 1.5 } }}>
                {['Free', 'Live on Teams', 'About 45 minutes'].map((t) => (
                  <Box
                    key={t}
                    component="span"
                    sx={{ px: 1.25, py: 0.5, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.16)', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    {t}
                  </Box>
                ))}
              </Box>
              <Typography
                variant="h1"
                sx={{ fontSize: { xs: '1.5rem', sm: '2.25rem', md: '3rem' }, fontWeight: 800, lineHeight: 1.2, color: 'inherit' }}
              >
                Experience an AI-powered NATA and JEE Paper 2 classroom, free
              </Typography>
              <Typography sx={{ mt: 1.5, fontSize: { xs: '1rem', md: '1.2rem' }, opacity: 0.92, maxWidth: 560, display: { xs: 'none', sm: 'block' } }}>
                Sit in a live class with an architect, tour the Nexus app, and ask every question you have. Parents are welcome.
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5, display: { xs: 'none', sm: 'grid' }, gap: 1 }}>
                {[
                  'Pick a day and a time of day. We call to fix the exact time.',
                  'Get the Teams link on WhatsApp and in your calendar.',
                  'Send us any drawing for personal feedback from an architect.',
                ].map((t) => (
                  <Box component="li" key={t} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <CheckIcon aria-hidden sx={{ fontSize: 20, mt: '2px' }} />
                    <Typography sx={{ color: 'inherit' }}>{t}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box id="book" sx={{ scrollMarginTop: 80, color: 'text.primary' }}>
              <DemoBookingCard />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* What happens */}
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 5, md: 9 } }}>
        <SectionHeading eyebrow="Your 45 minutes" title="What happens in your free demo" />
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {DEMO_STEPS.map((s, i) => {
            const Icon = STEP_ICON[i];
            return (
              <Paper component="li" key={s.title} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    aria-hidden
                    sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Icon />
                  </Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={800}>
                    STEP {i + 1}
                  </Typography>
                </Box>
                <Typography variant="h6" component="h3" fontWeight={800} sx={{ mt: 1.5 }}>
                  {s.title}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {s.body}
                </Typography>
              </Paper>
            );
          })}
        </Box>
        <Box sx={{ mt: 4 }}>
          <SampleVideo />
        </Box>
      </Container>

      {/* Inside Nexus */}
      <Box sx={{ bgcolor: 'action.hover', py: { xs: 5, md: 9 } }}>
        <Container maxWidth="lg" sx={{ px: 2 }}>
          <SectionHeading
            eyebrow="Inside the classroom"
            title="A classroom designed by architects and software engineers"
            sub="Neram runs on Nexus, our own learning app. In the demo you will see it working."
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
            {NEXUS_SHOTS.map((s) => {
              const Icon = SHOT_ICON[s.key] ?? PhoneIphoneIcon;
              return (
                <Paper key={s.key} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: 'background.paper' }}>
                  <Box
                    sx={{
                      position: 'relative',
                      // Real screenshots get a 4:3 frame; the icon stand-in stays a short tinted strip.
                      aspectRatio: s.src ? '4 / 3' : '16 / 6',
                      bgcolor: (t) => (s.src ? t.palette.action.hover : alpha(t.palette.primary.main, 0.08)),
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {s.src ? (
                      <Image src={s.src} alt={s.alt} fill sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 25vw" style={{ objectFit: 'cover' }} />
                    ) : (
                      <Icon aria-hidden sx={{ fontSize: 44 }} />
                    )}
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <Typography variant="h6" component="h3" fontWeight={800} sx={{ fontSize: '1.05rem' }}>
                      {s.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {s.body}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Container>
      </Box>

      {/* Parents */}
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 5, md: 9 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: { xs: 2.5, md: 6 }, alignItems: 'center' }}>
          <Box>
            <FamilyRestroomIcon aria-hidden color="primary" sx={{ fontSize: 44 }} />
            <SectionHeading
              eyebrow="For parents"
              title="Join the demo with your child"
              sub="This is the best hour to ask us anything. See how a real class runs, meet the faculty and decide together."
            />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {PARENT_POINTS.map((p) => (
              <Paper key={p.title} variant="outlined" sx={{ p: 2, borderRadius: 3, display: 'flex', gap: 1.5 }}>
                <CheckIcon aria-hidden color="success" sx={{ mt: '2px' }} />
                <Box>
                  <Typography fontWeight={800}>{p.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {p.body}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      </Container>

      {/* Comparison */}
      <Box sx={{ bgcolor: 'action.hover', py: { xs: 5, md: 9 } }}>
        <Container maxWidth="md" sx={{ px: 2 }}>
          <SectionHeading eyebrow="Online, done properly" title="Why students choose Neram over offline coaching" />
          {/* Cards on phones, a table from tablet up: no sideways scrolling at 375px. */}
          <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.5 }}>
            {COMPARISON.map((c) => (
              <Paper key={c.topic} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="overline" color="text.secondary" fontWeight={800}>
                  {c.topic}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Offline: {c.offline}
                </Typography>
                <Typography fontWeight={700} sx={{ mt: 0.5, display: 'flex', gap: 0.75 }}>
                  <CheckIcon aria-hidden color="success" fontSize="small" sx={{ mt: '2px' }} />
                  Neram: {c.neram}
                </Typography>
              </Paper>
            ))}
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', sm: 'block' }, borderRadius: 3 }}>
            <Table aria-label="Offline coaching compared with Neram">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell sx={{ fontWeight: 800 }}>Typical offline coaching</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: 'primary.main' }}>Neram</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {COMPARISON.map((c) => (
                  <TableRow key={c.topic}>
                    <TableCell component="th" scope="row" sx={{ fontWeight: 700 }}>
                      {c.topic}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{c.offline}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        <CheckIcon aria-hidden color="success" fontSize="small" sx={{ mt: '2px' }} />
                        {c.neram}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Container>
      </Box>

      {/* Drawing hook */}
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 5, md: 9 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 5 }, borderRadius: 4, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 3, alignItems: 'center' }}>
          <Box>
            <BrushOutlinedIcon aria-hidden color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h4" component="h2" fontWeight={800} sx={{ fontSize: { xs: '1.4rem', md: '1.9rem' }, mt: 1 }}>
              Love to draw? Get feedback from an architect
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 640 }}>
              After you book, send us any drawing on WhatsApp. It does not have to be exam work: we look at the quality of
              your hand, not the topic. An architect replies with a voice note on what is impressive and what to try next.
            </Typography>
          </Box>
          <Button variant="contained" size="large" onClick={scrollToBooking} sx={{ minHeight: 52, fontWeight: 800 }}>
            Book my demo first
          </Button>
        </Paper>
      </Container>

      {/* FAQ */}
      <Container maxWidth="md" sx={{ px: 2, pb: { xs: 5, md: 9 } }}>
        <SectionHeading eyebrow="Questions" title="Before you book" />
        {DEMO_FAQ.map((f) => (
          <Accordion key={f.q} disableGutters variant="outlined" sx={{ '&:not(:last-of-type)': { borderBottom: 0 }, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}>
              <Typography fontWeight={700}>{f.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary">{f.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Button variant="contained" size="large" startIcon={<VideocamOutlinedIcon />} onClick={scrollToBooking} sx={{ minHeight: 52, fontWeight: 800 }}>
            Book your free demo
          </Button>
        </Box>
      </Container>

      <StickyBookBar />
    </Box>
  );
}

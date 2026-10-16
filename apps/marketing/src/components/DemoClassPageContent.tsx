'use client';

/**
 * /demo-class: book a free live demo.
 *
 * The booking card sits in the hero aside so a phone visitor can pick a day
 * before scrolling (on phones the lede and checklist are hidden so the card
 * stays near the top). Everything below answers "why bother": what happens in
 * the demo, what Nexus looks like, why parents should come, and how it
 * compares with offline coaching. Sign-in happens only at the last step.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Box, Slide, Typography } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import {
  PageHero,
  LightScope,
  Section,
  SectionHeader,
  FeatureCard,
  CheckList,
  InlineCta,
  FaqList,
  CtaBand,
  CtaButton,
  iconTileSx,
  tokens as t,
} from '@/design-system';
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

const HERO_POINTS = [
  'Pick a day and a time of day. We call to fix the exact time.',
  'Get the Teams link on WhatsApp and in your calendar.',
  'Send us any drawing for personal feedback from an architect.',
];

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
          bgcolor: t.surface,
          borderTop: `1px solid ${t.line}`,
        }}
      >
        <CtaButton fullWidth onClick={scrollToBooking}>
          Book your free demo
        </CtaButton>
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

const cardSx = {
  bgcolor: t.surface,
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  overflow: 'hidden',
} as const;

export default function DemoClassPageContent() {
  return (
    <Box sx={{ pb: { xs: 10, md: 0 } }}>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Demo Class' }]}
        pills={['Free', 'Live on Teams', 'About 45 minutes']}
        title={
          <>
            Experience an AI-powered <em>NATA and JEE Paper 2</em> classroom, free
          </>
        }
        asideMin={440}
        aside={
          <LightScope variant="card" id="book" sx={{ scrollMarginTop: 80 }}>
            <DemoBookingCard />
          </LightScope>
        }
      >
        {/* Hidden on phones so the booking card stays near the top of the screen */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', gap: 2 }}>
          <Typography variant="lede" sx={{ m: 0, maxWidth: 540, color: t.paperMuted }}>
            Sit in a live class with an architect, tour the Nexus app, and ask every question you have. Parents are welcome.
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {HERO_POINTS.map((p) => (
              <Box component="li" key={p} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', fontSize: '1rem', lineHeight: 1.45 }}>
                <CheckIcon aria-hidden sx={{ fontSize: 20, color: t.gold500, mt: '1px' }} />
                {p}
              </Box>
            ))}
          </Box>
        </Box>
      </PageHero>

      {/* What happens */}
      <Section id="what-happens" rule={false} header={{ align: 'start', eyebrow: 'Your 45 minutes', title: 'What happens in your free demo' }}>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 2 }}>
          {DEMO_STEPS.map((s, i) => {
            const Icon = STEP_ICON[i] ?? SchoolOutlinedIcon;
            return (
              <Box component="li" key={s.title}>
                <FeatureCard icon={<Icon />} kicker={`Step ${i + 1}`} title={s.title} body={s.body} />
              </Box>
            );
          })}
        </Box>
        <SampleVideo />
      </Section>

      {/* Inside Nexus */}
      <Section
        id="inside-nexus"
        tone="white"
        header={{
          align: 'start',
          eyebrow: 'Inside the classroom',
          title: 'A classroom designed by architects and software engineers',
          lede: 'Neram runs on Nexus, our own learning app. In the demo you will see it working.',
          ledeWidth: 680,
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 2 }}>
          {NEXUS_SHOTS.map((s) => {
            const Icon = SHOT_ICON[s.key] ?? PhoneIphoneIcon;
            return (
              <Box key={s.key} sx={{ ...cardSx, bgcolor: t.ground }}>
                <Box
                  sx={{
                    position: 'relative',
                    // Real screenshots get a 4:3 frame; the icon stand-in is a short navy blueprint strip.
                    aspectRatio: s.src ? '4 / 3' : '16 / 6',
                    bgcolor: t.navy900,
                    ...(!s.src && t.blueprint),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {s.src ? (
                    <Image src={s.src} alt={s.alt} fill sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 25vw" style={{ objectFit: 'cover' }} />
                  ) : (
                    <Box aria-hidden sx={{ ...iconTileSx, bgcolor: t.navy800 }}>
                      <Icon />
                    </Box>
                  )}
                </Box>
                <Box sx={{ p: 2.5 }}>
                  <Typography component="h3" sx={{ m: 0, fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.3 }}>
                    {s.title}
                  </Typography>
                  <Typography sx={{ mt: 0.75, fontSize: '0.9375rem', lineHeight: 1.5, color: t.inkMuted }}>{s.body}</Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Section>

      {/* Parents */}
      <Section id="parents">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: { xs: 3, md: 6 }, alignItems: 'start' }}>
          <SectionHeader
            align="start"
            eyebrow="For parents"
            title="Join the demo with your child"
            lede="This is the best hour to ask us anything. See how a real class runs, meet the faculty and decide together."
          />
          <CheckList
            columnMin={1000}
            items={PARENT_POINTS.map((p) => (
              <Box key={p.title} component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Box component="strong" sx={{ fontWeight: 700 }}>
                  {p.title}
                </Box>
                <Box component="span" sx={{ fontWeight: 400, fontSize: '0.9375rem', color: t.inkMuted }}>
                  {p.body}
                </Box>
              </Box>
            ))}
          />
        </Box>
      </Section>

      {/* Comparison */}
      <Section id="comparison" tone="white" width="narrow" header={{ align: 'start', eyebrow: 'Online, done properly', title: 'Why students choose Neram over offline coaching' }}>
        {/* Ruled rows on phones, a table from tablet up: no sideways scrolling at 375px. */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, borderTop: `1px solid ${t.ink}` }}>
          {COMPARISON.map((c) => (
            <Box key={c.topic} sx={{ py: 2, borderBottom: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography component="h3" sx={{ m: 0, fontWeight: 700 }}>
                {c.topic}
              </Typography>
              <Typography sx={{ fontSize: '0.9375rem', color: t.inkMuted }}>Offline: {c.offline}</Typography>
              <Typography sx={{ fontWeight: 600, display: 'flex', gap: 0.75 }}>
                <CheckIcon aria-hidden sx={{ fontSize: 18, color: t.gold800, mt: '3px' }} />
                Neram: {c.neram}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box
          component="table"
          aria-label="Offline coaching compared with Neram"
          sx={{
            display: { xs: 'none', sm: 'table' },
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            '& th, & td': { py: 1.75, px: 1.5, borderBottom: `1px solid ${t.line}`, verticalAlign: 'top', fontSize: '0.9375rem', lineHeight: 1.5 },
            '& thead th': { borderBottom: `2px solid ${t.ink}`, fontWeight: 700 },
          }}
        >
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col">Typical offline coaching</th>
              <Box component="th" scope="col" sx={{ color: t.gold800 }}>
                Neram
              </Box>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((c) => (
              <tr key={c.topic}>
                <Box component="th" scope="row" sx={{ fontWeight: 700 }}>
                  {c.topic}
                </Box>
                <Box component="td" sx={{ color: t.inkMuted }}>
                  {c.offline}
                </Box>
                <Box component="td" sx={{ fontWeight: 600 }}>
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    <CheckIcon aria-hidden sx={{ fontSize: 18, color: t.gold800, mt: '2px' }} />
                    {c.neram}
                  </Box>
                </Box>
              </tr>
            ))}
          </tbody>
        </Box>
      </Section>

      {/* Drawing hook */}
      <Section id="drawing" py={{ xs: 6, md: 8 }}>
        <InlineCta
          icon={<BrushOutlinedIcon />}
          title="Love to draw? Get feedback from an architect"
          body="After you book, send us any drawing on WhatsApp. It does not have to be exam work: we look at the quality of your hand, not the topic. An architect replies with a voice note on what is impressive and what to try next."
          action={<CtaButton onClick={scrollToBooking}>Book my demo first</CtaButton>}
        />
      </Section>

      {/* FAQ */}
      <Section id="demo-faq" tone="white" width="narrow" header={{ align: 'start', eyebrow: 'Questions', title: 'Before you book' }}>
        <FaqList items={DEMO_FAQ.map((f) => ({ question: f.q, answer: f.a }))} />
      </Section>

      <CtaBand
        title="Ready for your free demo?"
        lede="Pick a day now. We call you to fix the exact time."
        actions={
          <CtaButton onClick={scrollToBooking} startIcon={<VideocamOutlinedIcon aria-hidden />}>
            Book your free demo
          </CtaButton>
        }
      />

      <StickyBookBar />
    </Box>
  );
}

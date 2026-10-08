'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography, useMediaQuery } from '@neram/ui';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { useTranslations } from 'next-intl';
import { NX, SHOWCASE_IMAGES, mono, serif } from './palette';
import { blink, fill, rise } from './keyframes';
import ReviewScene from './scenes/ReviewScene';
import ReviseScene from './scenes/ReviseScene';
import PredictScene from './scenes/PredictScene';
import TutorScene from './scenes/TutorScene';
import LibraryScene from './scenes/LibraryScene';
import SketchbookScene from './scenes/SketchbookScene';
import LiveScene from './scenes/LiveScene';

export const SCENES = ['review', 'revise', 'predict', 'tutor', 'library', 'sketchbook', 'live'] as const;
export type SceneKey = (typeof SCENES)[number];
export const SCENE_DURATION_MS = 6000;

/** Which Nexus tab each scene lives in: Studio, Question bank, Library, Sketchbook, Live. */
const TAB_OF_SCENE = [0, 0, 1, 1, 2, 3, 4];
const TABS = ['Studio', 'Question bank', 'Library', 'Sketchbook', 'Live'];

const SCENE_VIEWS: Record<SceneKey, () => JSX.Element> = {
  review: ReviewScene,
  revise: ReviseScene,
  predict: PredictScene,
  tutor: TutorScene,
  library: LibraryScene,
  sketchbook: SketchbookScene,
  live: LiveScene,
};

interface NexusShowcaseProps {
  /** A finished product film. When set it replaces the built-in scenes and plays muted on a loop. */
  videoSrc?: string;
  /** CSS aspect ratio of that film, for example "16 / 10". */
  videoRatio?: string;
}

const controlSx = {
  width: 44,
  height: 44,
  flex: 'none',
  borderRadius: 0,
  border: `2px solid ${NX.rule}`,
  color: NX.white,
  '&:hover': { borderColor: NX.gold, color: NX.gold, bgcolor: 'transparent' },
  '&:focus-visible': { outline: `2px solid ${NX.gold}`, outlineOffset: 2 },
} as const;

/**
 * The left-hand panel of /apply: a seven-scene tour of the Nexus app that
 * loops every six seconds per scene. It pauses on request, while the tab is
 * hidden, while it is scrolled out of view, and under prefers-reduced-motion
 * (where it also drops every CSS animation and waits for the arrows).
 */
export default function NexusShowcase({ videoSrc, videoRatio = '16 / 10' }: NexusShowcaseProps) {
  const t = useTranslations('apply.showcase');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [cycle, setCycle] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const autoplay = !paused && !reducedMotion && !tabHidden && !offscreen && !videoSrc;
  const motion = reducedMotion ? 'off' : autoplay || (videoSrc && !paused) ? 'play' : 'paused';

  // Each scene schedules the next one, so a manual jump restarts the clock.
  useEffect(() => {
    if (!autoplay) return undefined;
    const id = window.setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, scene]);

  // Restart the progress bar whenever playback resumes, so it keeps time with the clock above.
  useEffect(() => {
    if (autoplay) setCycle((c) => c + 1);
  }, [autoplay]);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Warm the cache for the later scenes once the page has settled.
  useEffect(() => {
    if (videoSrc) return undefined;
    const id = window.setTimeout(() => {
      for (const src of SHOWCASE_IMAGES) {
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
      }
    }, 1500);
    return () => window.clearTimeout(id);
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      return;
    }
    // jsdom and some WebViews return nothing from play().
    const playing = video.play() as Promise<void> | undefined;
    if (playing && typeof playing.catch === 'function') playing.catch(() => {});
  }, [paused]);

  const go = (next: number) => setScene(((next % SCENES.length) + SCENES.length) % SCENES.length);
  const sceneKey = SCENES[scene];
  const SceneView = SCENE_VIEWS[sceneKey];
  const activeTab = TAB_OF_SCENE[scene];

  return (
    <Box
      ref={rootRef}
      component="section"
      aria-label={t('eyebrow')}
      data-motion={motion}
      sx={{
        minHeight: { md: '100%' },
        p: { xs: '20px 16px 24px', md: '32px 40px 28px', lg: '40px 48px 32px' },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2, md: 2.5, lg: 3 },
        '@media (min-width: 900px) and (max-height: 820px)': { pt: 3, pb: 2.5, gap: 2 },
        color: NX.white,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        '&[data-motion="paused"] *': { animationPlayState: 'paused' },
        '&[data-motion="off"] *': { animation: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        <Typography
          component="p"
          sx={{
            m: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            fontFamily: mono,
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: NX.gold,
          }}
        >
          <Box component="span" aria-hidden sx={{ width: 8, height: 8, bgcolor: NX.gold, animation: `${blink} 1.6s ease-in-out infinite` }} />
          {t('eyebrow')}
        </Typography>
        <Typography
          variant="h1"
          component="p"
          sx={{
            display: { xs: 'none', md: 'block' },
            m: 0,
            fontFamily: serif,
            fontWeight: 700,
            fontSize: { md: 'clamp(28px, 2.4vw, 34px)', lg: 'clamp(30px, 2.8vw, 40px)' },
            lineHeight: 1.1,
            letterSpacing: '-.01em',
            color: NX.white,
            maxWidth: 640,
            textWrap: 'pretty',
            '@media (max-height: 820px)': { fontSize: 28 },
          }}
        >
          {t('headline')}{' '}
          <Box component="em" sx={{ color: NX.gold }}>
            {t('headlineAccent')}
          </Box>
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, maxWidth: 680, width: '100%' }}>
        {!videoSrc && (
          <Box
            key={scene}
            sx={{ minHeight: { xs: 56, md: 62 }, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 0.5, animation: `${rise} .5s ease both` }}
          >
            <Typography component="p" sx={{ m: 0, fontFamily: mono, fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: NX.gold }}>
              {`0${scene + 1} / `}
              {t(`scenes.${sceneKey}.label`)}
            </Typography>
            <Typography component="p" sx={{ m: 0, fontFamily: serif, fontWeight: 500, fontSize: { xs: 17, md: 22 }, lineHeight: 1.3, textWrap: 'pretty' }}>
              {t(`scenes.${sceneKey}.caption`)}
            </Typography>
          </Box>
        )}

        {videoSrc ? (
          <Box sx={{ position: 'relative', aspectRatio: videoRatio, bgcolor: '#000', border: `2px solid ${NX.rule}`, boxShadow: '0 30px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}>
            <Box
              component="video"
              ref={videoRef}
              src={videoSrc}
              autoPlay
              muted
              loop
              playsInline
              aria-label={t('windowAlt')}
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <IconButton
              aria-label={paused ? t('play') : t('pause')}
              onClick={() => setPaused((p) => !p)}
              sx={{ ...controlSx, position: 'absolute', right: 12, bottom: 12, bgcolor: NX.white, color: NX.navy, borderColor: NX.white, '&:hover': { bgcolor: NX.gold, borderColor: NX.gold, color: NX.navy } }}
            >
              {paused ? <PlayArrowRounded /> : <PauseRounded />}
            </IconButton>
          </Box>
        ) : (
          <Box sx={{ bgcolor: NX.surface, border: `2px solid ${NX.rule}`, boxShadow: '0 30px 60px rgba(0,0,0,.35)' }}>
            <Box
              aria-hidden
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                px: 1.5,
                height: 44,
                borderBottom: `2px solid ${NX.rule}`,
                overflow: 'hidden',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, minWidth: 0 }}>
                <Box component="span" sx={{ fontWeight: 800, fontSize: 15, letterSpacing: '.02em' }}>
                  Nexus
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    gap: '2px',
                    minWidth: 0,
                    overflow: 'hidden',
                    // Tablet-width panels cut the tab list; fade it out instead of chopping a word.
                    maskImage: { md: 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)', lg: 'none' },
                  }}
                >
                  {TABS.map((label, i) => (
                    <Box
                      key={label}
                      component="span"
                      sx={{
                        fontSize: 12,
                        fontWeight: 600,
                        px: 1,
                        py: 0.75,
                        whiteSpace: 'nowrap',
                        color: activeTab === i ? NX.white : NX.dim,
                        borderBottom: `2px solid ${activeTab === i ? NX.gold : 'transparent'}`,
                        transition: 'color .3s, border-color .3s',
                      }}
                    >
                      {label}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="span" sx={{ display: { xs: 'flex', md: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.75, fontSize: 11, color: NX.muted, flex: 'none' }}>
                <Box component="span" sx={{ width: 16, height: 16, display: 'grid', placeItems: 'center', bgcolor: NX.teams, color: NX.white, fontSize: 10, fontWeight: 800 }}>
                  T
                </Box>
                Teams
              </Box>
            </Box>
            <Box
              role="img"
              aria-label={t('windowAlt')}
              sx={{
                // Shrinks on short laptop screens so the whole panel fits beside the form.
                height: { xs: 260, md: 'clamp(240px, calc(100dvh - 560px), 360px)' },
                position: 'relative',
                overflow: 'hidden',
                bgcolor: NX.surface,
              }}
            >
              <Box key={scene} aria-hidden sx={{ position: 'absolute', inset: 0 }}>
                <SceneView />
              </Box>
            </Box>
          </Box>
        )}

        {!videoSrc && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <IconButton aria-label={paused ? t('play') : t('pause')} onClick={() => setPaused((p) => !p)} sx={controlSx}>
              {paused ? <PlayArrowRounded /> : <PauseRounded />}
            </IconButton>
            <Box aria-hidden sx={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '5px', pt: '20px' }}>
              {SCENES.map((key, i) => (
                <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
                  <Box sx={{ height: 4, bgcolor: NX.rule, position: 'relative', overflow: 'hidden' }}>
                    {i < scene && <Box sx={{ position: 'absolute', inset: 0, bgcolor: NX.done }} />}
                    {i === scene && (
                      <Box
                        key={`${scene}-${cycle}`}
                        sx={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          bgcolor: NX.gold,
                          width: motion === 'off' ? '100%' : undefined,
                          animation: motion === 'off' ? 'none' : `${fill} ${SCENE_DURATION_MS}ms linear both`,
                        }}
                      />
                    )}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      display: { xs: 'none', lg: 'block' },
                      fontSize: 11,
                      fontWeight: 600,
                      color: i === scene ? NX.white : NX.dim,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t(`scenes.${key}.label`)}
                  </Box>
                </Box>
              ))}
            </Box>
            <IconButton aria-label={t('previous')} onClick={() => go(scene - 1)} sx={controlSx}>
              <ChevronLeftRounded />
            </IconButton>
            <IconButton aria-label={t('next')} onClick={() => go(scene + 1)} sx={controlSx}>
              <ChevronRightRounded />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          gap: 3.5,
          flexWrap: 'wrap',
          mt: 'auto',
          pt: 2.5,
          borderTop: `2px solid ${NX.rule}`,
          fontSize: 13,
          color: NX.muted,
          // The stats are the first thing to go when the panel must fit a short screen.
          '@media (max-height: 999px)': { display: 'none' },
        }}
      >
        {(['rank', 'questions', 'global'] as const).map((key) => (
          <Box key={key} component="span">
            <Box component="b" sx={{ color: NX.gold, fontFamily: mono, fontWeight: 700, fontSize: 16, mr: 0.75 }}>
              {t(`stats.${key}`)}
            </Box>
            {t(`stats.${key}Note`)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Box, IconButton, Typography, useMediaQuery } from '@neram/ui';
import PauseOutlined from '@mui/icons-material/PauseOutlined';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import { useTranslations } from 'next-intl';
import { StatStrip, tokens } from '@/design-system';
import { SHOWCASE_COLORS, SHOWCASE_IMAGES } from './palette';
import { AUTHORED_SECONDS, CONTAINER, HOLD_SECONDS, NARROW, type SceneProps } from './motion';
import { DESK, DESK_SHORT } from '../shell/density';
import ReviewScene from './scenes/ReviewScene';
import ReviseScene from './scenes/ReviseScene';
import PredictScene from './scenes/PredictScene';
import TutorScene from './scenes/TutorScene';
import LibraryScene from './scenes/LibraryScene';
import SketchbookScene from './scenes/SketchbookScene';
import LiveScene from './scenes/LiveScene';

export const SCENES = ['review', 'revise', 'predict', 'tutor', 'library', 'sketchbook', 'live'] as const;
export type SceneKey = (typeof SCENES)[number];
/** Time from one scene to the next at the default length: 7s of script plus the 0.6s hold. */
export const SCENE_DURATION_MS = Math.round((AUTHORED_SECONDS + HOLD_SECONDS) * 1000);

/** Which Nexus tab each scene lives in: Studio, Question bank, Library, Sketchbook, Live. */
const TAB_OF_SCENE = [0, 0, 1, 1, 2, 3, 4];
const TABS = ['Studio', 'Question bank', 'Library', 'Sketchbook', 'Live'];

const SCENE_VIEWS: Record<SceneKey, (props: SceneProps) => JSX.Element> = {
  review: ReviewScene,
  revise: ReviseScene,
  predict: PredictScene,
  tutor: TutorScene,
  library: LibraryScene,
  sketchbook: SketchbookScene,
  live: LiveScene,
};

/** Repaint at most this often (about 30 fps); the clock itself runs on requestAnimationFrame. */
const PAINT_MS = 33;

interface NexusShowcaseProps {
  /** Seconds each scene plays before the 0.6s hold (4 to 12, default 7). The scripts scale to fit. */
  sceneSeconds?: number;
  /** A finished product film. When set it replaces the built-in scenes and plays muted on a loop. */
  videoSrc?: string;
  /** CSS aspect ratio of that film, for example "16 / 10". */
  videoRatio?: string;
}

const focusSx = { '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: '2px' } } as const;

const controlSx = {
  width: 44,
  height: 44,
  flex: 'none',
  borderRadius: `${tokens.radius}px`,
  border: `1px solid ${SHOWCASE_COLORS.outline}`,
  color: tokens.paper,
  bgcolor: 'transparent',
  transition: 'border-color 150ms ease',
  '&:hover': { borderColor: tokens.gold500, bgcolor: 'transparent' },
  ...focusSx,
} as const;

const mod = (n: number) => ((n % SCENES.length) + SCENES.length) % SCENES.length;

/**
 * The left-hand panel of /apply: a seven-scene tour of the Nexus app. One
 * clock drives every scene: `elapsed` seconds since the scene started, fed
 * by requestAnimationFrame and repainted at most every 33ms. It freezes on
 * pause, while the tab is hidden and while the panel is scrolled out of
 * view. Under prefers-reduced-motion nothing plays: every scene renders in
 * its final state and the arrows still move between them.
 *
 * The panel sets no background or outer padding; ApplyLayout's aside does.
 */
export default function NexusShowcase({ sceneSeconds = AUTHORED_SECONDS, videoSrc, videoRatio = '16 / 10' }: NexusShowcaseProps) {
  const t = useTranslations('apply.showcase');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const d = Math.min(12, Math.max(4, sceneSeconds));
  const [scene, setScene] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const clockMs = useRef(0);
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const autoplay = !paused && !reducedMotion && !tabHidden && !offscreen && !videoSrc;
  const motion = reducedMotion ? 'off' : autoplay || (videoSrc && !paused) ? 'play' : 'paused';

  useEffect(() => {
    if (!autoplay) return undefined;
    const cycleMs = Math.round((d + HOLD_SECONDS) * 1000);
    let last = performance.now();
    let painted = last;
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      // A long gap (a stalled tab) counts as one short frame, so scenes never skip ahead.
      clockMs.current += Math.min(100, now - last);
      last = now;
      if (clockMs.current >= cycleMs) {
        clockMs.current = 0;
        painted = now;
        setScene((s) => mod(s + 1));
        setElapsed(0);
      } else if (now - painted >= PAINT_MS) {
        painted = now;
        setElapsed(clockMs.current / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [autoplay, d]);

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

  /** Jumping restarts the scene from its first frame. */
  const go = (next: number) => {
    clockMs.current = 0;
    setElapsed(0);
    setScene(mod(next));
  };

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target =
      event.key === 'ArrowRight' ? scene + 1 : event.key === 'ArrowLeft' ? scene - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? SCENES.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    go(target);
    tabRefs.current[mod(target)]?.focus();
  };

  const sceneKey = SCENES[scene];
  const SceneView = SCENE_VIEWS[sceneKey];
  const activeTab = TAB_OF_SCENE[scene];
  const sceneT = reducedMotion ? d : Math.min(elapsed, d);
  const progress = Math.min(1, sceneT / d);
  const playLabel = paused ? t('play') : t('pause');

  return (
    <Box
      ref={rootRef}
      component="section"
      aria-label={t('eyebrow')}
      data-motion={motion}
      sx={{
        width: '100%',
        minWidth: 0,
        containerType: 'inline-size',
        containerName: CONTAINER,
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        [DESK]: { gap: '16px' },
        [DESK_SHORT]: { gap: '12px' },
        color: tokens.paper,
        fontFamily: tokens.fontSans,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px', [DESK]: { gap: '10px' } }}>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontFamily: tokens.fontMono,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: tokens.gold500,
          }}
        >
          {t('eyebrow')}
        </Typography>
        <Typography
          component="h2"
          sx={{
            // Phones see the showcase above the form, so it stays short there.
            display: { xs: 'none', md: 'block' },
            m: 0,
            fontFamily: tokens.fontSans,
            fontWeight: 800,
            // Sized for the laptop column: about 28px at 1422px wide, 32px at most.
            fontSize: 'clamp(1.5rem, 0.75rem + 1.15vw, 2rem)',
            [DESK_SHORT]: { fontSize: 'clamp(1.5rem, 0.75rem + 1.15vw, 1.75rem)' },
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
            color: tokens.paper,
            textWrap: 'balance',
          }}
        >
          {t('headline')}{' '}
          <Box component="em" sx={{ fontStyle: 'normal', color: tokens.gold500 }}>
            {t('headlineAccent')}
          </Box>
        </Typography>
      </Box>

      {!videoSrc && (
        <Box aria-live="polite" sx={{ display: 'flex', gap: '14px', alignItems: 'flex-start', minHeight: 60, [DESK]: { gap: '12px', minHeight: 48 } }}>
          <Box
            component="span"
            sx={{ fontFamily: tokens.fontMono, fontSize: 26, fontWeight: 700, lineHeight: 1, color: tokens.gold500, flex: 'none', pt: '2px', [DESK]: { fontSize: 22 } }}
          >
            {String(scene + 1).padStart(2, '0')}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
            <Box
              component="strong"
              sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.paperSubtle }}
            >
              {t(`scenes.${sceneKey}.label`)}
            </Box>
            <Box component="p" sx={{ m: 0, fontSize: 18, lineHeight: 1.4, fontWeight: 600, textWrap: 'pretty', [DESK]: { fontSize: 16 } }}>
              {t(`scenes.${sceneKey}.caption`)}
            </Box>
          </Box>
        </Box>
      )}

      {videoSrc ? (
        <Box
          sx={{
            position: 'relative',
            aspectRatio: videoRatio,
            bgcolor: tokens.navy800,
            border: `1px solid ${SHOWCASE_COLORS.windowBorder}`,
            borderRadius: `${tokens.radius}px`,
            boxShadow: tokens.shadowHeroCard,
            overflow: 'hidden',
          }}
        >
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
            aria-label={playLabel}
            onClick={() => setPaused((p) => !p)}
            sx={{
              ...controlSx,
              position: 'absolute',
              right: 12,
              bottom: 12,
              bgcolor: tokens.paper,
              color: tokens.navy900,
              borderColor: tokens.paper,
              '&:hover': { bgcolor: tokens.gold500, borderColor: tokens.gold500 },
            }}
          >
            {paused ? <PlayArrowOutlined /> : <PauseOutlined />}
          </IconButton>
        </Box>
      ) : (
        <Box
          role="img"
          aria-label={t(`scenes.${sceneKey}.alt`)}
          sx={{
            borderRadius: `${tokens.radius}px`,
            overflow: 'hidden',
            bgcolor: tokens.navy800,
            border: `1px solid ${SHOWCASE_COLORS.windowBorder}`,
            boxShadow: tokens.shadowHeroCard,
            // On a laptop the window is as wide as the column allows, but never so tall
            // that the panel outgrows the screen: its width follows the window height.
            // --nx-chrome is everything in the panel that is not the scene picture.
            '--nx-ratio': '1.6',
            '--nx-extra': '0px',
            [NARROW]: { '--nx-ratio': '1.3333', '--nx-extra': '60px' },
            [DESK]: {
              '--nx-chrome': '470px',
              width: 'min(100%, max(280px, calc((100dvh - var(--nx-chrome) - var(--nx-extra)) * var(--nx-ratio))))',
              mx: 'auto',
            },
            [DESK_SHORT]: { '--nx-chrome': '375px' },
          }}
        >
          <Box
            aria-hidden
            sx={{
              height: 40,
              [DESK]: { height: 36 },
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              px: '14px',
              borderBottom: `1px solid ${tokens.lineDark}`,
              overflow: 'hidden',
            }}
          >
            <Box component="strong" sx={{ fontSize: 14, fontWeight: 800, flex: 'none' }}>
              Nexus
            </Box>
            <Box sx={{ display: 'flex', gap: '2px', minWidth: 0, overflow: 'hidden', flex: 1 }}>
              {TABS.map((label, i) => (
                <Box
                  key={label}
                  component="span"
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    px: 1,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    flex: 'none',
                    color: activeTab === i ? tokens.paper : SHOWCASE_COLORS.paperDim,
                    boxShadow: activeTab === i ? `inset 0 -2px 0 ${tokens.gold500}` : 'none',
                    // A narrow window cannot fit five tabs; show the one the scene is in.
                    [NARROW]: { display: activeTab === i ? 'flex' : 'none' },
                  }}
                >
                  {label}
                </Box>
              ))}
            </Box>
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: tokens.paperMuted, flex: 'none' }}>
              <Box
                component="span"
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '3px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: SHOWCASE_COLORS.teams,
                  color: tokens.surface,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                T
              </Box>
              Teams
            </Box>
          </Box>
          <Box
            aria-hidden
            sx={{
              position: 'relative',
              aspectRatio: '16 / 10',
              bgcolor: tokens.surface,
              color: tokens.ink,
              overflow: 'hidden',
              // Phones and the 1024 to 1280px laptops get a little more height for the same content.
              [NARROW]: { aspectRatio: '4 / 3' },
            }}
          >
            <SceneView key={scene} t={sceneT} d={d} />
          </Box>
        </Box>
      )}

      {!videoSrc && (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, [NARROW]: { flexWrap: 'wrap', rowGap: 1.5 } }}>
          <IconButton aria-label={playLabel} onClick={() => setPaused((p) => !p)} sx={controlSx}>
            {paused ? <PlayArrowOutlined /> : <PauseOutlined />}
          </IconButton>
          <Box
            role="tablist"
            aria-label={t('tour')}
            onKeyDown={onTabKey}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: '4px',
              // Narrow: the segments take a full row so each stays a 44px target.
              [NARROW]: { order: -1, flexBasis: '100%' },
            }}
          >
            {SCENES.map((key, i) => {
              const current = i === scene;
              return (
                <Box
                  key={key}
                  component="button"
                  type="button"
                  role="tab"
                  ref={(el: HTMLButtonElement | null) => {
                    tabRefs.current[i] = el;
                  }}
                  aria-selected={current}
                  aria-label={t(`scenes.${key}.label`)}
                  tabIndex={current ? 0 : -1}
                  onClick={() => go(i)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    gap: '6px',
                    minHeight: 44,
                    minWidth: 0,
                    p: 0,
                    m: 0,
                    border: 'none',
                    borderRadius: '2px',
                    bgcolor: 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    '&:hover .nx-seg-label': { color: tokens.paper },
                    ...focusSx,
                  }}
                >
                  <Box
                    component="span"
                    className="nx-seg-label"
                    sx={{
                      display: 'block',
                      fontSize: 12,
                      lineHeight: 1.3,
                      fontWeight: current ? 700 : 500,
                      color: current ? tokens.paper : SHOWCASE_COLORS.paperDim,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'color 150ms ease',
                      [NARROW]: { display: 'none' },
                    }}
                  >
                    {t(`scenes.${key}.label`)}
                  </Box>
                  <Box component="span" sx={{ display: 'block', width: '100%', height: 3, borderRadius: '2px', overflow: 'hidden', bgcolor: SHOWCASE_COLORS.paperTrack }}>
                    <Box
                      component="span"
                      style={{ width: i < scene ? '100%' : current ? `${progress * 100}%` : 0 }}
                      sx={{ display: 'block', height: 3, bgcolor: i < scene ? SHOWCASE_COLORS.paperDim : tokens.gold500 }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
          <IconButton aria-label={t('previous')} onClick={() => go(scene - 1)} sx={{ ...controlSx, [NARROW]: { ml: 'auto' } }}>
            <ChevronLeftOutlined />
          </IconButton>
          <IconButton aria-label={t('next')} onClick={() => go(scene + 1)} sx={controlSx}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
      )}

      <Box sx={{ display: { xs: 'none', md: 'block' }, [DESK_SHORT]: { display: 'none' } }}>
        <StatStrip
          size="compact"
          maxWidth={4000}
          items={(['rank', 'questions', 'global'] as const).map((key) => ({ value: t(`stats.${key}`), label: t(`stats.${key}Note`) }))}
        />
      </Box>
    </Box>
  );
}

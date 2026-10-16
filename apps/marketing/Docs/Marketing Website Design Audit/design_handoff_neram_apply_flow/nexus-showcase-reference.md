# Nexus Showcase: design reference (from `Nexus Showcase.dc.html`)

Transcribed from the Claude Design prototype on 2026-10-16. The prototype is a
DC component (template + a `renderVals()` class). Below: the panel markup, each
scene's markup, and the exact animation maths. Inline styles are the spec;
rebuild them with MUI `sx` and `siteTokens` (no hex in sx in `components/apply/**`).

Constants: NAVY `#060d1f` (navy900), GOLD `#e8a020` (gold500), LINE `#E1E5EB`,
INK `#1A2027`, PAPER `#f5f0e8`, muted `#55606c`, navy800 `#0b1629`,
lineStrong `#c5ccd4`, ground `#FAFBFC`, gold800 `#8a5a05`, grey bar `#8792a0`,
live green `#3fae5a`, Teams purple `#5b5fc7` (brand tile, keep as a token-free literal only if the lint allows, else a local const).
Mono = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`.

## Animation maths (all scenes)

```js
// t = seconds since scene start; D = sceneSeconds (default 7). Times in the
// tables are authored for 7s, so every timestamp a is compared on t*7/D.
const ease = x => 1 - Math.pow(1 - x, 3);
const k = (a, d = 0.5) => ease(clamp01((t * 7 / D - a) / d));
const appear = (a, d = 0.45, y = 8) => { const v = k(a, d); return { opacity: v, transform: `translateY(${(1 - v) * y}px)` }; };
const pop = a => { const v = k(a, 0.35); return { opacity: v, transform: `scale(${0.6 + 0.4 * v})`, transformOrigin: 'center', transformBox: 'fill-box' }; };
const draw = (a, d) => ({ strokeDasharray: 1, strokeDashoffset: 1 - k(a, d) }); // on <path pathLength="1">
```

Loop: rAF; `dt = min(0.1, frameDelta)`; when not paused and not `document.hidden`,
`tt += dt`; when `tt >= D + 0.6` advance `scene = (scene + 1) % 7` and reset;
otherwise setState at most every 33ms. Reduced motion or autoplay off: `t = D`
(every scene in its final state). `goTo(i)`: `tt = reduced ? D : 0`.
In React, CSS keyframes with `animation-delay` (scaled by D/7) are an
acceptable, cheaper implementation, as the README says; `data-motion="paused|off"` pauses/finishes them.

## Panel

```html
<section aria-label="Inside the Nexus app" style="display:flex;flex-direction:column;gap:22px;color:PAPER">
  <div style="display:flex;flex-direction:column;gap:14px">
    <span style="mono;12px;700;ls .2em;uppercase;color:GOLD">Inside the Nexus app</span>
    <h2 style="margin:0;font-size:clamp(1.75rem,3vw,2.5rem);lh 1.12;800;ls -0.01em;text-wrap:balance">
      India's largest AI-enabled learning platform for <em style="font-style:normal;color:GOLD">architecture entrance.</em></h2>
  </div>

  <div aria-live="polite" style="display:flex;gap:14px;align-items:flex-start;min-height:60px">
    <span style="mono;26px;700;lh 1;color:GOLD;flex-shrink:0;padding-top:2px">{01..07}</span>
    <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
      <strong style="13px;700;ls .05em;uppercase;color:rgba(245,240,232,0.62)">{scene title}</strong>
      <p style="margin:0;18px;lh 1.4;600;text-wrap:pretty">{caption}</p>
    </div>
  </div>

  <div role="img" aria-label="{alt}" style="border-radius:8px;overflow:hidden;background:navy800;border:1px solid rgba(255,255,255,0.12);box-shadow:0 24px 48px rgba(0,0,0,0.35)">
    <div aria-hidden style="height:40px;display:flex;align-items:center;gap:14px;padding:0 14px;border-bottom:1px solid rgba(255,255,255,0.08);overflow:hidden">
      <strong style="14px;800;flex-shrink:0">Nexus</strong>
      <div style="display:flex;gap:2px;min-width:0;overflow:hidden;flex:1">
        tabs Studio · Question bank · Library · Sketchbook · Live, each:
        { fontSize 12, fontWeight 600, padding '0 8px', height 40, flex center, nowrap,
          color: active ? PAPER : 'rgba(245,240,232,0.55)', boxShadow: active ? `inset 0 -2px 0 GOLD` : none }
      </div>
      <span style="flex;gap:6px;12px;color:rgba(245,240,232,0.72);flex-shrink:0">
        <span style="16x16;radius 3;bg #5b5fc7;color #fff;10px;800;centered">T</span>Teams</span>
    </div>
    <div aria-hidden style="position:relative;aspect-ratio:16/10;background:#fff;color:INK;overflow:hidden">
      {the current scene, absolutely positioned inset:0}
    </div>
  </div>

  Controls: <div style="display:flex;align-items:flex-end;gap:8px">
    play/pause button 44x44, 1px rgba(245,240,232,0.24), radius 8, transparent, PAPER, hover border GOLD;
      icon pause | play_arrow; aria-label "Pause the tour" | "Play the tour"
    <div role="tablist" aria-label="Nexus tour" style="flex:1;min-width:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">
      each: <button role="tab" aria-selected aria-label="{title}" style="flex column;gap 6;min-height 44;justify-content:flex-end;padding 0;border none;transparent;min-width 0">
        <span style="12px; weight current?700:500; color current?PAPER:rgba(245,240,232,0.55); nowrap; ellipsis; left">{title}</span>
        <span style="height 3;radius 2;bg rgba(245,240,232,0.2);overflow hidden;block;width 100%">
          <span style="block;height 3;bg i<si ? rgba(245,240,232,0.55) : GOLD; width i<si ? 100% : i==si ? prog*100% : 0"/></span>
    </div>
    prev (chevron_left, "Previous scene"), next (chevron_right, "Next scene"): same 44px outline buttons
  </div>

  StatStrip: grid 3 cols, 1px rgba(255,255,255,0.08), radius 8, bg rgba(11,22,41,0.6); cells padding 14px 16px, gap 6,
    cells 2..3 border-left 1px rgba(255,255,255,0.08); value mono 22px/700 lh1 GOLD; label 12px ls .05em uppercase rgba(245,240,232,0.62)
    AIR 1 / JEE B.Arch 2024 · 10,000+ / Solved questions · Global / Students worldwide
</section>
```
`prog = min(1, t / D)`.

## Scenes

| key | title | tab | caption | alt |
|---|---|---|---|---|
| review | Review | 0 | Your teacher marks up your drawing and explains each fix. | A teacher draws numbered corrections on a student perspective drawing. |
| revise | Revise | 0 | Fix it, resubmit, and watch your score climb. | A resubmitted drawing scores 5 out of 5. |
| predict | Predict | 1 | AI ranks the chapters most likely to appear this year. | A ranked list of chapters by how often they were asked in 17 years. |
| tutor | AI tutor | 1 | Stuck on a question? Ask the tutor, step by step. | A student chats with the AI tutor about a solved question. |
| library | Library | 2 | 3,000+ recorded classes, searchable by topic. | Searching the class library for 3D geometry. |
| sketchbook | Sketchbook | 3 | Sketch digitally, with inspiration for every drawing question. | A digital sketch next to inspiration images. |
| live | Live | 4 | Live classes in Microsoft Teams, with answer pads. | A live class where students answer on an answer pad. |

### 01 Review
Grid `minmax(0,1.6fr) minmax(0,1fr)`.
Left (relative, overflow hidden, bg navy800): drawing image cover; SVG `viewBox="0 0 1215 680" preserveAspectRatio="xMidYMid slice"` absolute inset 0:
- `<path d="M802 330 L1102 244" pathLength=1 stroke GOLD width 7 round>` draw(0.4, 0.9)
- `<path d="M741 317 L802 385 M741 365 L693 413" ...width 7>` draw(2.0, 0.9)
- `<ellipse cx=748 cy=372 rx=118 ry=102 pathLength=1 stroke GOLD width 6>` draw(3.6, 1.0)
- markers `<g>`: circle r30 fill NAVY stroke GOLD 4 + text (y = cy+12, 34px, 800, PAPER, middle) at (1102,244) "1" pop(1.1); (693,413) "2" pop(2.7); (866,372) "3" pop(4.4)
- tag top-left 10/10: bg NAVY, PAPER, 11px/700, padding 4px 8px, radius 4: "Your plate · Perspective"
Right: flex column, padding 12, gap 8, border-left 1px LINE:
- head: 28px circle NAVY with GOLD "HB" 11px/800; "Ar. Hari Babu" 12px strong nowrap; "Reviewing your plate" 11px muted
- notes (appear at 1.2 / 2.8 / 4.4): flex gap 8, padding 6px 8px, radius 6; active (latest shown) = bg ground + `inset 3px 0 0 GOLD`, transition background 200ms.
  Badge 18px circle NAVY, PAPER 11px/800 number. Text 12px lh 1.35:
  1 "Extend this edge to the vanishing point." 2 "These corners bend inward. Keep them vertical." 3 "Redraw the curve with the semi-ellipse trick."
- footer margin-top auto: `graphic_eq` 18px NAVY; bar flex 1 height 4 radius 2 bg LINE with NAVY fill `voiceP*100%` where `voiceP = min(1, (t*7/D)/6.4)`; time mono 11px muted `0:${round(voiceP*24)}` padded.

### 02 Revise
Grid `minmax(0,1.2fr) minmax(0,1fr)`.
Left: drawing cover; tag "Revision 2" (same as Review tag); chip at bottom-left 10/10: appear(0.5), bg GOLD, NAVY, 12px/800, padding 6px 10px, radius 6, `check` 16px + "Resubmitted".
Right: padding 12px 14px, gap 6, border-left LINE:
- header row: "Your score" 13px strong; score 26px/800 lh1 `avg.toFixed(1)` + `<small>/5</small>` 12px muted 600; border-bottom 1px INK, padding-bottom 8.
- rubric rows `[['Composition',5],['Proportion & scale',4],['Tonal quality',4],['Line quality',4]]`: value `v = b + (5-b)*k(1.4 + i*0.5, 0.7)`; label row 12px/600 with `v > 4.5 ? '5' : b`; bar 6px radius 3 bg LINE, fill width `v/5*100%`, colour `v >= 4.99 ? GOLD : '#55606c'`. avg = mean of v (4.3 → 5.0).
- banner appear(4.4), margin-top auto, flex gap 8, bg NAVY, PAPER, padding 8px 10px, radius 6: `military_tech` 18px GOLD; "Full marks" 12px strong / "Fixed in one revision" 11px paper.muted.

### 03 Predict
Flex column, padding 14px 16px, gap 4.
- header: border-bottom 1px INK, padding-bottom 8; "Most likely chapters · 2027" 14px strong / "JEE Paper 2A · from 17 years of papers" 11px muted; tag mono 10px/700 ls .1em bg NAVY GOLD padding 4px 8px radius 4 "AI PREDICTOR".
- rows `[['3D geometry',16],['Sequences & series',15],['Probability',13],['Applications of derivatives',11],['Mensuration',9]]`:
  style appear(0.3 + i*0.4, 0.4, 6), flex center gap 10, minHeight 30, padding 0 8px, margin 0 -8px, radius 6, border-bottom 1px LINE;
  top 3 when `hi = k(4.4, 0.4) > 0`: bg `rgba(232,160,32, 0.12*hi)`; when hi > 0.5: `inset 3px 0 0 GOLD`.
  Children: rank mono 12px/700 width 16 muted; name 12px/600 width 38% ellipsis; bar flex 1 height 8 radius 4 bg LINE, fill width `n/17*q*100%` with `q = k(0.5 + i*0.4, 0.9)`, colour top3 GOLD else `#8792a0`; count mono 11px/700 width 38 right `${round(n*q)}/17`.
- footnote appear(4.6), margin-top auto, flex gap 6, 11px INK: `flag` 16px gold800 + "Start with the top 3. Bars show how many years each chapter was asked."

### 04 AI tutor
Grid `minmax(0,1fr) minmax(0,1.15fr)`.
Left (padding 14, gap 8, border-right LINE): mono 10px/700 ls .1em gold800 "JEE 2024 · APTITUDE"; 13px lh1.4 600 "A 4×4×4 painted cube is cut into unit cubes. How many have exactly two faces painted?"; 3-col tabs gap 4 (11px/700 padding 5px 6px radius 4 centred; Video, Image with 1px LINE; "AI tutor" bg NAVY colour GOLD); answer card appear(3.5), margin-top auto, flex column gap 4, padding 10px 12px, radius 6, 1px LINE, `inset 3px 0 0 GOLD`: "Answer" 11px muted, "24" 22px strong lh1.
Right (padding 12, gap 6, bg ground, justify-content flex-end): messages shown once `t*7/D >= at`:
1. me "Why is it 12 × (n − 2)?" at 0.4
2. tutor "A cube has 12 edges. On each edge, the cubes between the two corners have two painted faces: n − 2 per edge." at 1.2, types over 1.6
3. me "So for 4×4×4 it is 24?" at 3.3
4. tutor "Exactly. Want a harder one on hidden faces?" at 4.2, types over 1.0
Typing: `q = clamp01((t*7/D - at)/d)`; text `slice(0, max(1, round(len*q)))` + (q<1 ? '▍' : '').
Bubble: appear(at, 0.3, 6), maxWidth 88%, padding 7px 10px, 12px lh1.4; me: align end, bg NAVY, PAPER, radius `10px 10px 2px 10px`; tutor: align start, #fff, INK, 1px LINE, radius `10px 10px 10px 2px`.
Input stub: height 30, 1px lineStrong, radius 6, #fff, padding 0 10px, 11px muted "Ask anything. No question is too small."

### 05 Library
Flex column, padding 12px 14px, gap 10.
- search row: field flex 1 height 32 1px lineStrong radius 6 gap 6 padding 0 10px: `search` 18px muted; text 13px/600 nowrap = `Q.slice(0, qn) || 'Search classes'` with `Q='3D geometry'`, `qn = round(len*k(0.6,1.2))`; caret 2x16 NAVY while 0 < qn < len. Count 12px strong nowrap min-width 120 right: `k(2.1,0.5) > 0 ? '48 classes found' : '3,000+ classes'`.
- grid 3x2 (`repeat(3,minmax(0,1fr))` / `repeat(2,minmax(0,1fr))`), gap 8, flex 1 min-height 0. Thumbs
  `[lib-1 '3D geometry · Solids' 42 min match], [lib-2 'Perspective drawing' 38 min], [lib-3 '3D geometry · Sections' 51 min match], [lib-4 '3D geometry · Practice' 35 min match], [lib-5 'Colour theory' 40 min], [lib-6 'Mental ability' 29 min]`.
  Each: appear(0.1 + i*0.12, 0.4, 6); opacity `min(appearOpacity, match ? 1 : 1 - 0.75*filt)` with `filt = k(2.1, 0.5)`; flex column gap 4, radius 8; outline `match && filt > 0.5 ? 2px solid GOLD : none`, offset 2.
  Image box flex 1 radius 6 bg navy800 with cover image + duration badge (right 4 bottom 4, NAVY, PAPER, 10px/700... use 11px minimum, padding 2px 5px radius 3); title 11px/600 ellipsis.

### 06 Sketchbook
Grid `minmax(0,1.1fr) minmax(0,1fr)`.
Left (padding 12, gap 8, border-right LINE): "Your sketchbook" 12px/700 / "Page 12" muted 600; canvas flex 1 radius 6 bg ground with `radial-gradient(#c5ccd4 1px, transparent 1px)` size 14px; SVG viewBox `0 0 300 200` meet:
- horizon `M20 60 L280 60` lineStrong 1, dasharray 4 4 (static)
- s1 draw(0.3,1.6): `M150 50 L150 150 M150 50 L95 70 L95 140 L150 150 L215 138 L215 72 L150 50` INK 2.2 round join
- s2 draw(2.0,0.8): `M95 70 L20 60 M215 72 L280 60` GOLD 1.6
- s3 draw(2.8,1.0): `M110 140 L110 100 L135 96 L135 145 M170 146 L170 100 L198 104 L198 141` INK 1.6
Right (padding 12, gap 8): "Inspiration for this question" 12px/700; 2x2 grid gap 6 of insp-1..4 cover images, each appear(3.4 + i*0.3, 0.45, 6), radius 6, bg navy800.

### 07 Live
Absolute, bg navy800, live image cover.
- pill top-left 10/10: flex gap 6, NAVY, PAPER, 11px/700, padding 5px 9px, radius 100: dot 8px `#3fae5a` with opacity `0.55 + 0.45*|sin(t*3)|` (opacity pulse, no scale) + "LIVE · NATA drawing class".
- pill top-right: `group` 14px + `${round(96 + 32*k(0.2,1.6))} students`.
- pad: appear(0.8, 0.5, 12), absolute right 10 bottom 10, width 46%, minWidth 180, #fff, INK, radius 8, padding 10, gap 8, shadow `0 12px 24px rgba(0,0,0,0.3)`:
  header 11px/700 "Answer pad · Q4" + status muted: `t>=3.0 ? 'Submitted ✓' : t>=2.0 ? 'Selected' : 'Choose one'`;
  options A–D grid 4 gap 4: height 26 radius 6 12px/700 centred; border 2px (C && sel ? NAVY : LINE), bg (C && sel ? NAVY : #fff), colour (C && sel ? PAPER : INK);
  result appear(4.0): "Class chose C" 11px + `<strong>${round(72*res)}%</strong>`; bar 5px radius 3 bg LINE, fill GOLD width `72*res%` with `res = k(4.0, 0.8)`.

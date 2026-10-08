import { keyframes } from '@mui/material/styles';

/** Motion for the Nexus showcase. Every animation is paused or removed under prefers-reduced-motion. */
export const draw = keyframes`from{stroke-dashoffset:1200}to{stroke-dashoffset:0}`;
export const rise = keyframes`from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}`;
export const fadeIn = keyframes`from{opacity:0}to{opacity:1}`;
export const chip = keyframes`0%{opacity:0;transform:translateY(6px)}12%,88%{opacity:1;transform:none}100%{opacity:0}`;
export const pop = keyframes`0%{opacity:0;transform:scale(.85)}70%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:none}`;
export const press = keyframes`0%,100%{transform:none}50%{transform:scale(.95)}`;
export const wave = keyframes`from{transform:scaleY(.3)}to{transform:scaleY(1)}`;
export const fill = keyframes`from{width:0}to{width:100%}`;
export const marquee = keyframes`from{transform:translateX(0)}to{transform:translateX(-50%)}`;
export const slideIn = keyframes`from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}`;
export const blink = keyframes`0%,100%{opacity:1}50%{opacity:.3}`;
export const drift = keyframes`from{transform:translateY(16px)}to{transform:translateY(-24px)}`;
export const gone = keyframes`to{opacity:0}`;
export const ring = keyframes`0%,100%{box-shadow:inset 0 0 0 2px #e8a020}50%{box-shadow:inset 0 0 0 2px transparent}`;
export const toGold = keyframes`to{background:#e8a020;color:#0a1628;border-color:#14161b}`;

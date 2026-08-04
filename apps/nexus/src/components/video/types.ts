/**
 * The contract every video surface honours, so the player above it never learns
 * which one it is driving.
 *
 * There are two surfaces and they are not alike. One is a <video> fed proxied
 * bytes, with real DOM events. The other is YouTube's iframe, which exposes no
 * timeupdate, no seeked and no ratechange, and has to be polled. Before this
 * split, each of them carried its own copy of the gating rules, and the YouTube
 * copy was a release behind. Now the rules live in lib/video-gate.ts, the
 * player enforces them once, and a surface only has to answer four questions:
 * where are you, how long are you, are you paused, and please move.
 */

export interface VideoTransport {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getTime(): number;
  /** 0 until the surface knows. Never assume it is finite. */
  getDuration(): number;
  setRate(rate: number): void;
  isPaused(): boolean;
}

export type VideoSource =
  /** Bytes streamed through our own proxy. No shareable Microsoft URL. */
  | { kind: 'html5'; src: string }
  /**
   * The YouTube backup copy. A degraded fallback, not a security boundary: the
   * video id is in the DOM because YouTube's bytes cannot be proxied.
   */
  | { kind: 'youtube'; youtubeId: string };

export interface VideoSurfaceEvents {
  /** Every frame-ish. `duration` is 0 until the surface reports one. */
  onTick(seconds: number, duration: number): void;
  onPlayingChange(playing: boolean): void;
  onLoadedMetadata(duration: number): void;
  onEnded(): void;
  /**
   * A seek this player did not ask for: a keyboard arrow, a trackpad gesture, a
   * console call. HTML5 only, and fired on `seeked` rather than `timeupdate` so
   * the jumped-to frame is never painted.
   */
  onSeeked(seconds: number): void;
  /** The rate moved under us, possibly from a console. HTML5 only. */
  onRateChange(rate: number): void;
  onError(): void;
}

export interface VideoSurfaceProps {
  events: VideoSurfaceEvents;
  /** Filled in by the surface on mount so the player can drive it. */
  transportRef: React.MutableRefObject<VideoTransport | null>;
}

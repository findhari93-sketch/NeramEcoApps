/**
 * The contract every video surface honours, so the player above it never learns
 * which one it is driving.
 *
 * There are two surfaces and they are not alike. One is a <video> fed proxied
 * bytes, with real DOM events. The other is YouTube's iframe, which exposes no
 * timeupdate, no seeked and no ratechange, and has to be polled. Before this
 * split, each of them carried its own copy of the gating rules, and the YouTube
 * copy was a release behind. Now the rules live in lib/video-gate.ts, the
 * player enforces them once, and a surface only has to answer the questions
 * below.
 *
 * Every event here is REQUIRED, deliberately. Optional events are how the two
 * surfaces drifted apart the first time: one grew a capability, the other
 * quietly did not implement it, and nothing failed loudly enough to notice. A
 * surface that genuinely cannot answer something says so in its return value
 * (an empty array, a false) rather than by omitting the method.
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

  /**
   * What has downloaded, in seconds, merged and ascending. An empty array is a
   * legitimate "cannot say" and the bar simply omits the layer.
   */
  getBuffered(): ReadonlyArray<readonly [number, number]>;

  /** 0..1 at this boundary. YouTube's own scale is 0..100; it converts. */
  setVolume(value: number): void;
  getVolume(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /**
   * False on iOS, where `video.volume` is ignored outright and only the hardware
   * buttons move it. The UI hides the slider rather than shipping a dead one.
   * Mute is honoured everywhere, so the mute button stays.
   */
  isVolumeSettable(): boolean;

  /**
   * False on the YouTube surface: we cannot put someone else's iframe into
   * Picture in Picture, and Chrome's own affordance over a YouTube embed is a
   * browser feature we neither trigger nor control. Do not fake it.
   */
  supportsPictureInPicture(): boolean;
  enterPictureInPicture(): Promise<void>;
  exitPictureInPicture(): Promise<void>;

  /**
   * Empty on the YouTube surface. Its captions live inside the iframe and are
   * not reliably enumerable, and `setOption('captions', ...)` is undocumented
   * and has broken repeatedly. A menu that half works on one path is worse than
   * no menu, so the button renders nothing there.
   */
  getTextTracks(): ReadonlyArray<TextTrackDescriptor>;
  /** null turns captions off. */
  setTextTrack(id: string | null): void;
  getActiveTextTrack(): string | null;
}

export interface TextTrackDescriptor {
  id: string;
  label: string;
  lang: string;
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
   * console call, an OS media key. HTML5 only, and fired on `seeked` rather than
   * `timeupdate` so the jumped-to frame is never painted.
   */
  onSeeked(seconds: number): void;
  /** The rate moved under us, possibly from a console. HTML5 only. */
  onRateChange(rate: number): void;
  onError(): void;

  /**
   * Playback has stalled waiting for data. Drives the spinner and nothing else.
   *
   * Worth having on the proxied path specifically: the byte proxy answers at most
   * 4MB per request, so a weak connection stalls often, and with no indicator a
   * stall was indistinguishable from a freeze.
   */
  onWaiting(): void;
  onPlayable(): void;
  /** May arrive from a console, a hardware key, or the OS. */
  onVolumeChange(volume: number, muted: boolean): void;
  /** Including the OS-level close button on the PiP window. */
  onPipChange(active: boolean): void;
  onTextTracksChange(): void;
}

export interface VideoSurfaceProps {
  events: VideoSurfaceEvents;
  /** Filled in by the surface on mount so the player can drive it. */
  transportRef: React.MutableRefObject<VideoTransport | null>;
}

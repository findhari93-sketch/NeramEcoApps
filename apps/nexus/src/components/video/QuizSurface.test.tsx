import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QuizSurface from './QuizSurface';
import { VIDEO_OVERLAY_DIALOG_ATTR } from './overlay-dialog';

/**
 * The bug this file exists for.
 *
 * QuizModal took a `container` so a checkpoint quiz could be drawn inside the
 * player while it was fullscreen. The mobile branch passed it. The desktop
 * branch hardcoded its ModalProps and dropped it, so on a desktop browser in
 * native fullscreen the quiz portalled to document.body, which a fullscreen
 * browser does not paint. The student hit a checkpoint, the video paused, the
 * "Finish this section before skipping ahead" nudge flashed, and then nothing:
 * no quiz, no way forward, no explanation.
 *
 * So the assertions here are about WHERE the quiz lands, not what it says.
 */

/** jsdom lays nothing out, so a host has to be told how big it is. */
function makeHost(width: number, height: number): HTMLElement {
  const host = document.createElement('div');
  host.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(host);
  return host;
}

let hosts: HTMLElement[] = [];

beforeEach(() => {
  hosts = [];
});

afterEach(() => {
  hosts.forEach((h) => h.remove());
});

function host(width = 1280, height = 720) {
  const el = makeHost(width, height);
  hosts.push(el);
  return el;
}

describe('QuizSurface: where the quiz lands', () => {
  it('draws inside the player container, not on document.body, when fullscreen', () => {
    const container = host();
    render(
      <QuizSurface open container={container} dismissable={false} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Checkpoint quiz' });
    expect(container.contains(dialog)).toBe(true);
    // The whole point. A fullscreen browser paints only the fullscreen
    // element's subtree, so a dialog whose nearest painted ancestor is <body>
    // is a dialog the student never sees.
    expect(dialog.closest(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`)).not.toBeNull();
  });

  it('renders nothing into the container while closed', () => {
    const container = host();
    render(
      <QuizSurface open={false} container={container} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    expect(container.querySelector(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`)).toBeNull();
  });

  it('falls back to a viewport drawer when the player is not fullscreen', () => {
    render(
      <QuizSurface open container={null} onDismiss={() => {}} ariaLabel="Redo quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Redo quiz' });
    // MUI portals its drawer to the body, which is right when there is no
    // fullscreen subtree competing for the paint.
    expect(dialog.closest(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`)).toBeNull();
    expect(screen.getByText('Question one')).toBeTruthy();
  });

  it('marks the overlay so the player can decline its keys and swipes', () => {
    // The overlay is a DOM descendant of the player while fullscreen, unlike the
    // body portal it replaced, so Space on an answer button would reach the
    // player's keydown listener and start the video underneath. The player
    // declines events carrying this attribute; see overlay-dialog.ts.
    const container = host();
    render(
      <QuizSurface open container={container} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    expect(container.querySelector(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`)).not.toBeNull();
  });
});

describe('QuizSurface: the shape it takes', () => {
  it('is a side panel on a wide surface, so the paused frame stays visible', () => {
    const container = host(1280, 720);
    render(
      <QuizSurface open container={container} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    // A full-height panel against the right edge. The question is usually about
    // what is on screen, so covering the screen to ask it is the wrong trade.
    expect(screen.getByRole('dialog').dataset.quizLayout).toBe('side');
  });

  it('becomes a bottom sheet when there is no room beside the video', () => {
    // A phone held upright inside the CSS fullscreen fallback.
    const container = host(390, 780);
    render(
      <QuizSurface open container={container} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    expect(screen.getByRole('dialog').dataset.quizLayout).toBe('sheet');
  });

  it('is a bottom sheet on a short landscape surface too', () => {
    // Wide enough, but a 360px-tall panel of questions is unusable.
    const container = host(900, 360);
    render(
      <QuizSurface open container={container} onDismiss={() => {}} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    expect(screen.getByRole('dialog').dataset.quizLayout).toBe('sheet');
  });
});

describe('QuizSurface: dismissal', () => {
  it('does not let a mandatory checkpoint be clicked away', () => {
    const onDismiss = vi.fn();
    const container = host();
    render(
      <QuizSurface open container={container} dismissable={false} onDismiss={onDismiss} ariaLabel="Checkpoint quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    const scrim = container.querySelector(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`) as HTMLElement;
    scrim.click();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('closes a dismissable quiz when the scrim is clicked', () => {
    const onDismiss = vi.fn();
    const container = host();
    render(
      <QuizSurface open container={container} onDismiss={onDismiss} ariaLabel="Redo quiz">
        <p>Question one</p>
      </QuizSurface>,
    );
    const scrim = container.querySelector(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`) as HTMLElement;
    scrim.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a click on the panel is not a click on the scrim', () => {
    const onDismiss = vi.fn();
    const container = host();
    render(
      <QuizSurface open container={container} onDismiss={onDismiss} ariaLabel="Redo quiz">
        <button type="button">Option A</button>
      </QuizSurface>,
    );
    screen.getByRole('button', { name: 'Option A' }).click();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

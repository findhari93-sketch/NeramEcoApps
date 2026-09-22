import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import YouTubeFindDialog from './YouTubeFindDialog';
import type { FindRow } from '@/lib/youtube-solution-titles';

/**
 * "Find on YouTube" for one paper: search the channel, show what was found
 * and what needs a look, and fill the links in as unsaved drafts. Nothing is
 * saved here.
 */

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

const ROWS: FindRow[] = [
  { id: 'q2', number: 2, section: 'math_mcq', savedUrl: null, splitDrawing: false },
  { id: 'q22', number: 22, section: 'math_mcq', savedUrl: null, splitDrawing: false },
  { id: 'q31', number: 31, section: 'aptitude', savedUrl: watch('xrKukhHIt0A'), splitDrawing: false },
  { id: 'q32', number: 32, section: 'aptitude', savedUrl: watch('T9CB0HymAJo'), splitDrawing: false },
];

function video(title: string, videoId: string) {
  const match = /Q no\s+0?(\d+) - JEE (\d{4})/.exec(title)!;
  const section = /Math/.test(title) ? 'math' : /Aptitude/.test(title) ? 'aptitude' : null;
  return {
    videoId,
    title,
    publishedAt: '2026-09-22T10:00:00Z',
    parsed: { number: Number(match[1]), exam: 'JEE_PAPER_2', year: Number(match[2]), section, session: null, shift: null },
  };
}

const PAPER = { exam_type: 'JEE_PAPER_2', year: 2014, session: null, shift: null };

function pageResponse(videos: ReturnType<typeof video>[], checked: number, nextPageToken: string | null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { videos, checked, nextPageToken, paper: PAPER, paperCountThatYear: 1, channelTitle: 'neramClasses' } }),
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(props: Partial<React.ComponentProps<typeof YouTubeFindDialog>> = {}) {
  const onFill = vi.fn();
  render(
    <YouTubeFindDialog
      open
      onClose={vi.fn()}
      paperId="p2014"
      rows={ROWS}
      examType="JEE_PAPER_2"
      year={2014}
      getToken={async () => 't'}
      canConnect={false}
      onFill={onFill}
      {...props}
    />,
  );
  return { onFill };
}

describe('YouTubeFindDialog', () => {
  it('says what it will look for before it looks', () => {
    open();
    expect(screen.getByText(/Q no 22 - JEE 2014 Solution Video/)).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches every page, then says what it found and what needs a look', async () => {
    fetchMock
      .mockResolvedValueOnce(pageResponse([video('Q no 22 - JEE 2014 Solution Video - Math Solution', 'U1X9MmLh-ZQ')], 250, 'NEXT'))
      .mockResolvedValueOnce(
        pageResponse(
          [
            video('Q no 31 - JEE 2014 Solution Video - Aptitude Solution', 'newVideo001'),
            video('Q no 32 - JEE 2014 Solution Video - Aptitude Solution', 'T9CB0HymAJo'),
            video('Q no 02 - JEE 2014 Solution Video - Aptitude Solution', 'wrongSect01'),
          ],
          120,
          null,
        ),
      );
    const { onFill } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Search the channel' }));

    expect(await screen.findByText('4 found for this paper')).not.toBeNull();
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=NEXT');
    expect(screen.getByText('1 new, 1 replace a saved link, 1 already saved')).not.toBeNull();

    const look = screen.getByRole('region', { name: 'Needs a look' });
    expect(within(look).getByText('The title says Aptitude, but Q2 is in Mathematics (MCQ)')).not.toBeNull();
    expect(within(look).getByText(/Replaces the saved link/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fill in 2 links' }));
    expect(onFill).toHaveBeenCalledWith([
      { questionId: 'q22', number: 22, url: watch('U1X9MmLh-ZQ') },
      { questionId: 'q31', number: 31, url: watch('newVideo001') },
    ]);
  });

  it('shows how far it has got while it searches, and can stop', async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(pageResponse([], 250, 'NEXT'))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Search the channel' }));
    expect(await screen.findByText('Checked 250 uploads, found 0 for this paper')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    release(pageResponse([], 250, 'MORE'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search the channel' })).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says plainly when YouTube is not connected, with the way to fix it for an admin', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'not_connected', message: 'YouTube is not connected to Nexus.' }) });
    open({ canConnect: true });
    fireEvent.click(screen.getByRole('button', { name: 'Search the channel' }));
    expect(await screen.findByText('YouTube is not connected to Nexus.')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/teacher/admin/settings');
  });

  it('keeps the Settings link from teachers who cannot use it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'not_connected', message: 'YouTube is not connected to Nexus.' }) });
    open({ canConnect: false });
    fireEvent.click(screen.getByRole('button', { name: 'Search the channel' }));
    expect(await screen.findByText(/Ask an admin/)).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Open Settings' })).toBeNull();
  });

  it('says when nothing on the channel matches this paper', async () => {
    fetchMock.mockResolvedValue(pageResponse([], 40, null));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Search the channel' }));
    expect(await screen.findByText(/No videos for this paper/)).not.toBeNull();
  });
});

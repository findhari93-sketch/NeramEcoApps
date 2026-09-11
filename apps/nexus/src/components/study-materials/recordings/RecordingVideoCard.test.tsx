import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RecordingVideoCard, { type RecordingVideoCardProps } from './RecordingVideoCard';
import type { RecordingTrackView } from '@/lib/recording-flow';

/**
 * The video on a recording, which a teacher has to be able to recognise and play.
 *
 * It used to read "DispForm.aspx" beside a "SharePoint" chip, with "Change" and
 * "Move" buttons nobody could explain and no way to watch the file. These tests
 * pin the fixes: the real name, where it lives and how long it runs, play in
 * place, and actions that say what they do.
 */

const DISPFORM =
  'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/Forms/DispForm.aspx?ID=10171';

const recording = {
  name: '1.History of Architecture.mp4',
  web_url:
    'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/CommonPC/1.History%20of%20Architecture.mp4',
  folder_path: 'CommonPC/1 - Class/2/Study materials',
  size_bytes: 877174153,
  duration_seconds: 3758,
  drive_type: 'documentLibrary',
  problem: null,
};

const track = (over: Partial<RecordingTrackView> = {}): RecordingTrackView => ({
  id: 't1',
  language: 'ta',
  language_label: 'தமிழ்',
  title: 'Ch:1 History Of Architecture (தமிழ்)',
  status: 'draft',
  readiness: 'ready',
  hold_reason: null,
  section_count: 4,
  video_duration_seconds: 3758,
  video_source: 'sharepoint',
  recording_url: DISPFORM,
  recording_file_name: null,
  recording,
  transcript: null,
  question_count: 40,
  ...over,
});

function renderCard(t: RecordingTrackView = track(), over: Partial<RecordingVideoCardProps> = {}) {
  const props: RecordingVideoCardProps = {
    label: 'தமிழ்',
    track: t,
    thumbnailUrl: null,
    player: null,
    onPlay: vi.fn(),
    onReplace: vi.fn(),
    moveTargets: [{ code: 'en', label: 'English', taken: false }],
    onMove: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  render(<RecordingVideoCard {...props} />);
  return props;
}

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More actions for the தமிழ் recording' }));

describe('RecordingVideoCard', () => {
  it('names the real file, never the SharePoint page its link ended in', () => {
    renderCard();
    expect(document.body.textContent).toContain('1.History of Architecture.mp4');
    expect(document.body.textContent).not.toContain('DispForm.aspx');
  });

  it('says where the file is and how long it runs', () => {
    renderCard();
    expect(document.body.textContent).toContain('CommonPC › 1 - Class › 2 › Study materials');
    expect(document.body.textContent).toContain('1:02:38');
  });

  it('tells the teacher students can play it when nothing is wrong', () => {
    renderCard();
    expect(document.body.textContent).toContain('Students can play this');
  });

  it('explains a video kept in OneDrive, and puts the fix next to it', () => {
    const props = renderCard(track({ recording: { ...recording, drive_type: 'business', problem: 'RECORDING_IN_ONEDRIVE' } }));
    expect(document.body.textContent).toContain('personal OneDrive');
    expect(document.body.textContent).not.toContain('Students can play this');
    fireEvent.click(screen.getAllByRole('button', { name: 'Replace video' })[0]);
    expect(props.onReplace).toHaveBeenCalled();
  });

  it('plays the video in place when the picture is pressed', () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Play the தமிழ் recording' }));
    expect(props.onPlay).toHaveBeenCalled();
  });

  it('shows the player instead of the picture once playing', () => {
    renderCard(track(), { player: <div>player here</div> });
    expect(document.body.textContent).toContain('player here');
    expect(screen.queryByRole('button', { name: 'Play the தமிழ் recording' })).toBeNull();
  });

  it('opens the file in SharePoint in a new tab', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /Open in SharePoint/ });
    expect(link.getAttribute('href')).toBe(recording.web_url);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('names the language a recording would move to, and what moving keeps', () => {
    const props = renderCard();
    openMenu();
    const item = screen.getByRole('menuitem', { name: /Move to English/ });
    expect(item.textContent).toContain('Keeps its transcript and checkpoints');
    fireEvent.click(item);
    expect(props.onMove).toHaveBeenCalledWith('en');
  });

  it('shows a language that already has a video, and will not move into it', () => {
    const props = renderCard(track(), { moveTargets: [{ code: 'en', label: 'English', taken: true }] });
    openMenu();
    const item = screen.getByRole('menuitem', { name: /Move to English/ });
    expect(item.textContent).toContain('English already has a video');
    fireEvent.click(item);
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('removes the recording from the menu', () => {
    const props = renderCard();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove recording/ }));
    expect(props.onRemove).toHaveBeenCalled();
  });
});

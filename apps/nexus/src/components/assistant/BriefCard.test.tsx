import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BriefCard from './BriefCard';

const swr = { data: undefined as unknown, error: undefined as unknown, isLoading: false };
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: () => swr }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ tokenReady: true, isFeatureEnabled: () => true }) }));
const assistant = { enabled: true, openPanel: vi.fn() };
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => assistant }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  swr.data = undefined;
  swr.error = undefined;
  swr.isLoading = false;
  assistant.openPanel.mockReset();
});

describe('BriefCard', () => {
  it('shows a skeleton while loading, reserving the space', () => {
    swr.isLoading = true;
    render(<BriefCard />);
    expect(screen.queryByTestId('brief-skeleton')).not.toBeNull();
  });
  it('renders the greeting, sections with links, and the two buttons', () => {
    swr.data = { brief: { greeting: 'Good morning, Priya', classroomName: 'JEE', hasContent: true, sections: [
      { id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' },
      { id: 'reminders', text: 'You asked me to remind you today: bring the sketchbook.', link: null },
    ] } };
    render(<BriefCard />);
    expect(screen.queryByText('Good morning, Priya')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Class today at 6:00 pm/ }).getAttribute('href')).toBe('/student/timetable');
    expect(screen.queryByText(/bring the sketchbook/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(assistant.openPanel).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole('button', { name: "Can't attend" }));
    expect(assistant.openPanel).toHaveBeenCalledWith("I can't attend a class");
  });
  it('renders nothing when there is nothing to say or the server refused', () => {
    swr.data = { brief: { greeting: 'Hi', classroomName: null, hasContent: false, sections: [] } };
    const { container, unmount } = render(<BriefCard />);
    expect(container.innerHTML).toBe('');
    unmount();
    swr.data = undefined;
    swr.error = { status: 403 };
    expect(render(<BriefCard />).container.innerHTML).toBe('');
  });
});

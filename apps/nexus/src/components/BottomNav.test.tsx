import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BottomNav from './BottomNav';

/**
 * The "More" sheet is the only way to reach most of Nexus on a phone: the
 * desktop sidebar is hidden below 900px and the bar itself holds four tabs.
 * Management's sheet carries fourteen links, so the properties worth holding are
 * that every one of them renders, that a count on a hidden item is still visible
 * from the closed bar, and that headings only appear over something.
 */

const push = vi.fn();
let pathname = '/teacher/classrooms';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

const badges: Record<string, number> = {};
vi.mock('./NavBadgeProvider', () => ({
  useNavBadges: () => ({
    getBadgeCount: (path: string) => badges[path] ?? 0,
    refreshBadges: () => {},
  }),
}));

/**
 * The shared setup answers every media query with `matches: false`, which puts
 * BottomNav on the desktop branch where it renders nothing. Phones are the only
 * viewport it exists for, so answer the width queries the way a phone would.
 */
function pretendPhone() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const icon = null;
const ITEMS = [
  { label: 'Classrooms', path: '/teacher/classrooms', icon },
  { label: 'Students', path: '/teacher/students', icon },
];
const GROUPS = [
  {
    label: 'Progress',
    items: [
      { label: 'Catch-up', path: '/teacher/catch-up', icon },
      { label: 'Engagement', path: '/teacher/library/engagement', icon },
    ],
  },
  {
    label: 'Assessment',
    items: [{ label: 'Tests', path: '/teacher/tests', icon }],
  },
];

const openSheet = () => fireEvent.click(screen.getByText('More'));

describe('BottomNav More sheet', () => {
  beforeEach(() => {
    pretendPhone();
    push.mockClear();
    pathname = '/teacher/classrooms';
    for (const key of Object.keys(badges)) delete badges[key];
  });

  it('renders every group heading and every item', () => {
    render(<BottomNav items={ITEMS} overflowGroups={GROUPS} />);
    openSheet();

    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Assessment')).toBeTruthy();
    for (const item of GROUPS.flatMap((g) => g.items)) {
      expect(screen.getByText(item.label)).toBeTruthy();
    }
  });

  it('reaches Catch-up, the item that was unreachable', () => {
    render(<BottomNav items={ITEMS} overflowGroups={GROUPS} />);
    openSheet();
    fireEvent.click(screen.getByText('Catch-up'));
    expect(push).toHaveBeenCalledWith('/teacher/catch-up');
  });

  it('rolls the badge of a hidden item up onto the More button', () => {
    // Without this a student or teacher has to open the sheet to discover there
    // is anything in it, which for work that is owed is no use at all.
    badges['/teacher/catch-up'] = 3;
    badges['/teacher/tests'] = 2;
    render(<BottomNav items={ITEMS} overflowGroups={GROUPS} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('still accepts a flat list, with no heading over it', () => {
    render(<BottomNav items={ITEMS} overflowItems={[{ label: 'Guide', path: '/teacher/guide', icon }]} />);
    openSheet();
    expect(screen.getByText('Guide')).toBeTruthy();
  });

  it('shows no More button when nothing overflows', () => {
    render(<BottomNav items={ITEMS} overflowGroups={[]} />);
    expect(screen.queryByText('More')).toBeNull();
  });

  it('drops a group the feature flags emptied', () => {
    render(
      <BottomNav
        items={ITEMS}
        overflowGroups={[{ label: 'Progress', items: [] }, GROUPS[1]]}
      />,
    );
    openSheet();
    expect(screen.queryByText('Progress')).toBeNull();
    expect(screen.getByText('Assessment')).toBeTruthy();
  });

  it('marks More as the active tab when the open page lives inside the sheet', () => {
    pathname = '/teacher/catch-up';
    render(<BottomNav items={ITEMS} overflowGroups={GROUPS} />);
    const more = screen.getByText('More').closest('button');
    expect(more?.className).toContain('Mui-selected');
  });
});

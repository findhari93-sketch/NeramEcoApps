/**
 * The guard that makes the mobile-navigation bug unrepeatable.
 *
 * Catch-up sat in the Management sidebar and in neither mobile list for as long
 * as it existed, so on a phone it could not be reached at all. Eight other items
 * were in the same state across the four surfaces. Nothing caught it because
 * nothing asserted the relationship between the three arrays.
 *
 * The first test here is that assertion. It would have failed the day Catch-up
 * shipped, and it fails again the day someone reintroduces a hand-written
 * overflow list.
 */
import { describe, it, expect } from 'vitest';
import {
  PANELS,
  ZONES,
  groupNavItems,
  panelBottomNav,
  panelOverflow,
  zoneOverflow,
  zoneSidebarItems,
  type NavItem,
} from './nav-config';

const paths = (items: NavItem[]) => items.map((i) => i.path);

describe('nav-config: every desktop item is reachable on a phone', () => {
  it.each(PANELS.map((p) => [p.id, p] as const))(
    '%s panel: no sidebar item is missing from the bottom bar or the More sheet',
    (_id, panel) => {
      const mobile = new Set([...paths(panelBottomNav(panel)), ...paths(panelOverflow(panel))]);
      const unreachable = paths(panel.sidebarItems).filter((p) => !mobile.has(p));
      expect(unreachable).toEqual([]);
    },
  );

  it.each(ZONES.map((z) => [z.id, z] as const))(
    '%s zone: no sidebar item is missing from the bottom bar or the More sheet',
    (_id, zone) => {
      const mobile = new Set([...paths(zone.bottomNavItems), ...paths(zoneOverflow(zone))]);
      const unreachable = paths(zoneSidebarItems(zone)).filter((p) => !mobile.has(p));
      expect(unreachable).toEqual([]);
    },
  );

  // The four specific items this change was opened for. Named rather than
  // counted, so the test says what broke rather than "expected 18 to be 14".
  it('reaches the items that were unreachable', () => {
    const management = PANELS.find((p) => p.id === 'management')!;
    expect(paths(panelOverflow(management))).toEqual(
      expect.arrayContaining([
        '/teacher/catch-up',
        '/teacher/study-materials',
        '/teacher/study-materials/feedback',
        '/teacher/devices',
      ]),
    );

    const teaching = PANELS.find((p) => p.id === 'teaching')!;
    expect(paths(panelOverflow(teaching))).toEqual(
      expect.arrayContaining(['/teacher/curriculum', '/teacher/course-plans']),
    );

    const study = ZONES.find((z) => z.id === 'study')!;
    expect(paths(zoneOverflow(study))).toEqual(
      expect.arrayContaining(['/student/study-materials/starred', '/student/resources']),
    );
  });

  it('keeps Catch-up in the student Classroom More sheet', () => {
    const classroom = ZONES.find((z) => z.id === 'classroom')!;
    expect(paths(zoneOverflow(classroom))).toContain('/student/catch-up');
  });

  /**
   * The guard that would have caught the second door the day it shipped.
   *
   * The Study Zone used to carry a "Class Recaps" item beside Catch-up in the
   * Classroom zone. Both led to the same recordings, but only the Catch-up
   * route starts the clock, so a student who used the Study Zone one did the
   * work and still read as "not started" to their teacher. There must be
   * exactly one way in, and this asserts it by path rather than by label so a
   * rename cannot quietly reopen it.
   */
  it('offers no second door to a class recording outside Catch-up', () => {
    const study = ZONES.find((z) => z.id === 'study')!;
    const everywhere = [
      ...paths(zoneOverflow(study)),
      ...paths(study.bottomNavItems),
      ...study.navGroups.flatMap((g) => paths(g.items)),
    ];
    expect(everywhere.filter((p) => p.startsWith('/student/class-recap'))).toEqual([]);

    const classroom = ZONES.find((z) => z.id === 'classroom')!;
    expect(paths(zoneOverflow(classroom))).toContain('/student/catch-up');
  });
});

describe('nav-config: the bottom bar and the sheet do not overlap', () => {
  it.each(PANELS.map((p) => [p.id, p] as const))('%s panel', (_id, panel) => {
    const bar = new Set(paths(panelBottomNav(panel)));
    expect(paths(panelOverflow(panel)).filter((p) => bar.has(p))).toEqual([]);
  });

  it.each(ZONES.map((z) => [z.id, z] as const))('%s zone', (_id, zone) => {
    const bar = new Set(paths(zone.bottomNavItems));
    expect(paths(zoneOverflow(zone)).filter((p) => bar.has(p))).toEqual([]);
  });
});

describe('nav-config: the configuration itself is sound', () => {
  it.each(PANELS.map((p) => [p.id, p] as const))(
    '%s panel promotes only paths that exist in its sidebar',
    (_id, panel) => {
      // A promoted path with no matching item resolves to nothing, so it would
      // vanish from the bar AND from the sheet: the exact failure this file
      // exists to prevent, arriving through the back door.
      const known = new Set(paths(panel.sidebarItems));
      expect(panel.bottomNavPaths.filter((p) => !known.has(p))).toEqual([]);
      expect(panelBottomNav(panel)).toHaveLength(panel.bottomNavPaths.length);
    },
  );

  it.each(PANELS.map((p) => [p.id, p] as const))(
    '%s panel keeps the bar to four tabs, leaving the fifth slot for More',
    (_id, panel) => {
      expect(panel.bottomNavPaths.length).toBeLessThanOrEqual(4);
    },
  );

  it.each(PANELS.map((p) => [p.id, p] as const))('%s panel has no duplicate paths', (_id, panel) => {
    const all = paths(panel.sidebarItems);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(ZONES.map((z) => [z.id, z] as const))('%s zone has no duplicate paths', (_id, zone) => {
    const all = paths(zoneOverflow(zone));
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every zone extra a heading to fall under', () => {
    for (const zone of ZONES) {
      for (const item of zone.extraOverflowItems) {
        expect(item.group, `${zone.id}: ${item.label}`).toBeTruthy();
      }
    }
  });
});

describe('groupNavItems', () => {
  const item = (path: string, group?: string): NavItem => ({ label: path, path, icon: null, group });

  it('keeps array order inside a group and orders groups by first appearance', () => {
    const groups = groupNavItems([
      item('/b', 'Second'),
      item('/a', 'First'),
      item('/c', 'Second'),
      item('/d', 'First'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Second', 'First']);
    expect(paths(groups[0].items)).toEqual(['/b', '/c']);
    expect(paths(groups[1].items)).toEqual(['/a', '/d']);
  });

  it('collects ungrouped items into a trailing headingless bucket', () => {
    const groups = groupNavItems([item('/a'), item('/b', 'Named'), item('/c')]);
    expect(groups.map((g) => g.label)).toEqual(['Named', '']);
    expect(paths(groups[1].items)).toEqual(['/a', '/c']);
  });

  it('loses nothing', () => {
    for (const panel of PANELS) {
      const overflow = panelOverflow(panel);
      const grouped = groupNavItems(overflow).flatMap((g) => g.items);
      expect(paths(grouped).sort()).toEqual(paths(overflow).sort());
    }
  });

  it('drops a heading whose items were all filtered out', () => {
    // The providers filter before grouping, so an entirely switched-off section
    // must not leave a heading floating over nothing.
    const survivors = PANELS[1].sidebarItems.filter((i) => i.group === 'Assessment');
    expect(groupNavItems(survivors).map((g) => g.label)).toEqual(['Assessment']);
    expect(groupNavItems([])).toEqual([]);
  });
});

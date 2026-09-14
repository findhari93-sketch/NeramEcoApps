'use client';

import ListSortMenu from '@/components/students/list/ListSortMenu';
import { ROSTER_SORTS, ROSTER_SORT_LABEL, type RosterSort } from '@/lib/student-roster-view';

const OPTIONS = ROSTER_SORTS.map((key) => ({ key, label: ROSTER_SORT_LABEL[key] }));

/**
 * How the Students roster is ordered. The shared ListSortMenu (a menu on a
 * pointer screen, a sheet on a phone), with the roster's own sorts, so every
 * student list in Nexus sorts through the same control.
 */
export default function StudentSortMenu({
  value,
  onChange,
}: {
  value: RosterSort;
  onChange: (sort: RosterSort) => void;
}) {
  return <ListSortMenu<RosterSort> value={value} options={OPTIONS} onChange={onChange} />;
}

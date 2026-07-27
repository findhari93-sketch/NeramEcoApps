'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTimetableView } from '@/hooks/useTimetableView';
import CalendarShell from '@/components/timetable/CalendarShell';
import AgendaView from '@/components/timetable/views/AgendaView';
import GridView from '@/components/timetable/views/GridView';
import DayView from '@/components/timetable/views/DayView';
import MonthView from '@/components/timetable/views/MonthView';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import {
  formatDateISO,
  monthGridRangeFor,
  type HolidayInfo,
} from '@/components/timetable/date-utils';
import { type PlanShape } from '@/lib/plan-shape';

/**
 * The parent's read-only view of the class timetable.
 *
 * Migrated off the legacy WeeklyCalendarGrid onto the shared calendar, so a
 * parent now gets the same Day / Week / Month / Agenda views the teacher and
 * student have, plus holidays and tappable classes, none of which the old grid
 * was ever wired up for here.
 */
export default function ParentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});
  const [planShapes, setPlanShapes] = useState<PlanShape[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);

  const viewState = useTimetableView(classes, 'agenda', planShapes);
  const { week, band, view, anchorDate, setAnchorDate, range, configuredWindow } = viewState;

  // Whole month grids, so paging weeks inside a loaded month costs nothing.
  const fetchRange = useMemo(
    () => monthGridRangeFor(anchorDate, range.start, range.end),
    [anchorDate, range.start, range.end],
  );
  const loadedRange = useRef<{ classroomId: string; start: string; end: string } | null>(null);

  const visibleClasses = useMemo(
    () => classes.filter((c) => c.scheduled_date >= range.start && c.scheduled_date <= range.end),
    [classes, range.start, range.end],
  );

  /** The anchor's whole week, so the Day view's strip marks every day with a class. */
  const weekClasses = useMemo(
    () => classes.filter((c) => c.scheduled_date >= week.start && c.scheduled_date <= week.end),
    [classes, week.start, week.end],
  );

  const markedDates = useMemo(() => new Set(classes.map((c) => c.scheduled_date)), [classes]);
  const holidayDates = useMemo(() => new Set(Object.keys(holidays)), [holidays]);

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;

    const have = loadedRange.current;
    if (
      have &&
      have.classroomId === activeClassroom.id &&
      have.start <= fetchRange.start &&
      have.end >= fetchRange.end
    ) {
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Deliberately /api/timetable rather than /my-schedule: that route is
      // enrollment-scoped around a student, and repointing a parent at it is a
      // behaviour change that does not belong in a UI migration.
      const [classRes, holidayRes] = await Promise.all([
        fetch(
          `/api/timetable?classroom=${activeClassroom.id}&start=${fetchRange.start}&end=${fetchRange.end}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        fetch(
          `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${fetchRange.start}&end=${fetchRange.end}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);

      if (classRes.ok) {
        const data = await classRes.json();
        setClasses(data.classes || []);
        // Previously fetched and thrown away, which left the parent's band on
        // the global window even mid crash course.
        setPlanShapes(data.planShapes || []);
        loadedRange.current = {
          classroomId: activeClassroom.id,
          start: fetchRange.start,
          end: fetchRange.end,
        };
      }

      if (holidayRes.ok) {
        const data = await holidayRes.json();
        const map: Record<string, HolidayInfo> = {};
        for (const h of data.holidays || []) {
          map[h.holiday_date] = { title: h.title, description: h.description };
        }
        setHolidays(map);
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, fetchRange.start, fetchRange.end, getToken]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return (
    <Box>
      <CalendarShell
        state={viewState}
        railSubtitle={activeClassroom?.name}
        markedDates={markedDates}
        holidayDates={holidayDates}
      >
        {view === 'month' && range.month ? (
          <MonthView
            classes={visibleClasses}
            month={range.month}
            loading={loading}
            holidays={holidays}
            role="parent"
            anchorISO={formatDateISO(anchorDate)}
            onClassClick={setSelectedClass}
            onOpenDay={(iso) => {
              setAnchorDate(new Date(`${iso}T00:00:00`));
              viewState.setView('day');
            }}
          />
        ) : view === 'week' ? (
          <GridView
            classes={visibleClasses}
            week={week}
            band={band}
            loading={loading}
            holidays={holidays}
            role="parent"
            onClassClick={setSelectedClass}
            scrollToTime={configuredWindow.start}
          />
        ) : view === 'day' ? (
          <DayView
            classes={visibleClasses}
            weekClasses={weekClasses}
            week={week}
            anchorDate={anchorDate}
            band={band}
            onSelectDate={setAnchorDate}
            loading={loading}
            holidays={holidays}
            role="parent"
            onClassClick={setSelectedClass}
            scrollToTime={configuredWindow.start}
          />
        ) : (
          <AgendaView
            classes={visibleClasses}
            week={week}
            loading={loading}
            holidays={holidays}
            role="parent"
            onClassClick={setSelectedClass}
          />
        )}
      </CalendarShell>

      <ClassDetailPanel
        cls={selectedClass}
        open={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        role="parent"
        classroomId={selectedClass?.classroom?.id || activeClassroom?.id || ''}
        getToken={getToken}
      />
    </Box>
  );
}

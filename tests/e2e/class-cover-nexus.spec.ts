/**
 * Class cover image: the picture that stands in front of a class in every list.
 *
 * Proves the contract the list views depend on, and the parts that would fail
 * silently:
 *  - The gallery GET reports which image is starred, and lists in
 *    (sort_order, created_at) order. If that order ever disagrees with
 *    sortClassImages, the timetable shows a different picture from the editor.
 *  - Starring saves immediately and survives a reload.
 *  - Both week reads (teacher and student) carry the gallery embed, INCLUDING
 *    created_at, which the fallback tiebreak needs.
 *  - Creating a class still returns no gallery join, proving the write path was
 *    left on the narrow select.
 *  - Deleting the starred image clears the cover through the FK, and the next
 *    read falls back to the survivor rather than showing nothing.
 *  - A teacher cannot point one class at another class's image.
 *  - A student can read the cover but not set it.
 *  - A class with no images returns an empty array, not null.
 *
 * Creates real rows in the E2E classroom and removes them in afterAll.
 *
 * Run: pnpm test:e2e tests/e2e/class-cover-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

// A 1x1 transparent PNG, enough to exercise the upload path.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('Class cover image', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let classId: string | null = null;
  let otherClassId: string | null = null;
  let emptyClassId: string | null = null;
  let firstImageId: string | null = null;
  let secondImageId: string | null = null;
  let otherClassImageId: string | null = null;

  const stamp = Date.now();
  const PAST_DATE = isoDaysAgo(7);

  const authTeacher = () => ({ Authorization: `Bearer ${teacherToken}` });
  const authStudent = () => ({ Authorization: `Bearer ${studentToken}` });
  const jsonTeacher = () => ({ ...authTeacher(), 'Content-Type': 'application/json' });

  async function createClass(
    request: import('@playwright/test').APIRequestContext,
    title: string,
    date: string,
  ): Promise<string> {
    const create = await request.post(`${NEXUS}/api/timetable`, {
      headers: jsonTeacher(),
      data: {
        classroom_id: classroomId,
        title,
        scheduled_date: date,
        start_time: '19:00',
        end_time: '20:00',
      },
    });
    expect(create.ok()).toBe(true);
    return (await create.json()).class.id;
  }

  test('setup: three past classes, two images on the first', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;

    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`,
      { headers: authStudent() },
    );
    const { classrooms } = await res.json();
    test.skip(!classrooms?.length, 'Test student is not in any classroom');
    classroomId = classrooms[0].id;

    classId = await createClass(request, `E2ECover${stamp} main`, PAST_DATE);
    otherClassId = await createClass(request, `E2ECover${stamp} other`, isoDaysAgo(8));
    emptyClassId = await createClass(request, `E2ECover${stamp} empty`, isoDaysAgo(9));

    for (const name of ['first.png', 'second.png']) {
      const up = await request.post(`${NEXUS}/api/timetable/${classId}/images`, {
        headers: authTeacher(),
        multipart: { file: { name, mimeType: 'image/png', buffer: PNG_1PX } },
      });
      expect(up.ok()).toBe(true);
      const id = (await up.json()).image.id;
      if (name === 'first.png') firstImageId = id;
      else secondImageId = id;
    }

    const otherUp = await request.post(`${NEXUS}/api/timetable/${otherClassId}/images`, {
      headers: authTeacher(),
      multipart: { file: { name: 'elsewhere.png', mimeType: 'image/png', buffer: PNG_1PX } },
    });
    expect(otherUp.ok()).toBe(true);
    otherClassImageId = (await otherUp.json()).image.id;

    expect(firstImageId && secondImageId && otherClassImageId).toBeTruthy();
  });

  test('AC1: the gallery starts unstarred and lists in sort_order then created_at', async ({ request }) => {
    test.skip(!classId, 'No class');

    const get = await request.get(`${NEXUS}/api/timetable/${classId}/images`, { headers: authTeacher() });
    expect(get.ok()).toBe(true);
    const body = await get.json();

    expect(body.cover_image_id).toBeNull();
    expect(body.images.map((i: any) => i.id)).toEqual([firstImageId, secondImageId]);

    // created_at must be present: it is the tiebreak that decides the fallback
    // cover when every row sits at the default sort_order of 0.
    for (const image of body.images) {
      expect(image.created_at, 'created_at drives the fallback cover tiebreak').toBeTruthy();
      expect(image).toHaveProperty('thumb_url');
    }
  });

  test('AC2: starring an image saves at once and survives a reload', async ({ request }) => {
    test.skip(!classId, 'No class');

    const patch = await request.patch(`${NEXUS}/api/timetable/${classId}/images`, {
      headers: jsonTeacher(),
      data: { cover_image_id: secondImageId },
    });
    expect(patch.ok()).toBe(true);
    expect((await patch.json()).cover_image_id).toBe(secondImageId);

    const get = await request.get(`${NEXUS}/api/timetable/${classId}/images`, { headers: authTeacher() });
    expect((await get.json()).cover_image_id).toBe(secondImageId);
  });

  test('AC3: both week reads carry the gallery embed and the starred id', async ({ request }) => {
    test.skip(!classId, 'No class');

    const student = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=${PAST_DATE}&end=${PAST_DATE}`,
      { headers: authStudent() },
    );
    expect(student.ok()).toBe(true);
    const studentRow = ((await student.json()).classes || []).find((c: any) => c.id === classId);
    test.skip(!studentRow, 'Class is not visible to the test student (batch or publish state)');
    expect(studentRow.cover_image_id).toBe(secondImageId);
    expect(studentRow.class_images).toHaveLength(2);
    expect(studentRow.class_images.every((i: any) => !!i.created_at)).toBe(true);

    const teacher = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroomId}&start=${PAST_DATE}&end=${PAST_DATE}`,
      { headers: authTeacher() },
    );
    expect(teacher.ok()).toBe(true);
    const teacherRow = ((await teacher.json()).classes || []).find((c: any) => c.id === classId);
    expect(teacherRow.cover_image_id).toBe(secondImageId);
    expect(teacherRow.class_images).toHaveLength(2);
  });

  test('AC4: creating a class does not join the gallery, so the write path stayed narrow', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const create = await request.post(`${NEXUS}/api/timetable`, {
      headers: jsonTeacher(),
      data: {
        classroom_id: classroomId,
        title: `E2ECover${stamp} writepath`,
        scheduled_date: isoDaysAgo(10),
        start_time: '19:00',
        end_time: '20:00',
      },
    });
    expect(create.ok()).toBe(true);
    const created = (await create.json()).class;
    expect(created).not.toHaveProperty('class_images');

    await request
      .delete(`${NEXUS}/api/timetable`, {
        headers: jsonTeacher(),
        data: { id: created.id, classroom_id: classroomId, permanent: true },
      })
      .catch(() => {});
  });

  test('AC5: deleting the starred image clears the cover and falls back to the survivor', async ({ request }) => {
    test.skip(!classId, 'No class');

    const del = await request.delete(`${NEXUS}/api/timetable/${classId}/images?id=${secondImageId}`, {
      headers: authTeacher(),
    });
    expect(del.ok()).toBe(true);

    const get = await request.get(`${NEXUS}/api/timetable/${classId}/images`, { headers: authTeacher() });
    const body = await get.json();
    expect(body.cover_image_id, 'the FK should have cleared the dangling cover').toBeNull();
    expect(body.images.map((i: any) => i.id)).toEqual([firstImageId]);
    secondImageId = null;
  });

  test('AC6: a class cannot be pointed at another class image', async ({ request }) => {
    test.skip(!classId || !otherClassImageId, 'No class');

    const patch = await request.patch(`${NEXUS}/api/timetable/${classId}/images`, {
      headers: jsonTeacher(),
      data: { cover_image_id: otherClassImageId },
    });
    expect(patch.status()).toBe(404);

    // And the real cover is untouched.
    const get = await request.get(`${NEXUS}/api/timetable/${classId}/images`, { headers: authTeacher() });
    expect((await get.json()).cover_image_id).toBeNull();
  });

  test('AC7: a student can read the cover but not set it', async ({ request }) => {
    test.skip(!classId, 'No class');

    const read = await request.get(`${NEXUS}/api/timetable/${classId}/images`, { headers: authStudent() });
    expect(read.ok()).toBe(true);
    const body = await read.json();
    expect(body.canEdit).toBe(false);
    expect(body).toHaveProperty('cover_image_id');

    const write = await request.patch(`${NEXUS}/api/timetable/${classId}/images`, {
      headers: { ...authStudent(), 'Content-Type': 'application/json' },
      data: { cover_image_id: firstImageId },
    });
    expect(write.status()).toBe(403);
  });

  test('AC8: a class with no images returns an empty array, not null', async ({ request }) => {
    test.skip(!emptyClassId, 'No class');

    const get = await request.get(`${NEXUS}/api/timetable/${emptyClassId}/images`, { headers: authTeacher() });
    expect(get.ok()).toBe(true);
    const body = await get.json();
    expect(Array.isArray(body.images)).toBe(true);
    expect(body.images).toHaveLength(0);
    expect(body.cover_image_id).toBeNull();

    const week = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroomId}&start=${isoDaysAgo(9)}&end=${isoDaysAgo(9)}`,
      { headers: authTeacher() },
    );
    expect(week.ok()).toBe(true);
    const row = ((await week.json()).classes || []).find((c: any) => c.id === emptyClassId);
    expect(Array.isArray(row.class_images)).toBe(true);
    expect(row.class_images).toHaveLength(0);
  });

  test('AC9: clearing the cover explicitly is allowed', async ({ request }) => {
    test.skip(!classId || !firstImageId, 'No class');

    const set = await request.patch(`${NEXUS}/api/timetable/${classId}/images`, {
      headers: jsonTeacher(),
      data: { cover_image_id: firstImageId },
    });
    expect(set.ok()).toBe(true);

    const clear = await request.patch(`${NEXUS}/api/timetable/${classId}/images`, {
      headers: jsonTeacher(),
      data: { cover_image_id: null },
    });
    expect(clear.ok()).toBe(true);
    expect((await clear.json()).cover_image_id).toBeNull();
  });

  test('AC10: the student dashboard carries the cover fields on completed classes', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/dashboard/student`, { headers: authStudent() });
    test.skip(!res.ok(), 'Student dashboard unavailable in this environment');

    const completed = (await res.json()).completedClasses || [];
    test.skip(completed.length === 0, 'Test student has no completed classes');
    // The shape matters more than the values: a missing embed here shows up as an
    // undefined property, and the tile would silently never render.
    expect(completed[0]).toHaveProperty('cover_image_id');
    expect(completed[0]).toHaveProperty('class_images');
  });

  test.afterAll(async ({ request }) => {
    if (!teacherToken || !classroomId) return;

    // Deleting a class permanently cascades its images.
    for (const id of [classId, otherClassId, emptyClassId]) {
      if (!id) continue;
      await request
        .delete(`${NEXUS}/api/timetable`, {
          headers: jsonTeacher(),
          data: { id, classroom_id: classroomId, permanent: true },
        })
        .catch(() => {});
    }
  });
});

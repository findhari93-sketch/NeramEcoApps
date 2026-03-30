# Parent-Child Classroom Linking — Design Spec

## Context

Neram Classes has 3 classrooms for their NATA/JEE coaching program:
- **Common Class** — shared for both exams (~90% of meetings happen here)
- **NATA Class** — NATA exam-specific classes
- **JEE Class** — JEE exam-specific classes

**Problems being solved:**
1. Students enrolled in NATA/JEE don't always see Common Class meetings in their timetable
2. Teachers forget to add students to the Common Class or create meetings in the wrong classroom
3. Students attending both exams are in 3 classrooms — confusing navigation
4. No relationship between classrooms — they're completely independent in the current system

**Intended outcome:** A parent-child classroom model where Common is the parent of NATA and JEE. Meetings in Common auto-appear in child timetables. Enrollment in a child auto-enrolls in the parent. Teachers default to creating meetings in the parent.

---

## 1. Database Schema Changes

### 1.1 Add `parent_classroom_id` to `nexus_classrooms`

```sql
ALTER TABLE nexus_classrooms
  ADD COLUMN parent_classroom_id UUID REFERENCES nexus_classrooms(id) ON DELETE SET NULL;

-- Constraint: only 1 level deep (a child cannot be a parent)
-- Enforced in application logic, not DB constraint
```

- `NULL` = top-level / standalone classroom (Common, Revit, etc.)
- Set = child classroom (NATA → parent is Common, JEE → parent is Common)
- **Rule:** A classroom with a non-null `parent_classroom_id` cannot itself be referenced as a parent. Enforced in API validation.

### 1.2 Migration: Link existing classrooms

```sql
-- After column is added, update existing classrooms:
UPDATE nexus_classrooms SET parent_classroom_id = '<common_class_id>'
  WHERE id IN ('<nata_class_id>', '<jee_class_id>');
```

Actual IDs to be determined at migration time by querying classroom names/short_codes.

### 1.3 Index

```sql
CREATE INDEX idx_nexus_classrooms_parent ON nexus_classrooms(parent_classroom_id)
  WHERE parent_classroom_id IS NOT NULL;
```

---

## 2. Auto-Enrollment Logic

### 2.1 On enrolling a student in a child classroom

**Trigger point:** `POST /api/classrooms/[id]/enroll` or any enrollment creation path.

1. After enrolling in child, check `child.parent_classroom_id`
2. If parent exists, check if student already enrolled in parent
3. If not → create enrollment in parent classroom (role: student, is_active: true)
4. Trigger Teams sync for parent classroom (add student to Common Teams group)

### 2.2 On removing a student from a child classroom

**Trigger point:** enrollment deactivation/removal path.

1. Get the parent classroom ID from the child
2. Query: does the student have active enrollment in any OTHER child of the same parent?
3. If **no other child enrollments** → deactivate parent enrollment + remove from parent Teams group
4. If **still in another child** → keep parent enrollment as-is

### 2.3 Edge cases

- **Student in both NATA and JEE:** 3 enrollments (Common, NATA, JEE). Removing from NATA keeps Common because JEE enrollment exists.
- **Direct enrollment in Common:** Allowed. Not auto-removed when children change (only auto-enrolled students are auto-managed).
- **Teacher enrollment:** Teachers are not auto-enrolled in parent. They manage their own classroom membership.

---

## 3. Timetable Query Changes

### 3.1 Student timetable (`/api/timetable/my-schedule`)

**Current behavior:** Fetches meetings from all enrolled classrooms and merges them. **This already works** because auto-enrollment ensures students are in Common.

**Enhancement:** Add `classroom_name`, `classroom_type`, and `is_parent_class` to each meeting in the response for color-coding.

### 3.2 Teacher timetable (classroom view)

**Current behavior:** Shows meetings only from the selected classroom.

**New behavior:** When viewing a child classroom's timetable, also fetch and merge meetings from the parent classroom. Tag parent meetings visually.

**Query change in** `packages/database/src/queries/nexus/timetable.ts`:
```
getScheduledClasses(classroomId, dateRange) →
  1. Fetch classes for classroomId
  2. If classroom has parent_classroom_id, also fetch classes for parent
  3. Merge and sort by date/time
  4. Tag each class with source: 'own' | 'parent'
```

### 3.3 No duplicate meetings

Meetings are always stored in ONE classroom. The timetable query handles cross-visibility. No meeting duplication.

---

## 4. Meeting Creation UX (Teacher)

### 4.1 Smart default to parent classroom

**Current:** Teacher picks classroom from dropdown, no default.

**New flow:**
1. Teacher clicks "New Meeting" / clicks a time slot
2. Classroom dropdown **defaults to the parent classroom** (Common) if the teacher is currently viewing a child classroom
3. If viewing a standalone classroom (Revit), defaults to that classroom
4. Teacher can switch to NATA-only or JEE-only if needed

### 4.2 Helper text below classroom selector

| Selected classroom | Helper text |
|---|---|
| Common (parent) | "This meeting will be visible to all NATA and JEE students" |
| NATA (child) | "This meeting will only be visible to NATA students" |
| JEE (child) | "This meeting will only be visible to JEE students" |
| Revit (standalone) | _(no helper text)_ |

### 4.3 Teams meeting routing

Meeting is created in the selected classroom's Teams group as usual. No change to the Teams meeting API — the parent/child linking only affects timetable visibility.

---

## 5. Classroom Management UI

### 5.1 Classroom list (teacher view)

Parent classrooms show children indented below:
```
📚 Common Class (Parent)        45 students
   ├── 📗 NATA 2026             28 students
   └── 📘 JEE 2026              22 students
📚 Revit 2026                   15 students
```

### 5.2 Classroom create/edit form

Add optional "Parent Classroom" dropdown:
- Shows only top-level classrooms (those with `parent_classroom_id = NULL`)
- Setting a parent links it as a child
- Clearing it makes the classroom standalone
- **Validation:** Cannot set a parent if this classroom is already a parent of other classrooms

### 5.3 Classroom detail page

- **Parent classroom** shows "Child Classrooms" section listing NATA/JEE with student counts and links
- **Child classroom** shows "Parent: Common Class" badge with link to parent

---

## 6. Student Timetable UX

### 6.1 Unified view with color-coded tags

One single timetable (weekly calendar grid). Each meeting card shows:
- Title, time, teacher name (existing)
- **Classroom tag chip** — small colored badge:
  - Common → neutral/gray
  - NATA → color A (e.g., green)
  - JEE → color B (e.g., blue)

### 6.2 No tabs or separate views

Students see everything in one place. The color tag is the only distinction. This avoids confusion and reduces the chance of missing a class.

---

## 7. Files to Modify

### Database / Shared packages
- `packages/database/src/types/index.ts` — Add `parent_classroom_id` to classroom type
- `packages/database/src/queries/nexus/classrooms.ts` — Update enrollment functions with auto-enroll logic
- `packages/database/src/queries/nexus/timetable.ts` — Update queries to fetch parent meetings
- New migration SQL file for the schema change

### Nexus API routes
- `apps/nexus/src/app/api/classrooms/route.ts` — Validate parent-child constraints on create/update
- `apps/nexus/src/app/api/classrooms/[id]/enroll/` — Add auto-enrollment trigger
- `apps/nexus/src/app/api/timetable/route.ts` — Include parent classroom meetings
- `apps/nexus/src/app/api/timetable/my-schedule/route.ts` — Add classroom metadata to response

### Nexus UI components
- `apps/nexus/src/components/timetable/ClassCard.tsx` — Add classroom color tag
- `apps/nexus/src/components/timetable/ClassCreateDialog.tsx` — Smart default + helper text
- `apps/nexus/src/components/ClassroomFormDialog.tsx` — Add parent classroom dropdown
- `apps/nexus/src/app/(teacher)/teacher/classrooms/page.tsx` — Hierarchical list view
- `apps/nexus/src/app/(teacher)/teacher/classrooms/[id]/page.tsx` — Show parent/children info

---

## 8. Verification Plan

1. **Schema:** Apply migration, verify `parent_classroom_id` column exists
2. **Link classrooms:** Set NATA and JEE's parent to Common via SQL/API
3. **Auto-enrollment test:** Enroll a new student in NATA → verify they appear in Common enrollments and Common Teams group
4. **Removal test:** Remove student from NATA (while in JEE) → verify they stay in Common. Remove from JEE too → verify Common enrollment removed
5. **Student timetable:** Create a meeting in Common → verify it appears in a NATA student's timetable with "Common" tag
6. **Teacher timetable:** View NATA classroom timetable → verify Common meetings appear merged in
7. **Meeting creation:** Open "New Meeting" from NATA timetable → verify dropdown defaults to Common
8. **Classroom list:** Verify hierarchical display with indented children
9. **Edge case:** Student in both NATA and JEE → verify no duplicate Common meetings in timetable

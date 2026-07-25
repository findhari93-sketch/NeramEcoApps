import { describe, it, expect } from 'vitest';
import {
  shouldBlockForPhoto,
  toPhotoStatus,
  DEFAULT_PHOTO_GATE,
  PHOTO_GATE_FEATURE,
  type PhotoGateInput,
  type PhotoStatus,
} from './photo-gate';

/** A student who WOULD be blocked. Each test flips one thing off. */
function blocked(overrides: Partial<PhotoGateInput> = {}): PhotoGateInput {
  return {
    flagEnabled: true,
    nexusRole: 'student',
    impersonating: false,
    classroomCount: 1,
    photoStatus: 'missing',
    ...overrides,
  };
}

describe('shouldBlockForPhoto', () => {
  it('blocks an enrolled student with no photo when the flag is on', () => {
    expect(shouldBlockForPhoto(blocked())).toBe(true);
  });

  it('blocks an enrolled student whose photo was rejected', () => {
    expect(shouldBlockForPhoto(blocked({ photoStatus: 'rejected' }))).toBe(true);
  });

  it('does NOT block a pending photo, so nobody waits on a sleeping teacher', () => {
    expect(shouldBlockForPhoto(blocked({ photoStatus: 'pending' }))).toBe(false);
  });

  it('does not block an approved photo', () => {
    expect(shouldBlockForPhoto(blocked({ photoStatus: 'approved' }))).toBe(false);
  });

  it('never blocks when the feature flag is off', () => {
    const statuses: PhotoStatus[] = ['missing', 'pending', 'approved', 'rejected'];
    for (const photoStatus of statuses) {
      expect(shouldBlockForPhoto(blocked({ flagEnabled: false, photoStatus }))).toBe(false);
    }
  });

  it('never blocks a teacher or an admin', () => {
    expect(shouldBlockForPhoto(blocked({ nexusRole: 'teacher' }))).toBe(false);
    expect(shouldBlockForPhoto(blocked({ nexusRole: 'admin' }))).toBe(false);
  });

  it('never blocks while a teacher is using View as Student', () => {
    expect(shouldBlockForPhoto(blocked({ impersonating: true }))).toBe(false);
  });

  it('never blocks a student with no active classroom (they get NoClassroomWelcome)', () => {
    expect(shouldBlockForPhoto(blocked({ classroomCount: 0 }))).toBe(false);
  });

  it('blocks a student enrolled in more than one classroom', () => {
    expect(shouldBlockForPhoto(blocked({ classroomCount: 3 }))).toBe(true);
  });
});

describe('toPhotoStatus', () => {
  it('passes through the four known statuses', () => {
    expect(toPhotoStatus('pending')).toBe('pending');
    expect(toPhotoStatus('approved')).toBe('approved');
    expect(toPhotoStatus('rejected')).toBe('rejected');
    expect(toPhotoStatus('missing')).toBe('missing');
  });

  it('defaults anything unknown to missing', () => {
    expect(toPhotoStatus(null)).toBe('missing');
    expect(toPhotoStatus(undefined)).toBe('missing');
    expect(toPhotoStatus('')).toBe('missing');
    expect(toPhotoStatus('APPROVED')).toBe('missing');
    expect(toPhotoStatus(42)).toBe('missing');
  });
});

describe('DEFAULT_PHOTO_GATE', () => {
  it('never blocks, so the blocker cannot flash before /api/auth/me resolves', () => {
    expect(DEFAULT_PHOTO_GATE.required).toBe(false);
  });
});

describe('PHOTO_GATE_FEATURE', () => {
  it('matches the id registered in the feature-flag registry', () => {
    expect(PHOTO_GATE_FEATURE).toBe('student.photo-gate');
  });
});

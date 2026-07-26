import { describe, it, expect } from 'vitest';
import {
  shouldFetchMicrosoftPhoto,
  decideMicrosoftPull,
  pullReasonLabel,
  type PhotoSyncStatus,
} from './photo-sync-policy';

/**
 * This policy is the only thing keeping the Nexus on-demand sync and the Admin
 * weekly cron in agreement about when a Microsoft photo replaces what we hold.
 * If the two ever disagree, a student's photo starts flip-flopping.
 */

const ALL_STATUSES: PhotoSyncStatus[] = ['missing', 'pending', 'approved', 'rejected'];

describe('shouldFetchMicrosoftPhoto', () => {
  it('skips only the photo already waiting for a teacher', () => {
    // Skipping before the Graph call is the point: it saves a network round trip
    // and stops the queue changing underneath a teacher mid-review.
    expect(shouldFetchMicrosoftPhoto('pending')).toBe(false);
  });

  it('looks at every other state', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'pending')) {
      expect(shouldFetchMicrosoftPhoto(status)).toBe(true);
    }
  });
});

describe('decideMicrosoftPull', () => {
  it('never pulls while a photo is in review, even if Microsoft changed', () => {
    expect(decideMicrosoftPull({ photoStatus: 'pending', hashChanged: true })).toEqual({
      pull: false,
      reason: 'in_review',
    });
  });

  it('never pulls an unchanged photo, whatever the review state', () => {
    // This is the loop guard. A photo we ourselves pushed to Microsoft reads back
    // with the same hash, so it must not look like a student change.
    for (const status of ALL_STATUSES) {
      expect(decideMicrosoftPull({ photoStatus: status, hashChanged: false }).pull).toBe(false);
    }
  });

  it('takes a first Microsoft photo when we hold nothing', () => {
    expect(decideMicrosoftPull({ photoStatus: 'missing', hashChanged: true })).toEqual({
      pull: true,
      reason: 'new_photo',
    });
  });

  it('takes a changed photo over an approved one and calls it a change', () => {
    // The load-bearing case. A student who passes review and then swaps their
    // picture in Microsoft has to be looked at again, or approval means nothing.
    expect(decideMicrosoftPull({ photoStatus: 'approved', hashChanged: true })).toEqual({
      pull: true,
      reason: 'changed_photo',
    });
  });

  it('treats a rejected photo as replaceable by a fresh Microsoft one', () => {
    expect(decideMicrosoftPull({ photoStatus: 'rejected', hashChanged: true })).toEqual({
      pull: true,
      reason: 'changed_photo',
    });
  });

  it('only ever pulls when the hash actually changed', () => {
    const pulled = ALL_STATUSES.flatMap((photoStatus) =>
      [true, false].map((hashChanged) => ({
        photoStatus,
        hashChanged,
        ...decideMicrosoftPull({ photoStatus, hashChanged }),
      })),
    ).filter((r) => r.pull);

    expect(pulled.every((r) => r.hashChanged)).toBe(true);
    expect(pulled.every((r) => r.photoStatus !== 'pending')).toBe(true);
    // missing, approved, rejected with a changed hash: three pulls, no more.
    expect(pulled).toHaveLength(3);
  });
});

describe('pullReasonLabel', () => {
  it('explains every reason without an em dash (project content rule)', () => {
    const reasons = ['new_photo', 'changed_photo', 'unchanged', 'in_review'] as const;
    for (const reason of reasons) {
      const label = pullReasonLabel(reason);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/—|--|&mdash;/);
    }
  });
});

/**
 * Unit tests for the values a new class opens with in Add Class.
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_CLASS, newClassTimes } from './new-class-defaults';

describe('STANDARD_CLASS', () => {
  it('is the evening JEE/NATA session with a Teams meeting', () => {
    expect(STANDARD_CLASS).toEqual({
      title: 'JEE/NATA Preparation',
      start_time: '19:00',
      end_time: '20:30',
      create_meeting: true,
    });
  });
});

describe('newClassTimes', () => {
  it('no clicked slot gives 7:00 PM to 8:30 PM', () => {
    expect(newClassTimes()).toEqual({ start_time: '19:00', end_time: '20:30' });
    expect(newClassTimes('')).toEqual({ start_time: '19:00', end_time: '20:30' });
  });

  it('a clicked slot keeps its start and runs 90 minutes', () => {
    expect(newClassTimes('10:00')).toEqual({ start_time: '10:00', end_time: '11:30' });
    expect(newClassTimes('18:30')).toEqual({ start_time: '18:30', end_time: '20:00' });
  });

  it('caps the end at 10:00 PM, the last time the picker offers', () => {
    expect(newClassTimes('21:00')).toEqual({ start_time: '21:00', end_time: '22:00' });
  });
});

import { describe, it, expect } from 'vitest';
import { pickSharedClassroom } from './sketchbook-access';

/**
 * The rule behind "featuring stopped asking which classroom".
 *
 * The teacher used to answer this from a dropdown, and the server then checked
 * the answer against exactly this intersection. Since the server could compute
 * it, the question was never worth asking.
 */
describe('pickSharedClassroom', () => {
  it('takes the one classroom they share, without being told', () => {
    expect(pickSharedClassroom(['a', 'b'], ['b'])).toBe('b');
  });

  it('refuses when they share none', () => {
    expect(() => pickSharedClassroom(['a'], ['b'])).toThrowError('That classroom does not hold both of you.');
  });

  it('asks only when there is a real choice', () => {
    expect(() => pickSharedClassroom(['a', 'b'], ['a', 'b'])).toThrowError(/more than one classroom/);
  });

  it('carries the status the route answers with', () => {
    // 403 stays 403 so nothing that greps the logs changes meaning, and the
    // ambiguous case is a 409 because it is the client's turn to act.
    expect(() => pickSharedClassroom(['a'], ['b'])).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => pickSharedClassroom(['a', 'b'], ['a', 'b'])).toThrowError(expect.objectContaining({ status: 409 }));
  });

  it('still honours and still checks an explicit pick', () => {
    // The DELETE path sends one, so this contract cannot be dropped.
    expect(pickSharedClassroom(['a', 'b'], ['a', 'b'], 'a')).toBe('a');
    expect(() => pickSharedClassroom(['a'], ['a'], 'zzz')).toThrowError('That classroom does not hold both of you.');
  });

  it('refuses a classroom the teacher has but the student does not', () => {
    // The archived room on production is still is_active, so an admin's list
    // holds classrooms no student is in. Sharing has to mean both sides.
    expect(() => pickSharedClassroom(['archived', 'live'], ['live'], 'archived')).toThrowError(
      'That classroom does not hold both of you.',
    );
  });
});

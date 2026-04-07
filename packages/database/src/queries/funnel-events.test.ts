import { describe, it, expect } from 'vitest';
import { AUTH_EVENT_ORDER, EVENT_LABELS } from './funnel-events';

describe('Funnel Events - Constants', () => {
  it('AUTH_EVENT_ORDER should have correct step ordering', () => {
    expect(AUTH_EVENT_ORDER['google_auth_started']).toBeLessThan(AUTH_EVENT_ORDER['google_auth_completed']);
    expect(AUTH_EVENT_ORDER['google_auth_completed']).toBeLessThan(AUTH_EVENT_ORDER['register_user_completed']);
    expect(AUTH_EVENT_ORDER['register_user_completed']).toBeLessThan(AUTH_EVENT_ORDER['phone_screen_shown']);
    expect(AUTH_EVENT_ORDER['phone_screen_shown']).toBeLessThan(AUTH_EVENT_ORDER['otp_requested']);
    expect(AUTH_EVENT_ORDER['otp_requested']).toBeLessThan(AUTH_EVENT_ORDER['otp_verified']);
  });

  it('AUTH_EVENT_ORDER should have 10 events', () => {
    expect(Object.keys(AUTH_EVENT_ORDER)).toHaveLength(10);
  });

  it('EVENT_LABELS should have human-readable labels for all auth events', () => {
    const authEvents = [
      'google_auth_started',
      'google_auth_completed',
      'google_auth_failed',
      'register_user_started',
      'register_user_completed',
      'register_user_failed',
      'phone_screen_shown',
      'phone_number_entered',
      'otp_requested',
      'otp_request_failed',
      'otp_entered',
      'otp_verified',
      'otp_failed',
      'phone_already_exists',
      'phone_skipped',
    ];

    for (const event of authEvents) {
      expect(EVENT_LABELS[event]).toBeDefined();
      expect(typeof EVENT_LABELS[event]).toBe('string');
      expect(EVENT_LABELS[event].length).toBeGreaterThan(0);
    }
  });

  it('EVENT_LABELS should have labels for onboarding events', () => {
    const onboardingEvents = [
      'onboarding_started',
      'onboarding_question_answered',
      'onboarding_completed',
      'onboarding_skipped',
    ];

    for (const event of onboardingEvents) {
      expect(EVENT_LABELS[event]).toBeDefined();
    }
  });

  it('EVENT_LABELS should have labels for application events', () => {
    const applicationEvents = [
      'application_step_started',
      'application_step_completed',
      'application_submitted',
    ];

    for (const event of applicationEvents) {
      expect(EVENT_LABELS[event]).toBeDefined();
    }
  });
});

describe('Funnel Events - Drop-off Diagnosis Logic', () => {
  // Testing the diagnosis logic patterns used in getUserAuthDiagnostics
  // (pure logic tests, no DB needed)

  function diagnoseDropOff(eventNames: string[], hasFailedEvent?: { event: string; error_code?: string; error_message?: string }): string | null {
    if (hasFailedEvent) {
      const label = EVENT_LABELS[hasFailedEvent.event] || hasFailedEvent.event;
      return hasFailedEvent.error_code
        ? `${label}: ${hasFailedEvent.error_code}`
        : `${label}: ${hasFailedEvent.error_message || 'Unknown error'}`;
    }
    if (eventNames.includes('otp_verified')) return null;
    if (eventNames.includes('phone_skipped')) return 'User skipped phone verification';
    if (eventNames.includes('otp_requested') && !eventNames.includes('otp_verified')) {
      return 'OTP sent but never verified. User may have left.';
    }
    if (eventNames.includes('phone_number_entered') && !eventNames.includes('otp_requested')) {
      return 'Phone entered but OTP never requested';
    }
    if (eventNames.includes('phone_screen_shown') && !eventNames.includes('phone_number_entered')) {
      return 'Saw phone screen but never entered a number';
    }
    if (eventNames.includes('register_user_completed') && !eventNames.includes('phone_screen_shown')) {
      return 'Registered but never saw phone verification screen';
    }
    if (eventNames.includes('google_auth_completed') && !eventNames.includes('register_user_completed')) {
      return 'Google auth completed but registration failed';
    }
    return null;
  }

  it('should return null for completed auth flow', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_screen_shown', 'otp_requested', 'otp_verified'];
    expect(diagnoseDropOff(events)).toBeNull();
  });

  it('should detect user who skipped phone verification', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_skipped'];
    expect(diagnoseDropOff(events)).toBe('User skipped phone verification');
  });

  it('should detect user who saw phone screen but never entered number', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_screen_shown'];
    expect(diagnoseDropOff(events)).toBe('Saw phone screen but never entered a number');
  });

  it('should detect user who entered phone but OTP was never sent', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_screen_shown', 'phone_number_entered'];
    expect(diagnoseDropOff(events)).toBe('Phone entered but OTP never requested');
  });

  it('should detect user who got OTP but never verified', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_screen_shown', 'phone_number_entered', 'otp_requested'];
    expect(diagnoseDropOff(events)).toBe('OTP sent but never verified. User may have left.');
  });

  it('should detect user who registered but never saw phone screen', () => {
    const events = ['google_auth_started', 'google_auth_completed', 'register_user_completed'];
    expect(diagnoseDropOff(events)).toBe('Registered but never saw phone verification screen');
  });

  it('should detect user who completed Google auth but registration failed', () => {
    const events = ['google_auth_started', 'google_auth_completed'];
    expect(diagnoseDropOff(events)).toBe('Google auth completed but registration failed');
  });

  it('should detect failed event with error code', () => {
    const result = diagnoseDropOff(
      ['google_auth_started', 'google_auth_failed'],
      { event: 'google_auth_failed', error_code: 'auth/popup-closed-by-user' }
    );
    expect(result).toContain('auth/popup-closed-by-user');
    expect(result).toContain('Google Auth Failed');
  });

  it('should detect OTP failure', () => {
    const result = diagnoseDropOff(
      ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_screen_shown', 'otp_requested', 'otp_failed'],
      { event: 'otp_failed', error_code: 'auth/invalid-verification-code' }
    );
    expect(result).toContain('auth/invalid-verification-code');
  });

  it('should detect phone already exists error', () => {
    const result = diagnoseDropOff(
      ['google_auth_started', 'google_auth_completed', 'register_user_completed', 'phone_already_exists'],
      { event: 'phone_already_exists', error_code: 'PHONE_ALREADY_EXISTS' }
    );
    expect(result).toContain('PHONE_ALREADY_EXISTS');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ApplicationSection from './ApplicationSection';
import type { ProfileApplication } from '@/lib/student-profile-types';

function row(over: Partial<ProfileApplication> = {}): ProfileApplication {
  return {
    application_number: null,
    status: 'enrolled',
    form_step_completed: 0,
    form_completed_at: null,
    created_at: '2026-10-06T13:17:59Z',
    applicant_category: 'school_student',
    target_exam_year: 2027,
    school_type: 'private_school',
    learning_mode: 'hybrid',
    interest_course: 'both',
    hybrid_learning_accepted: false,
    phone_verified: false,
    phone_verified_at: null,
    academic_data: null,
    country: 'IN',
    state: null,
    district: null,
    city: null,
    pincode: null,
    address: null,
    latitude: null,
    longitude: null,
    location_source: null,
    ...over,
  };
}

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('ApplicationSection', () => {
  it('says there is no application when only the Nexus profile page was filled in', () => {
    render(<ApplicationSection application={null} profileDetails={row()} />);
    expect(screen.getByText('No application form, profile details only')).toBeTruthy();
    expect(screen.getByText('What they told us in Nexus')).toBeTruthy();
    expect(screen.getByText(/Filled in on their Nexus profile on 6 Oct 2026\. This is not an application\./)).toBeTruthy();
    expect(screen.getByText('2027')).toBeTruthy();
  });

  it('keeps the plain empty state when there is nothing at all', () => {
    render(<ApplicationSection application={null} />);
    expect(screen.getByText('No application on file')).toBeTruthy();
    expect(screen.queryByText('What they told us in Nexus')).toBeNull();
  });

  it('shows a real application by its number', () => {
    render(<ApplicationSection application={row({ application_number: 'NRM-2610-00118' })} />);
    expect(screen.getByText('Application NRM-2610-00118')).toBeTruthy();
  });

  it('opens itself when the page was reached with its anchor', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    window.location.hash = '#profile-application';
    render(<ApplicationSection application={row({ application_number: 'NRM-1' })} />);
    // On a phone width (jsdom) the section is an Accordion, collapsed by default.
    expect(screen.getByRole('button', { name: /Application form/ }).getAttribute('aria-expanded')).toBe('true');
    expect(scroll).toHaveBeenCalled();
  });
});

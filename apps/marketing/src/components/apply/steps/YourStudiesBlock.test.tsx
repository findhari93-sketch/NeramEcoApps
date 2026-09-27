import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ApplicationFormData } from '../types';
import { DEFAULT_FORM_DATA } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

let formData: ApplicationFormData = structuredClone(DEFAULT_FORM_DATA);
const updateFormData = vi.fn((section: keyof ApplicationFormData, data: object) => {
  formData = { ...formData, [section]: { ...(formData[section] as object), ...data } } as ApplicationFormData;
});
vi.mock('../FormContext', () => ({
  useFormContext: () => ({ formData, updateFormData }),
}));

import YourStudiesBlock from './YourStudiesBlock';

beforeEach(() => {
  formData = structuredClone(DEFAULT_FORM_DATA);
  updateFormData.mockClear();
});
afterEach(() => cleanup());

describe('YourStudiesBlock', () => {
  it('asks the category question and the exam year, with caste folded under More details', () => {
    const { container } = render(<YourStudiesBlock />);
    expect(screen.getByText('yourCourse.categoryQuestion')).toBeTruthy();
    expect(container.querySelector('input[name="targetExamYear"]')).not.toBeNull();
    expect(container.querySelector('input[name="casteCategory"]')).toBeNull();
    fireEvent.click(screen.getByText('yourCourse.moreDetails'));
    expect(container.querySelector('input[name="casteCategory"]')).not.toBeNull();
  });

  it('shows the school type only for school students, and the scholarship note for government schools', () => {
    formData.academic = {
      ...formData.academic,
      applicantCategory: 'school_student',
      schoolType: 'government_school',
      schoolStudentData: { current_class: '11', school_name: '', board: '' },
    };
    const { container } = render(<YourStudiesBlock />);
    fireEvent.click(screen.getByText('yourCourse.moreDetails'));
    expect(container.querySelector('input[name="schoolType"]')).not.toBeNull();
    expect(screen.getByText('yourCourse.scholarship')).toBeTruthy();
  });

  it('does not show the school type for a college student', () => {
    formData.academic = {
      ...formData.academic,
      applicantCategory: 'college_student',
      collegeStudentData: { college_name: '', department: '', year_of_study: 1, twelfth_year: 2024 },
    };
    const { container } = render(<YourStudiesBlock />);
    fireEvent.click(screen.getByText('yourCourse.moreDetails'));
    expect(container.querySelector('input[name="schoolType"]')).toBeNull();
  });
});

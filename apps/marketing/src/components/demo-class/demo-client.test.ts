import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, applyDraftPrefill, hasApplyDraft, loadDraft, saveDraft } from './demo-client';

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function saveApplyDraft(formData: Record<string, unknown>) {
  window.localStorage.setItem(
    'neram_application_draft',
    JSON.stringify({ version: 3, formData, activeStep: 1, savedAt: new Date().toISOString() }),
  );
}

describe('loadDraft', () => {
  it('turns a draft saved on the old step 3 into step 2 of 2', () => {
    window.sessionStorage.setItem('neram_demo_draft', JSON.stringify({ ...EMPTY_DRAFT, step: 2, name: 'Priya' }));
    expect(loadDraft()).toMatchObject({ step: 1, name: 'Priya' });
  });

  it('keeps step 1 and step 2 as they are', () => {
    saveDraft({ ...EMPTY_DRAFT, step: 1 });
    expect(loadDraft()?.step).toBe(1);
    saveDraft({ ...EMPTY_DRAFT, step: 0 });
    expect(loadDraft()?.step).toBe(0);
  });
});

describe('applyDraftPrefill', () => {
  it('is empty without an application draft', () => {
    expect(hasApplyDraft()).toBe(false);
    expect(applyDraftPrefill()).toEqual({ name: '', currentClass: '' });
  });

  it('carries the name and the class from the application', () => {
    saveApplyDraft({
      personal: { firstName: '  Priya  ' },
      academic: { applicantCategory: 'school_student', currentlyIn: '', schoolStudentData: { current_class: '12' } },
    });
    expect(hasApplyDraft()).toBe(true);
    expect(applyDraftPrefill()).toEqual({ name: 'Priya', currentClass: '12th' });
  });

  it('maps a finished class 12 to Drop year and a college student to Other', () => {
    saveApplyDraft({
      personal: { firstName: 'Ravi' },
      academic: { applicantCategory: 'school_student', schoolStudentData: { current_class: '12_completed' } },
    });
    expect(applyDraftPrefill().currentClass).toBe('12th-pass');
    saveApplyDraft({ personal: { firstName: 'Ravi' }, academic: { applicantCategory: 'college_student' } });
    expect(applyDraftPrefill().currentClass).toBe('other');
  });

  it('uses the About you tap when Your studies is not filled yet', () => {
    saveApplyDraft({ personal: { firstName: '' }, academic: { applicantCategory: null, currentlyIn: '11' } });
    expect(applyDraftPrefill()).toEqual({ name: '', currentClass: '11th' });
  });

  it('survives a broken draft', () => {
    window.localStorage.setItem('neram_application_draft', '{oops');
    expect(applyDraftPrefill()).toEqual({ name: '', currentClass: '' });
  });
});

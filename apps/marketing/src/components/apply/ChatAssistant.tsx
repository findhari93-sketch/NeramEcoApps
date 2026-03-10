'use client';

import React, { useCallback, useState } from 'react';
import { Box, Snackbar, Alert } from '@neram/ui';
import { ChatWidget, applicationFormFlow } from '@neram/ui';
import { useFormContext } from './FormContext';
import type { ApplicationFormData } from './types';

interface ChatAssistantProps {
  displayMode: 'floating' | 'panel';
}

/**
 * Flatten nested ApplicationFormData into a flat Record<string, unknown>
 * so the ChatWidget can consume and match field names from the flow config.
 */
function flattenFormData(formData: ApplicationFormData): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  // Personal
  flat.firstName = formData.personal.firstName;
  flat.fatherName = formData.personal.fatherName;
  flat.email = formData.personal.email;
  flat.phone = formData.personal.phone;
  flat.parentPhone = formData.personal.parentPhone;
  flat.phoneVerified = formData.personal.phoneVerified;
  flat.dateOfBirth = formData.personal.dateOfBirth;
  flat.gender = formData.personal.gender;

  // Location
  flat.country = formData.location.country;
  flat.pincode = formData.location.pincode;
  flat.city = formData.location.city;
  flat.state = formData.location.state;
  flat.district = formData.location.district;
  flat.address = formData.location.address;

  // Academic
  flat.applicantCategory = formData.academic.applicantCategory;
  flat.casteCategory = formData.academic.casteCategory;
  flat.targetExamYear = formData.academic.targetExamYear;
  flat.schoolType = formData.academic.schoolType;

  // School student data (flatten sub-fields)
  if (formData.academic.schoolStudentData) {
    flat.current_class = formData.academic.schoolStudentData.current_class;
    flat.school_name = formData.academic.schoolStudentData.school_name;
    flat.board = formData.academic.schoolStudentData.board;
  }

  // Diploma student data
  if (formData.academic.diplomaStudentData) {
    flat.college_name = formData.academic.diplomaStudentData.college_name;
    flat.department = formData.academic.diplomaStudentData.department;
    flat.completed_grade = formData.academic.diplomaStudentData.completed_grade;
  }

  // College student data
  if (formData.academic.collegeStudentData) {
    flat.college_name = formData.academic.collegeStudentData.college_name;
    flat.department = formData.academic.collegeStudentData.department;
    flat.year_of_study = formData.academic.collegeStudentData.year_of_study;
    flat.twelfth_year = formData.academic.collegeStudentData.twelfth_year;
  }

  // Working professional data
  if (formData.academic.workingProfessionalData) {
    flat.twelfth_year = formData.academic.workingProfessionalData.twelfth_year;
  }

  // Course
  flat.interestCourse = formData.course.interestCourse;
  flat.selectedCourseId = formData.course.selectedCourseId;
  flat.selectedCenterId = formData.course.selectedCenterId;
  flat.hybridLearningAccepted = formData.course.hybridLearningAccepted;
  flat.learningMode = formData.course.learningMode;

  return flat;
}

export default function ChatAssistant({ displayMode }: ChatAssistantProps) {
  const { formData, updateFormData } = useFormContext();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const flatData = flattenFormData(formData);

  const handleFieldUpdate = useCallback(
    (fieldName: string, value: unknown, section?: string, subSection?: string) => {
      if (!section) {
        // Fallback: try to infer section from field name
        const personalFields = ['firstName', 'fatherName', 'email', 'phone', 'parentPhone', 'dateOfBirth', 'gender'];
        const locationFields = ['country', 'pincode', 'city', 'state', 'district', 'address'];
        const academicFields = ['applicantCategory', 'casteCategory', 'targetExamYear', 'schoolType'];
        const courseFields = ['interestCourse', 'selectedCourseId', 'selectedCenterId', 'hybridLearningAccepted', 'learningMode'];

        if (personalFields.includes(fieldName)) {
          updateFormData('personal', { [fieldName]: value } as any);
        } else if (locationFields.includes(fieldName)) {
          updateFormData('location', { [fieldName]: value } as any);
        } else if (academicFields.includes(fieldName)) {
          updateFormData('academic', { [fieldName]: value } as any);
        } else if (courseFields.includes(fieldName)) {
          updateFormData('course', { [fieldName]: value } as any);
        }
        return;
      }

      // Section provided - use it directly
      const sectionKey = section as keyof ApplicationFormData;

      if (subSection) {
        // Handle nested JSONB data (e.g., schoolStudentData, diplomaStudentData)
        const currentSectionData = formData[sectionKey] as unknown as Record<string, unknown>;
        const currentSubData = (currentSectionData?.[subSection] as Record<string, unknown>) || {};

        updateFormData(sectionKey, {
          [subSection]: {
            ...currentSubData,
            [fieldName]: value,
          },
        } as any);
      } else {
        // Direct section update
        updateFormData(sectionKey, { [fieldName]: value } as any);
      }
    },
    [updateFormData, formData]
  );

  const handleConnectToOffice = useCallback(async () => {
    // Gather info from form for the callback request
    const name = formData.personal.firstName || 'Applicant';
    const phone = formData.personal.phone || '';
    const email = formData.personal.email || '';
    const courseInterest = formData.course.interestCourse || '';

    if (!phone) {
      setSnackbar({
        open: true,
        message: 'Please fill in your phone number first so we can call you back.',
        severity: 'error',
      });
      return;
    }

    try {
      const response = await fetch('/api/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          course_interest: courseInterest || undefined,
          query_type: 'application_help',
          notes: 'Requested from chat assistant during application form',
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSnackbar({
          open: true,
          message: 'Our team will call you back shortly!',
          severity: 'success',
        });
      } else {
        setSnackbar({
          open: true,
          message: result.error || 'Could not submit callback request. Please try again.',
          severity: 'error',
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: 'Could not submit callback request. Please try again.',
        severity: 'error',
      });
    }
  }, [formData]);

  const handleComplete = useCallback(() => {
    // Chat flow completed - no-op; user continues with the form wizard
  }, []);

  return (
    <Box sx={{ height: '100%' }}>
      <ChatWidget
        flowConfig={applicationFormFlow}
        formData={flatData}
        onFieldUpdate={handleFieldUpdate}
        onComplete={handleComplete}
        displayMode={displayMode}
        title="Nera"
        subtitle="Application Assistant"
        showConnectToOffice
        onConnectToOffice={handleConnectToOffice}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

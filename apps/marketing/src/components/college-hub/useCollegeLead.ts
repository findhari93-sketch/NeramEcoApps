'use client';

import { useEffect, useState } from 'react';
import { useFirebaseAuth } from '@neram/auth';

export interface LeadExtras {
  email?: string;
  nataScore?: string;
  city?: string | null;
  message?: string;
}

/**
 * Form state and submit for an admission enquiry to one college
 * (POST /api/colleges/leads). Shared by the dialog (LeadCaptureButton) and the
 * inline card on the college page, so both send the same payload.
 */
export function useCollegeLead(collegeId: string) {
  const { user } = useFirebaseAuth();
  const [name, setName] = useState('');
  const [phone, setPhoneRaw] = useState('');
  const [parentPhone, setParentPhoneRaw] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Prefill from the Firebase profile when signed in; fields stay editable.
  useEffect(() => {
    if (!user) return;
    if (user.name) setName((v) => v || user.name || '');
    if (user.phone) {
      const digits = user.phone.replace(/\D/g, '');
      setPhoneRaw((v) => v || (digits.length > 10 ? digits.slice(-10) : digits));
    }
  }, [user]);

  const setPhone = (value: string) => setPhoneRaw(value.replace(/\D/g, '').slice(0, 10));
  const setParentPhone = (value: string) => setParentPhoneRaw(value.replace(/\D/g, '').slice(0, 10));

  const submit = async (extras: LeadExtras = {}) => {
    if (!name.trim() || phone.length !== 10 || !consent) {
      setError('Please fill in your name, a valid 10-digit mobile number, and agree to share your details.');
      return false;
    }
    if (parentPhone && parentPhone.length !== 10) {
      setError("Enter your parent's 10-digit mobile number, or leave it empty.");
      return false;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/colleges/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          name: name.trim(),
          phone,
          parent_phone: parentPhone || null,
          email: extras.email || null,
          nata_score: extras.nataScore ? parseFloat(extras.nataScore) : null,
          city: extras.city || null,
          message: extras.message || null,
          firebase_uid: user?.id ?? null,
          consent_given: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to submit. Please try again.');
      setSuccess(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return { user, name, setName, phone, setPhone, parentPhone, setParentPhone, consent, setConsent, submitting, error, success, submit };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFirebaseAuth } from '@neram/auth';
import type { AreaOfInterest } from '@neram/database';
import type { FullProfileData, PersonalInfoFormData } from '../types';
import type { CropData } from '@/components/ProfilePictureUpload';

export function useFullProfile() {
  const { user } = useFirebaseAuth();

  // Basic profile (fast)
  const [basicProfile, setBasicProfile] = useState<FullProfileData['user'] | null>(null);
  const [basicLoading, setBasicLoading] = useState(true);

  // Full profile data
  const [fullProfile, setFullProfile] = useState<FullProfileData | null>(null);
  const [fullLoading, setFullLoading] = useState(true);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<PersonalInfoFormData>({
    first_name: '',
    last_name: '',
    nickname: '',
    description: '',
    area_of_interest: [] as AreaOfInterest[],
    date_of_birth: '',
    gender: '',
  });

  // Username state
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getIdToken = useCallback(async () => {
    const token = await (user?.raw as any)?.getIdToken?.();
    if (!token) throw new Error('Not authenticated');
    return token;
  }, [user]);

  // Fetch basic profile
  const fetchBasicProfile = useCallback(async () => {
    try {
      setBasicLoading(true);
      const idToken = await getIdToken();

      const response = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch profile');

      const data = await response.json();
      setBasicProfile(data.user);

      setFormData({
        first_name: data.user.first_name || '',
        last_name: data.user.last_name || '',
        nickname: data.user.nickname || '',
        description: data.user.description || '',
        area_of_interest: data.user.area_of_interest || [],
        date_of_birth: data.user.date_of_birth || '',
        gender: data.user.gender || '',
      });
      setUsername(data.user.username || '');
    } catch (err) {
      console.error('Error fetching basic profile:', err);
      setError('Failed to load profile');
    } finally {
      setBasicLoading(false);
    }
  }, [getIdToken]);

  // Fetch full profile
  const fetchFullProfile = useCallback(async () => {
    try {
      setFullLoading(true);
      const idToken = await getIdToken();

      const response = await fetch('/api/profile/full', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch full profile');

      const data: FullProfileData = await response.json();
      setFullProfile(data);
      // Update basic profile with latest user data
      setBasicProfile(data.user);
    } catch (err) {
      console.error('Error fetching full profile:', err);
      // Non-critical - basic profile still works
    } finally {
      setFullLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user) {
      fetchBasicProfile();
      fetchFullProfile();
    }
  }, [user, fetchBasicProfile, fetchFullProfile]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const idToken = await getIdToken();

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const data = await response.json();
      setBasicProfile(data.user);
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [formData, getIdToken]);

  const handleCancel = useCallback(() => {
    if (basicProfile) {
      setFormData({
        first_name: basicProfile.first_name || '',
        last_name: basicProfile.last_name || '',
        nickname: basicProfile.nickname || '',
        description: basicProfile.description || '',
        area_of_interest: basicProfile.area_of_interest || [],
        date_of_birth: basicProfile.date_of_birth || '',
        gender: basicProfile.gender || '',
      });
    }
    setIsEditing(false);
    setError(null);
  }, [basicProfile]);

  const handleAvatarUpload = useCallback(async (file: File, cropData: CropData) => {
    const idToken = await getIdToken();

    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('cropData', JSON.stringify(cropData));

    const response = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: formDataUpload,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to upload avatar');
    }

    const data = await response.json();
    setBasicProfile((prev) =>
      prev ? { ...prev, avatar_url: data.avatar.url } : null
    );
    setSuccess('Profile picture updated!');
    setTimeout(() => setSuccess(null), 3000);
  }, [getIdToken]);

  const handleAvatarRemove = useCallback(async () => {
    const idToken = await getIdToken();

    const response = await fetch('/api/profile/avatar', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) throw new Error('Failed to remove avatar');

    setBasicProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
    setSuccess('Profile picture removed');
    setTimeout(() => setSuccess(null), 3000);
  }, [getIdToken]);

  const checkUsernameAvailability = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameAvailable(null);
      setUsernameSuggestions([]);
      return;
    }

    setCheckingUsername(true);
    try {
      const response = await fetch(
        `/api/auth/check-username?username=${encodeURIComponent(value)}&excludeUserId=${basicProfile?.id}`
      );
      const data = await response.json();
      setUsernameAvailable(data.available);
      setUsernameSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Error checking username:', err);
    } finally {
      setCheckingUsername(false);
    }
  }, [basicProfile?.id]);

  const handleSetUsername = useCallback(async () => {
    if (!usernameAvailable || !username) return;

    try {
      setSaving(true);
      const idToken = await getIdToken();

      const response = await fetch('/api/auth/set-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set username');
      }

      const data = await response.json();
      setBasicProfile((prev) =>
        prev ? { ...prev, username: data.user.username } : null
      );
      setSuccess('Username set successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to set username');
    } finally {
      setSaving(false);
    }
  }, [usernameAvailable, username, getIdToken]);

  return {
    basicProfile,
    basicLoading,
    fullProfile,
    fullLoading,
    isEditing,
    setIsEditing,
    formData,
    setFormData,
    saving,
    error,
    setError,
    success,
    setSuccess,
    handleSave,
    handleCancel,
    handleAvatarUpload,
    handleAvatarRemove,
    // Username
    username,
    setUsername,
    usernameAvailable,
    setUsernameAvailable,
    usernameSuggestions,
    setUsernameSuggestions,
    checkingUsername,
    checkUsernameAvailability,
    handleSetUsername,
  };
}

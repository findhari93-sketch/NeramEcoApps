'use client';

import { useState, useCallback } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

/**
 * Hook that provides a function to navigate to the Student App with SSO.
 * Exchanges the Firebase ID token for a custom token and opens the app.
 */
export function useGoToApp() {
  const { user } = useFirebaseAuth();
  const [loading, setLoading] = useState(false);

  const goToApp = useCallback(async () => {
    if (!user) {
      window.open(APP_URL, '_blank');
      return;
    }

    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${APP_URL}/api/auth/exchange-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (response.ok) {
          const { customToken } = await response.json();
          window.open(
            `${APP_URL}?authToken=${encodeURIComponent(customToken)}`,
            '_blank'
          );
          return;
        }
      }
    } catch (error) {
      console.error('Error exchanging token for app:', error);
    } finally {
      setLoading(false);
    }
    // Fallback: open without auth token
    window.open(APP_URL, '_blank');
  }, [user]);

  return { goToApp, loading };
}

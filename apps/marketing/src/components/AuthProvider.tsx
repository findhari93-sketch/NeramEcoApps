'use client';

import { ReactNode, useEffect } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebaseAuth();

  // Register/sync user with Supabase when logged in
  useEffect(() => {
    async function syncUser() {
      if (!user || loading) return;

      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const idToken = await currentUser.getIdToken();
        await fetch(`${APP_URL}/api/auth/register-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      } catch (error) {
        console.error('Error syncing user:', error);
      }
    }

    syncUser();
  }, [user, loading]);

  return <>{children}</>;
}

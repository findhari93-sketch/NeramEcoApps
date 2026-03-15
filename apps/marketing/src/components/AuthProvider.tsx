'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import type { AccountTier } from '@neram/database';
import { AccountTierProvider } from '@/contexts/AccountTierContext';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebaseAuth();
  const [accountTier, setAccountTier] = useState<AccountTier>('visitor');

  // Register/sync user with Supabase when logged in
  useEffect(() => {
    async function syncUser() {
      if (!user || loading) return;

      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const idToken = await currentUser.getIdToken();
        const res = await fetch(`${APP_URL}/api/auth/register-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.account_tier) {
            setAccountTier(data.account_tier);
          }
        }
      } catch (error) {
        console.error('Error syncing user:', error);
      }
    }

    syncUser();
  }, [user, loading]);

  // Reset tier on sign out
  useEffect(() => {
    if (!user && !loading) {
      setAccountTier('visitor');
    }
  }, [user, loading]);

  return (
    <AccountTierProvider value={{ accountTier }}>
      {children}
    </AccountTierProvider>
  );
}

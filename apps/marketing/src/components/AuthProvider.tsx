'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useFirebaseAuth } from '@neram/auth';
import type { AccountTier } from '@neram/database';
import { AccountTierProvider } from '@/contexts/AccountTierContext';
import { ensureAccount } from '@/lib/ensure-account';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebaseAuth();
  const [accountTier, setAccountTier] = useState<AccountTier>('visitor');

  // Register/sync user with Supabase when logged in. Shares one request per
  // uid with the apply form (ensureAccount), so a new user is created once.
  useEffect(() => {
    if (!user || loading) return;
    let cancelled = false;
    ensureAccount().then((account) => {
      if (!cancelled && account?.account_tier) setAccountTier(account.account_tier as AccountTier);
    });
    return () => {
      cancelled = true;
    };
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

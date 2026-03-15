'use client';

import { createContext, useContext } from 'react';
import type { AccountTier } from '@neram/database';

interface AccountTierContextValue {
  accountTier: AccountTier;
}

const AccountTierContext = createContext<AccountTierContextValue>({
  accountTier: 'visitor',
});

export const AccountTierProvider = AccountTierContext.Provider;

export function useAccountTier(): AccountTier {
  return useContext(AccountTierContext).accountTier;
}

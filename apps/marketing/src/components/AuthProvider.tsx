'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import PhoneVerificationModal from './PhoneVerificationModal';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebaseAuth();
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // Check phone verification after sign-in
  useEffect(() => {
    async function checkPhoneVerification() {
      if (!user || loading) {
        setPhoneVerified(null);
        return;
      }

      setCheckingPhone(true);

      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const idToken = await currentUser.getIdToken();
        const response = await fetch(`${APP_URL}/api/auth/register-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (response.ok) {
          const { user: dbUser } = await response.json();
          setPhoneVerified(dbUser.phone_verified);
        }
      } catch (error) {
        console.error('Error checking phone verification:', error);
      } finally {
        setCheckingPhone(false);
      }
    }

    checkPhoneVerification();
  }, [user, loading]);

  const handlePhoneVerified = async (phoneNumber: string) => {
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();

      // Call tools-app API to save verified phone (cross-origin)
      const response = await fetch(`${APP_URL}/api/auth/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, phoneNumber }),
      });

      if (response.ok) {
        setPhoneVerified(true);
      } else {
        console.error('Failed to save phone verification');
      }
    } catch (error) {
      console.error('Error during phone verification:', error);
    }
  };

  return (
    <>
      {children}
      {user && phoneVerified === false && (
        <PhoneVerificationModal
          open={true}
          onVerified={handlePhoneVerified}
        />
      )}
    </>
  );
}

'use client';

import { useEffect } from 'react';
import { firebaseSignOut } from '@neram/auth';

export default function SignOutPage() {
  useEffect(() => {
    async function doSignOut() {
      try {
        await firebaseSignOut();
        sessionStorage.removeItem('neram_sso_attempted');
      } catch (error) {
        console.error('Sign-out error:', error);
      }
      // Notify parent window (if loaded in iframe)
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'neram_signed_out' }, '*');
      }
    }
    doSignOut();
  }, []);

  return null;
}

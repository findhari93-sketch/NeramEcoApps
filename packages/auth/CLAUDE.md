# Auth Specialist (@neram/auth)

## My Domain
Authentication across all apps - Firebase + Microsoft Entra ID

## Auth Matrix

| App | Provider | Users | Scope |
|-----|----------|-------|-------|
| marketing | Firebase (optional) | Leads | Google OAuth |
| app | Firebase (required) | Students | Google + Phone OTP |
| nexus | Microsoft Entra ID | Teachers | Azure AD |
| admin | Microsoft Entra ID | Staff | Azure AD |

## Tech Stack
- Firebase Auth (v11.8.0)
- Azure MSAL Browser (v3.6.0)
- Azure MSAL React (v2.0.8)

## Directory Structure
```
src/
├── index.ts            # Main exports
├── firebase.ts         # Firebase auth utilities
├── microsoft.ts        # Microsoft MSAL config
└── hooks.tsx           # React hooks for both providers
```

## Critical Files
- `src/firebase.ts` - Firebase auth (Google, Phone OTP)
- `src/microsoft.ts` - Microsoft MSAL configuration
- `src/hooks.tsx` - React hooks for auth state

## Firebase Authentication

### Configuration
```typescript
// Already configured in firebase.ts
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // ...
};
```

### Google Sign-In
```typescript
import { signInWithGoogle } from '@neram/auth/firebase';

const handleGoogleSignIn = async () => {
  try {
    const user = await signInWithGoogle();
    console.log('Signed in:', user.email);
  } catch (error) {
    console.error('Sign-in failed:', error);
  }
};
```

### Phone OTP
```typescript
import { sendPhoneOTP, verifyPhoneOTP, setupRecaptcha } from '@neram/auth/firebase';

// Setup reCAPTCHA (once)
const recaptchaVerifier = setupRecaptcha('recaptcha-container');

// Send OTP
const verificationId = await sendPhoneOTP('+91XXXXXXXXXX', recaptchaVerifier);

// Verify OTP
const user = await verifyPhoneOTP(verificationId, '123456');
```

### Firebase Auth Hook
```typescript
import { useFirebaseAuth } from '@neram/auth';

function Component() {
  const { user, loading, signOut } = useFirebaseAuth();

  if (loading) return <Loading />;
  if (!user) return <LoginButton />;

  return (
    <div>
      <p>Welcome, {user.email}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

## Microsoft Entra ID Authentication

### Configuration
```typescript
// Already configured in microsoft.ts
const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: '/auth/callback',
  },
};
```

### Microsoft Sign-In
```typescript
import { signInWithMicrosoft } from '@neram/auth/microsoft';

const handleMicrosoftSignIn = async () => {
  try {
    const user = await signInWithMicrosoft();
    console.log('Signed in:', user.email);
  } catch (error) {
    console.error('Sign-in failed:', error);
  }
};
```

### Microsoft Auth Hook
```typescript
import { useMicrosoftAuth } from '@neram/auth';

function Component() {
  const { user, loading, login, logout, getAccessToken } = useMicrosoftAuth();

  // Get access token for MS Graph API
  const token = await getAccessToken(['User.Read', 'Calendars.Read']);
}
```

## User Identity Linking

### Unified User in Supabase
```typescript
// User table has multiple auth IDs
interface User {
  id: string;
  firebase_uid?: string;    // Firebase auth
  ms_oid?: string;          // Microsoft Object ID
  google_id?: string;       // Google account
  email: string;
  phone?: string;
}
```

### Linking Firebase to Supabase User
```typescript
import { getOrCreateUserFromFirebase } from '@neram/database/queries/users';

// After Firebase sign-in
const firebaseUser = await signInWithGoogle();
const supabaseUser = await getOrCreateUserFromFirebase(firebaseUser);
```

### Linking Microsoft to Supabase User
```typescript
import { linkMicrosoftToUser } from '@neram/database/queries/users';

// After Microsoft sign-in
const msUser = await signInWithMicrosoft();
await linkMicrosoftToUser(supabaseUserId, msUser.oid);
```

## Cross-Domain Authentication

### Redirect Flow (Marketing → App)
```typescript
// In firebase.ts - stores redirect URL
const handleRedirectAfterAuth = () => {
  const redirectUrl = sessionStorage.getItem('authRedirectUrl');
  if (redirectUrl) {
    sessionStorage.removeItem('authRedirectUrl');
    window.location.href = redirectUrl;
  }
};
```

### Setting Redirect URL
```typescript
// Before auth, set where to go after
sessionStorage.setItem('authRedirectUrl', 'https://app.neramclasses.com/dashboard');
await signInWithGoogle();
```

## Patterns

### Protected Route Wrapper
```typescript
'use client';
import { useFirebaseAuth } from '@neram/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useFirebaseAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) return <Loading />;
  if (!user) return null;

  return <>{children}</>;
}
```

### API Route Token Verification
```typescript
// In API route
import { verifyFirebaseToken } from '@neram/auth';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const decodedToken = await verifyFirebaseToken(token);
    // decodedToken contains user info
  } catch (error) {
    return new Response('Invalid token', { status: 401 });
  }
}
```

## Environment Variables

### Firebase
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### Microsoft
```
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_TENANT_ID=
AZURE_AD_CLIENT_SECRET=
```

## When Apps Need Me
- Login/logout flows
- Phone OTP verification
- OAuth token handling
- User profile sync to Supabase
- Cross-domain authentication
- Token refresh handling

## Testing
- Use Firebase Auth Emulator for tests
- Mock MSAL for Microsoft auth tests
- Test cross-domain redirect flows

/**
 * Neram Classes - Microsoft Authentication
 * 
 * Microsoft Entra ID (Azure AD) auth for:
 * - nexus.neramclasses.com (Classroom)
 * - admin.neramclasses.com (Admin Panel)
 */

import {
  PublicClientApplication,
  Configuration,
  AccountInfo,
  AuthenticationResult,
  InteractionRequiredAuthError,
  SilentRequest,
  RedirectRequest,
  PopupRequest,
} from '@azure/msal-browser';

// ============================================
// MSAL CONFIGURATION
// ============================================

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      logLevel: process.env.NODE_ENV === 'development' ? 3 : 0, // Info in dev, Error in prod
      piiLoggingEnabled: false,
    },
  },
};

// ============================================
// SCOPES
// ============================================

export const loginScopes = {
  default: ['openid', 'profile', 'email', 'User.Read'],
  teams: ['openid', 'profile', 'email', 'User.Read', 'Team.ReadBasic.All', 'Channel.ReadBasic.All'],
  graph: ['openid', 'profile', 'email', 'User.Read', 'Mail.Read', 'Calendars.Read'],
  admin: ['openid', 'profile', 'email', 'User.Read', 'User.ReadWrite.All', 'Directory.Read.All'],
};

// ============================================
// MSAL INSTANCE
// ============================================

let msalInstance: PublicClientApplication | null = null;
let msalInitialized = false;

export async function initializeMsal(): Promise<PublicClientApplication> {
  if (msalInstance && msalInitialized) {
    return msalInstance;
  }

  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();
  msalInitialized = true;

  // Handle redirect response
  await msalInstance.handleRedirectPromise();

  return msalInstance;
}

export function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    throw new Error('MSAL not initialized. Call initializeMsal first.');
  }
  return msalInstance;
}

export function isMsalConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID &&
    process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID
  );
}

// ============================================
// AUTHENTICATION
// ============================================

export async function signInWithMicrosoft(
  scopes: string[] = loginScopes.default,
  usePopup = true
): Promise<AuthenticationResult> {
  const msal = await initializeMsal();

  const request: PopupRequest | RedirectRequest = {
    scopes,
    prompt: 'select_account',
  };

  if (usePopup) {
    return msal.loginPopup(request);
  } else {
    await msal.loginRedirect(request);
    // This won't return - page will redirect
    throw new Error('Redirecting to Microsoft login...');
  }
}

export async function signInSilent(
  scopes: string[] = loginScopes.default
): Promise<AuthenticationResult | null> {
  const msal = await initializeMsal();
  const account = getActiveAccount();

  if (!account) {
    return null;
  }

  const request: SilentRequest = {
    scopes,
    account,
  };

  try {
    return await msal.acquireTokenSilent(request);
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      return null;
    }
    throw error;
  }
}

export async function getAccessToken(
  scopes: string[] = loginScopes.default
): Promise<string | null> {
  const msal = await initializeMsal();
  const account = getActiveAccount();

  if (!account) {
    return null;
  }

  try {
    const result = await msal.acquireTokenSilent({
      scopes,
      account,
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Token expired, need interactive login
      const result = await msal.acquireTokenPopup({ scopes });
      return result.accessToken;
    }
    throw error;
  }
}

// ============================================
// ACCOUNT MANAGEMENT
// ============================================

export function getActiveAccount(): AccountInfo | null {
  if (!msalInstance) return null;
  
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;
  
  // Return active account or first account
  return msalInstance.getActiveAccount() || accounts[0];
}

export function setActiveAccount(account: AccountInfo): void {
  if (!msalInstance) return;
  msalInstance.setActiveAccount(account);
}

export function getAllAccounts(): AccountInfo[] {
  if (!msalInstance) return [];
  return msalInstance.getAllAccounts();
}

export async function signOut(
  account?: AccountInfo,
  postLogoutRedirectUri?: string
): Promise<void> {
  const msal = await initializeMsal();
  const accountToLogout = account || getActiveAccount();

  if (accountToLogout) {
    await msal.logoutPopup({
      account: accountToLogout,
      postLogoutRedirectUri: postLogoutRedirectUri || window.location.origin,
    });
  }
}

// ============================================
// HELPERS
// ============================================

export function isAuthenticated(): boolean {
  const account = getActiveAccount();
  return account !== null;
}

export function getUserInfo(): {
  name: string;
  email: string;
  oid: string;
} | null {
  const account = getActiveAccount();
  if (!account) return null;

  return {
    name: account.name || '',
    email: account.username || '',
    oid: account.localAccountId || '',
  };
}

export function getMicrosoftOid(): string | null {
  const account = getActiveAccount();
  return account?.localAccountId || null;
}

// ============================================
// GRAPH API HELPER
// ============================================

export async function callMsGraph<T>(
  endpoint: string,
  scopes: string[] = loginScopes.graph,
  options?: RequestInit
): Promise<T> {
  const accessToken = await getAccessToken(scopes);
  
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ============================================
// EXPORTS
// ============================================

export type { AccountInfo, AuthenticationResult };

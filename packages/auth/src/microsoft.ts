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
  BrowserAuthError,
  BrowserAuthErrorCodes,
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
  nexus: [
    'openid', 'profile', 'email', 'User.Read',
    'OnlineMeetings.ReadWrite',
    'OnlineMeetingArtifact.Read.All',
    'Files.ReadWrite',
  ],
};

// ============================================
// ERROR HANDLING
// ============================================

export class MsalLoginError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MsalLoginError';
    this.code = code;
  }
}

export function getMsalErrorMessage(error: Error): { message: string; canRetry: boolean } {
  const code = error instanceof MsalLoginError ? error.code : '';
  const msg = error.message || '';

  if (code === 'user_cancelled' || msg.includes('user_cancelled')) {
    return { message: 'Sign-in was cancelled. Click the button to try again.', canRetry: true };
  }
  if (code === 'redirect_fallback' || msg.includes('Redirecting')) {
    return { message: 'Redirecting to Microsoft sign-in...', canRetry: false };
  }
  if (code === 'popup_blocked') {
    return {
      message: 'Your browser blocked the sign-in popup. Please allow popups for this site or try again.',
      canRetry: true,
    };
  }
  if (code === 'timeout' || msg.includes('timed out')) {
    return { message: 'Sign-in timed out. Please check your connection and try again.', canRetry: true };
  }
  if (msg.includes('interaction_in_progress')) {
    return { message: 'A previous sign-in is still processing. Please wait and try again.', canRetry: true };
  }
  return { message: 'Authentication failed. Please try again.', canRetry: true };
}

/**
 * Clear stuck MSAL interaction state from localStorage.
 * Removes only interaction-tracking keys, preserving cached tokens and accounts.
 */
function clearInteractionState(): void {
  if (typeof window === 'undefined') return;

  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (
      key.includes('msal.interaction.status') ||
      key.includes('.interaction_in_progress') ||
      key.includes('msal.temp') ||
      key.includes('msal.broker') ||
      key.includes('-request.') ||
      key.includes('.request.params') ||
      key.includes('.request.origin')
    ) {
      localStorage.removeItem(key);
    }
  }

  // Also clear sessionStorage interaction keys
  const sessionKeys = Object.keys(sessionStorage);
  for (const key of sessionKeys) {
    if (key.includes('msal') && (key.includes('interaction') || key.includes('request') || key.includes('temp'))) {
      sessionStorage.removeItem(key);
    }
  }
}

// ============================================
// MSAL INSTANCE
// ============================================

let msalInstance: PublicClientApplication | null = null;
let msalInitialized = false;
let redirectResult: AuthenticationResult | null = null;

export async function initializeMsal(): Promise<PublicClientApplication> {
  if (msalInstance && msalInitialized) {
    return msalInstance;
  }

  // Clear any stale interaction state from a previous failed redirect
  // (e.g., user clicked back from Microsoft login, or redirect URI was rejected)
  clearInteractionState();

  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();
  msalInitialized = true;

  // Handle redirect response (returns result if user just came back from redirect login)
  try {
    const result = await msalInstance.handleRedirectPromise();
    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
      redirectResult = result;
    }
  } catch (error) {
    // If handleRedirectPromise fails (e.g., interaction_in_progress), clear state and continue
    console.warn('[MSAL] handleRedirectPromise failed, clearing state:', error);
    clearInteractionState();
  }

  return msalInstance;
}

/** Returns the result from the most recent redirect login, if any. */
export function getRedirectResult(): AuthenticationResult | null {
  return redirectResult;
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
  usePopup = false
): Promise<AuthenticationResult> {
  const msal = await initializeMsal();

  const request: PopupRequest | RedirectRequest = {
    scopes,
    prompt: 'select_account',
  };

  if (usePopup) {
    try {
      return await msal.loginPopup(request);
    } catch (error) {
      // Handle interaction_in_progress: clear stuck state and retry once
      if (
        error instanceof BrowserAuthError &&
        error.errorCode === BrowserAuthErrorCodes.interactionInProgress
      ) {
        console.warn('[MSAL] Interaction in progress, clearing state and retrying...');
        clearInteractionState();
        msalInstance = null;
        msalInitialized = false;
        const freshMsal = await initializeMsal();

        try {
          return await freshMsal.loginPopup(request);
        } catch (retryError) {
          console.warn('[MSAL] Popup retry failed, falling back to redirect.');
          await freshMsal.loginRedirect(request);
          throw new MsalLoginError('redirect_fallback', 'Redirecting to Microsoft login...');
        }
      }

      // Handle user_cancelled gracefully
      if (
        error instanceof BrowserAuthError &&
        error.errorCode === BrowserAuthErrorCodes.userCancelled
      ) {
        throw new MsalLoginError('user_cancelled', 'Sign-in was cancelled. Please try again.');
      }

      // Handle popup blocked by browser
      if (
        error instanceof BrowserAuthError &&
        error.errorCode === BrowserAuthErrorCodes.popupWindowError
      ) {
        console.warn('[MSAL] Popup blocked, falling back to redirect.');
        await msal.loginRedirect(request);
        throw new MsalLoginError('popup_blocked', 'Pop-up was blocked. Redirecting...');
      }

      // Handle popup timeout
      if (
        error instanceof BrowserAuthError &&
        error.errorCode === BrowserAuthErrorCodes.monitorPopupTimeout
      ) {
        throw new MsalLoginError('timeout', 'Sign-in timed out. Please try again.');
      }

      throw error;
    }
  } else {
    try {
      await msal.loginRedirect(request);
    } catch (error) {
      // Handle interaction_in_progress: clear stuck state and retry once
      if (
        error instanceof BrowserAuthError &&
        error.errorCode === BrowserAuthErrorCodes.interactionInProgress
      ) {
        console.warn('[MSAL] Redirect blocked by interaction_in_progress, clearing and retrying...');
        clearInteractionState();
        msalInstance = null;
        msalInitialized = false;
        const freshMsal = await initializeMsal();
        await freshMsal.loginRedirect(request);
      } else {
        throw error;
      }
    }
    throw new MsalLoginError('redirect_fallback', 'Redirecting to Microsoft login...');
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
      try {
        const result = await msal.acquireTokenPopup({ scopes });
        return result.accessToken;
      } catch (popupError) {
        if (
          popupError instanceof BrowserAuthError &&
          popupError.errorCode === BrowserAuthErrorCodes.interactionInProgress
        ) {
          clearInteractionState();
          msalInstance = null;
          msalInitialized = false;
          const freshMsal = await initializeMsal();
          const result = await freshMsal.acquireTokenPopup({ scopes });
          return result.accessToken;
        }
        throw popupError;
      }
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
    await msal.logoutRedirect({
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

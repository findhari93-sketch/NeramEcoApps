'use client';

import { createContext, useContext, useEffect } from 'react';

export type LoginHandler = () => void;

interface ShellActions {
  /** Opens the sign-in dialog. Null while no page has registered one, and the header shows no Log in button. */
  login: LoginHandler | null;
  registerLogin: (handler: LoginHandler | null) => void;
}

const ShellActionsContext = createContext<ShellActions>({ login: null, registerLogin: () => {} });

export const ShellActionsProvider = ShellActionsContext.Provider;

export function useShellActions(): ShellActions {
  return useContext(ShellActionsContext);
}

/**
 * Lets a page put a Log in button in the shell header. Pass null to hide it
 * (for example once the visitor is signed in). The handler is removed on unmount.
 */
export function useShellLogin(handler: LoginHandler | null): void {
  const { registerLogin } = useShellActions();
  useEffect(() => {
    registerLogin(handler);
    return () => registerLogin(null);
  }, [handler, registerLogin]);
}

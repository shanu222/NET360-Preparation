type AuthDebugSnapshot = {
  firebaseInitialized: boolean;
  userAuthenticated: boolean;
  firebaseTokenGenerated: boolean;
  tokenAudience: string;
  tokenIssuer: string;
  backendLoginStatus: string;
  backendLoginCode: string;
  sessionDeviceId: string;
  refreshStatus: string;
  activeSessionStatus: string;
  updatedAt: string;
};

const AUTH_DEBUG_EVENT = 'net360:auth-debug-updated';

const snapshot: AuthDebugSnapshot = {
  firebaseInitialized: false,
  userAuthenticated: false,
  firebaseTokenGenerated: false,
  tokenAudience: '',
  tokenIssuer: '',
  backendLoginStatus: 'idle',
  backendLoginCode: '',
  sessionDeviceId: '',
  refreshStatus: 'idle',
  activeSessionStatus: 'unknown',
  updatedAt: new Date(0).toISOString(),
};

export function updateAuthDebug(patch: Partial<AuthDebugSnapshot>) {
  Object.assign(snapshot, patch, { updatedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_DEBUG_EVENT, { detail: { ...snapshot } }));
  }
}

export function getAuthDebugSnapshot(): AuthDebugSnapshot {
  return { ...snapshot };
}

export function subscribeAuthDebug(listener: (state: AuthDebugSnapshot) => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AuthDebugSnapshot>).detail;
    listener(detail || getAuthDebugSnapshot());
  };
  window.addEventListener(AUTH_DEBUG_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(AUTH_DEBUG_EVENT, handler as EventListener);
  };
}

export type { AuthDebugSnapshot };

import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { API_BASE_URL, authClient } from '@/lib/auth-client';

export type AppRole = 'student' | 'staff';

export type MobileSession = {
  displayName: string;
  domainId: string;
  isOnlineManaged?: boolean;
  role: AppRole;
  staffRole?: string;
};

type SessionContextValue = {
  refreshProfile: () => Promise<MobileSession | null>;
  session: MobileSession | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  signOut: () => Promise<void>;
};

type ProfileResponse =
  | {
      accountType: 'STAFF';
      id: string;
      name: string;
      role: string;
    }
  | {
      accountType: 'STUDENT';
      id: string;
      isOnlineManaged: boolean;
      name: string;
      role: 'STUDENT';
    };

const SessionContext = createContext<SessionContextValue | null>(null);

function authHeaders() {
  if (Platform.OS === 'web') return undefined;
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : undefined;
}

export async function authenticatedFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  });
}

async function fetchProfile(): Promise<MobileSession | null> {
  const response = await authenticatedFetch('/api/mobile/v1/auth/me', {
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const profile = (await response.json()) as ProfileResponse;
  return profile.accountType === 'STAFF'
    ? {
        displayName: profile.name,
        domainId: profile.id,
        role: 'staff',
        staffRole: profile.role,
      }
    : {
        displayName: profile.name,
        domainId: profile.id,
        isOnlineManaged: profile.isOnlineManaged,
        role: 'student',
      };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const authSession = authClient.useSession();
  const [profile, setProfile] = useState<{
    authUserId: string;
    session: MobileSession | null;
  } | null>(null);

  const refreshProfile = useCallback(async () => {
    const authUserId = authSession.data?.user.id;
    if (!authUserId) return null;

    try {
      const nextSession = await fetchProfile();
      setProfile({ authUserId, session: nextSession });
      return nextSession;
    } catch {
      setProfile({ authUserId, session: null });
      return null;
    }
  }, [authSession.data?.user.id]);

  useEffect(() => {
    const authUserId = authSession.data?.user.id;
    if (!authUserId) return;

    let active = true;
    void fetchProfile().then((nextSession) => {
      if (active) setProfile({ authUserId, session: nextSession });
    });
    return () => {
      active = false;
    };
  }, [authSession.data?.user.id]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setProfile(null);
  }, []);

  const authUserId = authSession.data?.user.id;
  const profileIsCurrent = !!authUserId && profile?.authUserId === authUserId;
  const session = profileIsCurrent ? profile.session : null;
  const status: SessionContextValue['status'] =
    authSession.isPending || (!!authUserId && !profileIsCurrent)
      ? 'loading'
      : session
        ? 'authenticated'
        : 'anonymous';

  const value = useMemo(
    () => ({ refreshProfile, session, signOut, status }),
    [refreshProfile, session, signOut, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return context;
}

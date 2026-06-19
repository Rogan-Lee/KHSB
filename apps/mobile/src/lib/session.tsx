import * as SecureStore from 'expo-secure-store';
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

export type AppRole = 'student' | 'staff';

export type MobileSession = {
  displayName: string;
  role: AppRole;
  userId: string;
};

type SessionContextValue = {
  session: MobileSession | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  startDemoSession: (role: AppRole, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SESSION_KEY = 'studyroom.mobile.session.v1';
const SessionContext = createContext<SessionContextValue | null>(null);

async function readSession() {
  const raw =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MobileSession;
  } catch {
    return null;
  }
}

async function writeSession(session: MobileSession | null) {
  if (Platform.OS === 'web') {
    if (session) {
      globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      globalThis.localStorage?.removeItem(SESSION_KEY);
    }
    return;
  }

  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [status, setStatus] = useState<SessionContextValue['status']>('loading');

  useEffect(() => {
    readSession()
      .then((storedSession) => {
        setSession(storedSession);
        setStatus(storedSession ? 'authenticated' : 'anonymous');
      })
      .catch(() => setStatus('anonymous'));
  }, []);

  const startDemoSession = useCallback(async (role: AppRole, displayName?: string) => {
    const nextSession: MobileSession = {
      displayName: displayName?.trim() || (role === 'student' ? '김학생' : '이관리자'),
      role,
      userId: `demo-${role}`,
    };

    await writeSession(nextSession);
    setSession(nextSession);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await writeSession(null);
    setSession(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ session, signOut, startDemoSession, status }),
    [session, signOut, startDemoSession, status],
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

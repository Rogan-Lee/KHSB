import { useEffect } from 'react';

import { getNotificationPreferences } from '@/lib/notifications';
import { syncRemotePushRegistration } from '@/lib/push-registration';
import { useSession } from '@/lib/session';

export function RemotePushRegistration() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;

    void getNotificationPreferences()
      .then((preferences) =>
        active ? syncRemotePushRegistration(preferences) : undefined,
      )
      .catch((error) => {
        console.warn('[remote-push-registration]', error);
      });

    return () => {
      active = false;
    };
  }, [status]);

  return null;
}

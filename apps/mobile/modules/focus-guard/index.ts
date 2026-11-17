import { requireOptionalNativeModule } from 'expo';

// 안드로이드 집중 모드 네이티브 모듈 (android/src/main/java/expo/modules/focusguard) — iOS·웹에선 null.

export type FocusGuardState = {
  /** 서비스가 돌고 끝 시각이 남아 있음 */
  active: boolean;
  endsAt: number | null;
  pin: string | null;
  /** 고른 앱 수 */
  picked: number;
  /** 설정 › 사용 정보 접근 */
  usageAccess: boolean;
  /** 설정 › 다른 앱 위에 표시 */
  overlay: boolean;
  /** 설정 › 앱 › 배터리 '제한 없음' */
  battery: boolean;
};

export type FocusGuardApp = { packageName: string; label: string; icon: string | null };

type FocusGuardNative = {
  getState(): FocusGuardState;
  getApps(): Promise<FocusGuardApp[]>;
  getBlocked(): string[];
  setBlocked(packages: string[]): void;
  /** 시작 또는 끝 시각 바꾸기(ms). 백그라운드라 막히면 false */
  start(endsAt: number): boolean;
  stop(): void;
  setPin(pin: string | null): void;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  openBatterySettings(): void;
};

export const FocusGuard = requireOptionalNativeModule<FocusGuardNative>('FocusGuard');

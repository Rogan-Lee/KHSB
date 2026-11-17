import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as DA from 'react-native-device-activity';

import { sendTimer } from '@/lib/api/student-plan';
import { mutateMobileApi } from '@/lib/mobile-api';
import { cancelFocusCheck, scheduleFocusCheck } from '@/lib/notifications';

import { FocusGuard } from '../../../modules/focus-guard';

// 집중 모드 공용 — 고른 앱을 학생이 끝낼 때까지 잠근다. 학생이 직접 켜고 끄는 개인용 장치다.
// · iOS: 스크린 타임(개인 권한 individual). 애플 Family Controls 약관상 시설이 학생 기기를 통제하거나
//   사용 정보를 기기 밖으로 보내면 안 된다 → 상태는 전부 앱 그룹 UserDefaults(기기 안)에만 둔다.
//   3시간이 되면 앱이 꺼져 있어도 ActivityMonitor 확장이 intervalDidEnd 에서 잠금을 푼다.
// · 안드로이드: 자체 모듈 modules/focus-guard (사용 정보 접근 + 다른 앱 위에 표시 + 포그라운드 서비스).
//   접근성 서비스는 쓰지 않는다(Play 정책: 더 좁은 API 우선). 상태는 기기 안 SharedPreferences, 3시간이 되면 서비스가 스스로 멈춘다.
// 두 쪽 다 잠금 정보로 서버를 부르지 않는다 (공부 타이머 "계속"만 같이 보낸다 — 언제 이어 갔는지일 뿐 잠근 앱·사용 기록은 아님).
// 시설 안 강제 차단은 와이파이 차단(access-control)이 맡는다.
// 잠금 비밀번호는 학생이 스스로 정하는 "엄격 모드" 장치다. 잊으면 강한선배 로그인 비밀번호로 앱 안에서 초기화하고,
// 설정에서 권한을 끄면 잠금이 풀리고 여기서도 비밀번호를 지운다 — 심사에서 "사용자를 가두지 않는다"를 보이는 근거.
// 켜 둔 채 잊는 일을 막으려고 2시간이 지나면 "아직 공부 중인가요?"를 묻고(로컬 알림), 3시간까지 답이 없으면 풀린다.
// "계속"을 누르면 지금부터 다시 2·3시간.

export const FOCUS_ROUTE = '/(student)/focus' as Href;
export const SELECTION_ID = 'focus';
const ACTIVITY = 'focus';
/** 자동 종료 시각 — 묻는 시각은 그 1시간 전 */
const ENDS_AT_KEY = 'focusEndsAt';
const ASK_AFTER_MS = 2 * 60 * 60_000;
const AUTO_END_MS = 3 * 60 * 60_000;
// ponytail: 앱 그룹 UserDefaults 에 평문, 시도 횟수 제한 없음 — 앱을 지우면 같이 지워지고 학생이 탈옥 없이 읽을 길이 없다.
// 개인 권한이라 설정에서 권한을 끄면 어차피 풀리니 그 이상은 의미가 적다. (안드로이드 SharedPreferences 도 같음)
const PIN_KEY = 'focusPin';

/** 안드로이드 네이티브 모듈 (iOS·웹·예전 빌드에선 null) */
export const ANDROID_GUARD = Platform.OS === 'android' ? FocusGuard : null;

// ponytail: iOS 확장 타깃(차단 화면·시간 끝나면 풀기)이 iOS 18 이상으로 빌드돼 그 아래는 막는다.
// 낮추려면 react-native-device-activity 확장의 deploymentTarget 부터.
export const FOCUS_SUPPORTED =
  ANDROID_GUARD != null ||
  (Platform.OS === 'ios' && DA.isAvailable() && parseInt(String(Platform.Version), 10) >= 18);

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
const hms = (d: Date) => ({
  hour: d.getHours(),
  minute: d.getMinutes(),
  second: d.getSeconds(),
});

function read() {
  let base: { active: boolean; endsAt: number | null; pin: string | null; picked: number };
  if (ANDROID_GUARD) {
    let s = ANDROID_GUARD.getState();
    // 배터리 관리 등으로 서비스만 멈췄으면(끝 시각은 남음) 앱을 열 때 다시 켠다
    const stale = !s.active && s.endsAt != null && s.endsAt > Date.now() && s.usageAccess && s.overlay;
    if (stale && ANDROID_GUARD.start(s.endsAt!)) s = { ...s, active: true };
    base = { active: s.active, endsAt: s.active ? s.endsAt : null, pin: s.pin, picked: s.picked };
  } else if (FOCUS_SUPPORTED) {
    const m = DA.activitySelectionMetadata({ activitySelectionId: SELECTION_ID });
    // 라이브러리 0.6.1 네이티브는 webdomainCount(소문자 d)로 돌려주는데 타입은 webDomainCount 다 —
    // 그대로 더하면 NaN 이 돼 "아직 고르지 않았어요"로 보인다. 둘 다 받는다.
    const web = (m as { webdomainCount?: number } | undefined)?.webdomainCount ?? m?.webDomainCount ?? 0;
    // 잠겨 있는지는 실제 차단 상태로 본다 — 시간이 끝나 확장이 풀었으면 앱이 꺼져 있었어도 false
    const active = DA.isShieldActive();
    base = {
      active,
      endsAt: active ? (DA.userDefaultsGet<number>(ENDS_AT_KEY) ?? null) : null,
      pin: DA.userDefaultsGet<string>(PIN_KEY) ?? null,
      picked: m ? (m.applicationCount ?? 0) + (m.categoryCount ?? 0) + web : 0,
    };
  } else {
    base = { active: false, endsAt: null, pin: null, picked: 0 };
  }
  const askAt = base.endsAt == null ? null : base.endsAt - (AUTO_END_MS - ASK_AFTER_MS);
  return {
    ...base,
    askAt,
    /** 2시간이 지나 "아직 공부 중인가요?"에 답할 차례 */
    asking: askAt != null && Date.now() >= askAt,
  };
}

/** 지금부터 2시간 뒤 묻고 3시간 뒤 자동 종료하도록 (다시) 건다 */
async function arm() {
  const now = new Date();
  const end = new Date(now.getTime() + AUTO_END_MS);
  if (ANDROID_GUARD) {
    // 서비스를 띄우거나(처음) 끝 시각·알림만 바꾼다(계속). 끝 시각이 되면 서비스가 스스로 멈춘다
    ANDROID_GUARD.start(end.getTime());
  } else {
    // 시간이 다 되면 앱이 꺼져 있어도 ActivityMonitor 확장이 풀어 준다
    DA.configureActions({
      activityName: ACTIVITY,
      callbackName: 'intervalDidEnd',
      actions: [{ type: 'resetBlocks' }],
    });
    DA.stopMonitoring([ACTIVITY]);
    await DA.startMonitoring(ACTIVITY, { intervalStart: hms(now), intervalEnd: hms(end), repeats: false }, []);
    DA.userDefaultsSet(ENDS_AT_KEY, end.getTime());
  }
  // 알림 권한이 없거나 예약이 실패해도 3시간 자동 종료는 걸려 있다
  await scheduleFocusCheck(new Date(now.getTime() + ASK_AFTER_MS)).catch(() => undefined);
}

export async function startFocus() {
  if (ANDROID_GUARD) return arm();
  DA.updateShield(
    {
      title: '집중 모드 중이에요',
      subtitle: '강한선배 앱에서 끝낼 수 있어요.',
      primaryButtonLabel: '닫기',
    },
    { primary: { behavior: 'close' } },
  );
  // 자동 종료가 먼저 걸려야 잠근다 — 실패하면 풀어 줄 장치 없이 잠기는 일이 없게
  await arm();
  DA.blockSelection({ activitySelectionId: SELECTION_ID });
}

/**
 * "아직 공부 중이에요" — 잠금은 그대로, 묻는 시각·자동 종료 시각만 지금부터 다시.
 * 공부 타이머가 돌고 있으면 타이머도 지금부터 3시간 다시 (타이머 기록만 서버로 — 잠금 정보는 안 보냄).
 */
export async function keepFocus() {
  await arm();
  await sendTimer('keep').catch(() => undefined); // 타이머가 없으면 400 — 무시
}

/** 타이머 쪽 "계속"에서 — 집중 모드가 켜져 있을 때만 다시 건다 */
export async function keepFocusIfActive() {
  const on = ANDROID_GUARD ? ANDROID_GUARD.getState().active : FOCUS_SUPPORTED && DA.isShieldActive();
  if (on) await arm();
}

export function stopFocus() {
  if (ANDROID_GUARD) {
    ANDROID_GUARD.stop();
  } else {
    DA.stopMonitoring([ACTIVITY]);
    DA.resetBlocks();
    DA.userDefaultsRemove(ENDS_AT_KEY);
  }
  void cancelFocusCheck();
}

export const savePin = (pin: string) =>
  ANDROID_GUARD ? ANDROID_GUARD.setPin(pin) : DA.userDefaultsSet(PIN_KEY, pin);

const clearPin = () => (ANDROID_GUARD ? ANDROID_GUARD.setPin(null) : DA.userDefaultsRemove(PIN_KEY));

/** 잠금 비밀번호를 잊었을 때 — 강한선배 로그인 비밀번호가 맞으면 지운다 (서버는 맞다/틀리다만 답한다) */
export async function resetPinWithLoginPassword(password: string) {
  await mutateMobileApi<{ ok: true }>('/api/mobile/v1/auth/verify-password', 'POST', { password });
  clearPin();
}

// ── 권한 ─────────────────────────────────────────────────────────────────

type Permission = {
  approved: boolean;
  /** 권한이 꺼짐 — 비밀번호·잠금을 지워 처음부터 (iOS: 거부됨, 안드로이드: 두 권한 중 하나라도 없음) */
  denied: boolean;
  /** 안드로이드 — 설정 › 사용 정보 접근 */
  usageAccess: boolean;
  /** 안드로이드 — 설정 › 다른 앱 위에 표시 */
  overlay: boolean;
  /** 안드로이드 — 앱 › 배터리 '제한 없음' (꺼져도 잠금은 그대로라 denied 와는 무관, 시작만 막는다) */
  battery: boolean;
};

function useIosPermission(): Permission {
  const status = DA.useAuthorizationStatus();
  const approved = status === DA.AuthorizationStatus.approved;
  return {
    approved,
    denied: status === DA.AuthorizationStatus.denied,
    usageAccess: approved,
    overlay: approved,
    battery: true,
  };
}

function readAndroidPermission(): Permission {
  const s = ANDROID_GUARD?.getState();
  const granted = !!s?.usageAccess && !!s?.overlay;
  return {
    approved: granted && !!s?.battery,
    denied: !granted,
    usageAccess: !!s?.usageAccess,
    overlay: !!s?.overlay,
    battery: !!s?.battery,
  };
}

/** 안드로이드는 권한을 설정 앱에서 켜고 돌아온다 — 앱이 다시 앞으로 올 때마다 다시 읽는다 */
function useAndroidPermission(): Permission {
  const [perm, setPerm] = useState(readAndroidPermission);
  const refresh = useCallback(() => setPerm(readAndroidPermission()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  return perm;
}

const usePermission = ANDROID_GUARD ? useAndroidPermission : useIosPermission;

/** 집중 모드 상태 — 화면에 돌아올 때마다, 끝 시각이 지나면 다시 읽는다 (홈 카드·설정 화면이 같이 쓴다) */
export function useFocusMode() {
  const perm = usePermission();
  const [state, setState] = useState(read);
  const refresh = useCallback(() => setState(read()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  // 설정에서 권한을 끄면 잠금이 이미 풀렸다(안드로이드는 여기서 서비스도 멈춤) — 비밀번호도 지워 처음부터 다시 정하게
  const { denied } = perm;
  if (denied && (state.pin != null || state.active)) setState({ ...state, pin: null, active: false, endsAt: null });
  useEffect(() => {
    if (!denied) return;
    if (ANDROID_GUARD) {
      if (ANDROID_GUARD.getState().pin != null) ANDROID_GUARD.setPin(null);
      if (ANDROID_GUARD.getState().active) ANDROID_GUARD.stop();
    } else {
      DA.userDefaultsRemove(PIN_KEY);
      DA.userDefaultsRemove(ENDS_AT_KEY);
    }
  }, [denied]);

  // 켜져 있는 동안 15초마다 다시 읽는다 — 2시간이 되면 "아직 공부 중인가요?"를 띄우고,
  // 3시간이 지났는데 아직 안 풀렸으면 여기서 푼다 (잠금 해제는 한 번 더 해도 무해)
  const { endsAt } = state;
  useEffect(() => {
    if (endsAt == null) return;
    const check = () => {
      if (Date.now() >= endsAt) stopFocus();
      refresh();
    };
    if (Date.now() >= endsAt) check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [endsAt, refresh]);

  return {
    ...state,
    ...perm,
    ready: perm.approved && state.picked > 0 && state.pin != null,
    refresh,
  };
}

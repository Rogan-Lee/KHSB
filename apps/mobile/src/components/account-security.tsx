import { Eye, EyeOff, KeyRound, UserX } from 'lucide-react-native';
import { forwardRef, useRef, useState } from 'react';
import { type TextInput } from 'react-native';

import {
  BottomSheet,
  Button,
  IconTile,
  ListRow,
  Notice,
  Press,
  Section,
  Text,
  TextField,
  color,
  confirm,
  radius,
  toast,
  type TextFieldProps,
} from '@/design';
import { authClient } from '@/lib/auth-client';
import { useSession, type AppRole } from '@/lib/session';
import { SUPPORT_EMAIL, SUPPORT_TEL } from '@/lib/support';

// 계정 보안 — 비밀번호 변경·계정 삭제. 계정 화면(/account)과 예전 메뉴 화면이 같이 쓴다.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

// ─── 비밀번호 입력 (보기/숨기기) ─────────────────────────────────────

export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, 'secureTextEntry' | 'suffix'>>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;
    return (
      <TextField
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={PASSWORD_MAX_LENGTH}
        {...props}
        secureTextEntry={!visible}
        suffix={
          <Press
            onPress={() => setVisible((v) => !v)}
            scale={0}
            pressedBg
            hitSlop={10}
            accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
            style={{
              width: 32,
              height: 32,
              marginRight: -4,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon color={color.fg.neutralSubtle} size={20} strokeWidth={2} />
          </Press>
        }
      />
    );
  },
);

// ─── 비밀번호 변경 ──────────────────────────────────────────────────

export function PasswordChangeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState({ next: false, again: false });
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const nextRef = useRef<TextInput>(null);
  const againRef = useRef<TextInput>(null);

  const nextError =
    touched.next && next.length > 0 && next.length < PASSWORD_MIN_LENGTH
      ? `${PASSWORD_MIN_LENGTH}자 이상 입력해 주세요`
      : touched.next && next.length > 0 && next === current
        ? '지금 비밀번호와 다르게 정해 주세요'
        : null;
  const againError =
    touched.again && again.length > 0 && again !== next ? '새 비밀번호가 서로 달라요' : null;
  const canSubmit =
    current.length > 0 && next.length >= PASSWORD_MIN_LENGTH && next !== current && again === next;

  const reset = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setTouched({ next: false, again: false });
    setCurrentError(null);
    setFormError(null);
  };

  const close = () => {
    if (busy.current) return;
    reset();
    onClose();
  };

  async function submit() {
    setTouched({ next: true, again: true });
    if (!canSubmit || busy.current) return;
    busy.current = true;
    setPending(true);
    setCurrentError(null);
    setFormError(null);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      const error = result.error as AuthErrorLike;
      if (error) {
        if (error.code === 'INVALID_PASSWORD') setCurrentError('지금 비밀번호가 맞지 않아요');
        else if (error.status === 429) setFormError('시도가 너무 많았어요. 잠시 후 다시 해 주세요.');
        else if (error.code === 'PASSWORD_TOO_SHORT') setFormError(`새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`);
        else setFormError('비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      reset();
      onClose();
      toast('비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요', 'success');
    } catch {
      setFormError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={!pending}
      title="비밀번호 변경"
      description="바꾸면 이 기기를 뺀 다른 기기에서는 모두 로그아웃돼요."
      footer={
        <>
          <Button variant="gray" size="lg" onPress={close} disabled={pending} style={{ flex: 1 }}>
            취소
          </Button>
          <Button
            size="lg"
            onPress={() => void submit()}
            loading={pending}
            disabled={!canSubmit}
            style={{ flex: 1 }}>
            변경하기
          </Button>
        </>
      }>
      <PasswordField
        label="지금 비밀번호"
        value={current}
        onChangeText={(v) => {
          setCurrent(v);
          setCurrentError(null);
        }}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
        onSubmitEditing={() => nextRef.current?.focus()}
        submitBehavior="submit"
        errorMessage={currentError}
      />
      <PasswordField
        ref={nextRef}
        label="새 비밀번호"
        value={next}
        onChangeText={setNext}
        onBlur={() => setTouched((t) => ({ ...t, next: true }))}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => againRef.current?.focus()}
        submitBehavior="submit"
        description={`${PASSWORD_MIN_LENGTH}자 이상`}
        errorMessage={nextError}
      />
      <PasswordField
        ref={againRef}
        label="새 비밀번호 확인"
        value={again}
        onChangeText={(v) => {
          setAgain(v);
          if (v.length >= next.length) setTouched((t) => ({ ...t, again: true }));
        }}
        onBlur={() => setTouched((t) => ({ ...t, again: true }))}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        errorMessage={againError}
      />
      {formError != null && <Notice tone="bad">{formError}</Notice>}
    </BottomSheet>
  );
}

// ─── 계정 삭제 ──────────────────────────────────────────────────────

// App Store 5.1.1(v): 무엇이 지워지고 무엇이 왜 남는지, 남은 기록은 어떻게 지우는지 삭제 전에 알린다.
const DELETE_REMOVED: Record<AppRole, string> = {
  student: '아이디·이메일·비밀번호, 로그인 기기와 알림 설정',
  staff: '아이디·이메일·비밀번호, 로그인 기기와 알림 설정',
  parent: '아이디·이메일·비밀번호, 로그인 기기와 알림 설정, 자녀 연결',
};

const DELETE_KEPT: Record<AppRole, string> = {
  student: '출결·학습·상담 기록은',
  staff: '근무·상담 기록은',
  parent: '자녀의 출결·학습 기록과 보낸 문의는',
};

/**
 * 계정 삭제 흐름: 확인 대화상자(destructive) → 비밀번호 확인 시트 → 삭제 → 로그아웃.
 * 로그아웃 뒤 로그인 화면 이동은 역할 레이아웃의 Redirect 가 맡는다. 다른 이동이 필요하면 options.signOut 으로 바꾼다.
 * const del = useDeleteAccount(); <ListRow onPress={del.start} /> {del.sheet}
 */
export function useDeleteAccount(options: { signOut?: () => Promise<void> } = {}) {
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const role = session?.role ?? 'student';

  const start = async () => {
    const ok = await confirm({
      title: '계정을 삭제할까요?',
      message: '회원 탈퇴하면 로그인 계정이 바로 삭제되고 모든 기기에서 로그아웃돼요. 다시 쓰려면 독서실에서 새 초대를 받아야 해요.',
      confirmText: '삭제 진행',
      destructive: true,
    });
    // 확인 창이 닫히는 애니메이션이 끝난 뒤 시트를 연다 (iOS 모달 겹침 방지)
    if (ok) setTimeout(() => setOpen(true), 350);
  };

  const close = () => {
    if (busy.current) return;
    setOpen(false);
    setPassword('');
    setError(null);
  };

  async function submit() {
    if (!password || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.deleteUser({ password });
      const authError = result.error as AuthErrorLike;
      if (authError) {
        setError(
          authError.code === 'INVALID_PASSWORD'
            ? '비밀번호가 맞지 않아요'
            : authError.status === 429
              ? '시도가 너무 많았어요. 잠시 후 다시 해 주세요.'
              : '계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
        return;
      }
      setOpen(false);
      setPassword('');
      toast('계정을 삭제했어요');
      try {
        await (options.signOut ?? signOut)();
      } catch {
        // 계정이 이미 지워져 서버 로그아웃이 실패해도 로컬 세션은 정리된다
      }
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const sheet = (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={!pending}
      title="비밀번호를 확인할게요"
      description="계정을 삭제하려면 비밀번호를 한 번 더 입력해 주세요."
      footer={
        <>
          <Button variant="gray" size="lg" onPress={close} disabled={pending} style={{ flex: 1 }}>
            취소
          </Button>
          <Button
            variant="danger"
            size="lg"
            onPress={() => void submit()}
            loading={pending}
            disabled={!password}
            style={{ flex: 1 }}>
            계정 삭제
          </Button>
        </>
      }>
      <Notice title="바로 삭제돼요">{DELETE_REMOVED[role]}</Notice>
      <Notice title="독서실에 남아요">
        {`${DELETE_KEPT[role]} 독서실 운영 기록이라 이용이 끝난 뒤 3년 동안 보관해요. 그 전에 지우려면 고객센터(${SUPPORT_TEL}, ${SUPPORT_EMAIL})로 요청해 주세요.`}
      </Notice>
      <PasswordField
        label="비밀번호"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        errorMessage={error}
      />
    </BottomSheet>
  );

  return { start: () => void start(), sheet };
}

// ─── 예전 메뉴 화면용 묶음 ───────────────────────────────────────────

/** 비밀번호 변경·계정 삭제 행 묶음 (흰 카드). 새 화면은 /account 로 연결하는 것을 권장. */
export function AccountSecurity() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const del = useDeleteAccount();
  return (
    <Section title="계정 보안" flush>
      <ListRow
        leading={<IconTile icon={KeyRound} size={40} />}
        title="비밀번호 변경"
        onPress={() => setPasswordOpen(true)}
      />
      <ListRow
        leading={<IconTile icon={UserX} tone="bad" size={40} />}
        title={
          <Text variant="t5-medium" color="critical">
            계정 삭제
          </Text>
        }
        onPress={del.start}
      />
      <PasswordChangeSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {del.sheet}
    </Section>
  );
}

import { Redirect, useLocalSearchParams } from 'expo-router';
import {
  BriefcaseBusiness,
  CircleAlert,
  GraduationCap,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PasswordField } from '@/components/account-security';
import {
  Badge,
  BottomCTA,
  Button,
  IconTile,
  Notice,
  Press,
  Segmented,
  Text,
  TextField,
  color,
  radius,
  space,
  toast,
} from '@/design';
import {
  INVITE_TYPE_LABEL,
  INVITE_TYPE_TONE,
  extractInviteToken,
  fetchInvitation,
  roleHome,
  type InviteType,
  type MobileInvitation,
} from '@/lib/api/auth';
import { API_BASE_URL, authClient } from '@/lib/auth-client';
import { formatKoreanDateTime } from '@/lib/format';
import { authenticatedFetch, useSession } from '@/lib/session';

type Mode = 'sign-in' | 'invite';

type InviteCheck =
  | { token: string; state: 'checking' }
  | { token: string; state: 'ok'; invitation: MobileInvitation }
  | { token: string; state: 'error'; message: string };

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

const CONTENT_WIDTH = 420;
const SESSION_WAIT_MS = 10_000;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RULE = '영문·숫자·점(.)·밑줄(_)·하이픈(-)으로 4~30자';

const TYPE_ICON: Record<InviteType, LucideIcon> = {
  STUDENT: GraduationCap,
  STAFF: BriefcaseBusiness,
  PARENT: HeartHandshake,
};

const hasHangul = (value: string | undefined): value is string => !!value && /[가-힣]/.test(value);

function signInErrorMessage(error: NonNullable<AuthErrorLike>) {
  if (error.status === 429) return '로그인 시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.';
  if (error.code === 'EMAIL_NOT_VERIFIED') return '이메일 인증이 필요해요. 메일함을 확인해 주세요.';
  if (error.status === 401 || error.status === 400 || error.code?.startsWith('INVALID_')) {
    return '아이디 또는 비밀번호가 맞지 않아요.';
  }
  return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** 로그인 · 초대 가입 (학생·직원·학부모 공통) */
export default function AuthScreen() {
  const { session, status, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ invite?: string }>();
  const paramInvite = typeof params.invite === 'string' ? params.invite.trim() : '';

  const [mode, setMode] = useState<Mode>('sign-in');
  const [footerH, setFooterH] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingSession, setAwaitingSession] = useState(false);
  const busy = useRef(false);
  const authStarted = useRef(false);

  // 로그인
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);

  // 초대 가입
  const [inviteValue, setInviteValue] = useState('');
  const [check, setCheck] = useState<InviteCheck | null>(null);
  const [appliedInvite, setAppliedInvite] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [again, setAgain] = useState('');
  const [touched, setTouched] = useState({ username: false, email: false, password: false, again: false });
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; email?: string; password?: string }>({});

  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const againRef = useRef<TextInput>(null);

  // 딥링크(studyroom://invite?token=… · https://…/sign-up?token=…)로 들어온 초대 토큰 반영
  if (paramInvite && paramInvite !== appliedInvite) {
    const token = extractInviteToken(paramInvite) || paramInvite;
    setAppliedInvite(paramInvite);
    setMode('invite');
    setError(null);
    setInviteValue(token);
    setCheck({ token, state: 'checking' });
  }

  // 초대 확인
  useEffect(() => {
    if (check?.state !== 'checking') return;
    let cancelled = false;
    const token = check.token;
    fetchInvitation(token)
      .then((invitation) => {
        if (cancelled) return;
        setCheck({ token, state: 'ok', invitation });
        setEmail(invitation.email ?? '');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setCheck({
          token,
          state: 'error',
          message: caught instanceof Error ? caught.message : '초대 정보를 확인하지 못했어요.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

  // 로그인은 됐는데 세션 정보가 오래 안 오면 다시 시도하게 한다
  useEffect(() => {
    if (!awaitingSession) return;
    const timer = setTimeout(() => {
      setAwaitingSession(false);
      setError('로그인 정보를 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    }, SESSION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingSession]);

  // 이미 로그인된 상태에서 초대 링크를 연 경우 안내
  useEffect(() => {
    if (status === 'authenticated' && paramInvite && !authStarted.current) {
      toast('이미 로그인돼 있어요. 초대받은 계정으로 가입하려면 먼저 로그아웃해 주세요.');
    }
  }, [status, paramInvite]);

  if (status === 'authenticated' && session) {
    return <Redirect href={roleHome(session.role)} />;
  }

  const invitation = check?.state === 'ok' ? check.invitation : null;
  const checking = check?.state === 'checking';
  const busyNow = submitting || awaitingSession;

  // ─── 공통: 가입·로그인 뒤 계정 연결 확인 ─────────────────────────────

  /** 인증 직후 학생·직원·학부모 연결을 확인하고, 세션이 반영되면 위 Redirect 가 역할 홈으로 보낸다 */
  async function confirmLinkedAccount() {
    const response = await authenticatedFetch('/api/mobile/v1/auth/me', { cache: 'no-store' });
    if (response.ok) {
      setAwaitingSession(true);
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    await signOut().catch(() => undefined);
    setError(
      body?.error === '비활성 계정입니다'
        ? '이용이 중지된 계정이에요. 독서실에 문의해 주세요.'
        : '연결된 학생·직원·학부모 정보를 찾지 못했어요. 독서실에 문의해 주세요.',
    );
  }

  // ─── 로그인 ─────────────────────────────────────────────────────────

  async function signIn() {
    const id = identifier.trim();
    if (!id || !password || busy.current) return;
    busy.current = true;
    authStarted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = id.includes('@')
        ? await authClient.signIn.email({ email: id.toLowerCase(), password, rememberMe: true })
        : await authClient.signIn.username({ username: id, password, rememberMe: true });
      const authError = result.error as AuthErrorLike;
      if (authError) {
        setError(signInErrorMessage(authError));
        return;
      }
      await confirmLinkedAccount();
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const openForgotPassword = () => {
    void Linking.openURL(`${API_BASE_URL}/forgot-password`).catch(() =>
      toast('브라우저를 열지 못했어요', 'error'),
    );
  };

  // ─── 초대 가입 ──────────────────────────────────────────────────────

  const resetSignUp = () => {
    setUsername('');
    setEmail('');
    setNewPassword('');
    setAgain('');
    setTouched({ username: false, email: false, password: false, again: false });
    setFieldErrors({});
  };

  const onInviteChange = (value: string) => {
    const pasted = value.length - inviteValue.length > 8;
    setInviteValue(value);
    setError(null);
    const token = extractInviteToken(value);
    // 링크를 붙여 넣으면 바로 확인
    if (pasted && token) setCheck({ token, state: 'checking' });
    else if (check) setCheck(null);
  };

  const verifyInvite = () => {
    const token = extractInviteToken(inviteValue);
    if (!token) {
      setCheck({ token: '', state: 'error', message: '초대 링크나 코드를 다시 확인해 주세요.' });
      return;
    }
    setError(null);
    setCheck({ token, state: 'checking' });
  };

  const changeInvite = () => {
    setCheck(null);
    setInviteValue('');
    setError(null);
    resetSignUp();
  };

  const isStaffInvite = invitation?.type === 'STAFF';
  const usernameError =
    fieldErrors.username ??
    (touched.username && username.length > 0 && !USERNAME_PATTERN.test(username.trim())
      ? `${USERNAME_RULE}로 입력해 주세요`
      : null);
  const emailError =
    fieldErrors.email ??
    (!isStaffInvite && touched.email && email.length > 0 && !EMAIL_PATTERN.test(email.trim())
      ? '이메일 주소를 확인해 주세요'
      : null);
  const passwordError =
    fieldErrors.password ??
    (touched.password && newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH
      ? `${PASSWORD_MIN_LENGTH}자 이상 입력해 주세요`
      : null);
  const againError =
    touched.again && again.length > 0 && again !== newPassword ? '비밀번호가 서로 달라요' : null;
  const canSignUp =
    !!invitation &&
    USERNAME_PATTERN.test(username.trim()) &&
    (isStaffInvite || EMAIL_PATTERN.test(email.trim())) &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    again === newPassword;

  async function signUp() {
    setTouched({ username: true, email: true, password: true, again: true });
    if (!invitation || !check || !canSignUp || busy.current) return;
    busy.current = true;
    authStarted.current = true;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const id = username.trim();
    try {
      const result = await authClient.signUp.email(
        {
          email: (isStaffInvite ? (invitation.email ?? email) : email).trim().toLowerCase(),
          name: invitation.name,
          password: newPassword,
          username: id,
          displayUsername: id,
        },
        { headers: { 'x-studyroom-invite': check.token } },
      );
      const authError = result.error as AuthErrorLike;
      if (authError) {
        const code = authError.code ?? '';
        if (code.startsWith('USERNAME_IS_ALREADY_TAKEN')) {
          setFieldErrors({ username: '이미 쓰고 있는 아이디예요. 다른 아이디를 입력해 주세요' });
        } else if (code === 'USERNAME_TOO_SHORT' || code === 'USERNAME_TOO_LONG' || code === 'INVALID_USERNAME') {
          setFieldErrors({ username: `${USERNAME_RULE}로 입력해 주세요` });
        } else if (code.startsWith('USER_ALREADY_EXISTS')) {
          if (isStaffInvite) setError('이미 가입된 직원 계정이에요. 로그인 탭에서 로그인해 주세요.');
          else setFieldErrors({ email: '이미 가입된 이메일이에요. 다른 이메일을 입력해 주세요' });
        } else if (code === 'INVALID_EMAIL') {
          setFieldErrors({ email: '이메일 주소를 확인해 주세요' });
        } else if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
          setFieldErrors({ password: `${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자로 입력해 주세요` });
        } else if (authError.status === 429) {
          setError('시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.');
        } else if (authError.status === 403) {
          setError('초대가 만료됐거나 이미 사용됐어요. 독서실에 새 초대 링크를 요청해 주세요.');
        } else {
          setError(hasHangul(authError.message) ? authError.message : '계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
        return;
      }
      await confirmLinkedAccount();
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  /** 아래쪽 입력칸에 커서가 가면 키보드 위로 보이게 스크롤 */
  const reveal = (input: TextInput | null) => {
    const content = contentRef.current;
    if (!input || !content) return;
    setTimeout(() => {
      input.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - space.x16 - space.x8), animated: true }),
        () => undefined,
      );
    }, 250);
  };

  // ─── CTA ────────────────────────────────────────────────────────────

  let cta: { label: string; onPress: () => void; disabled: boolean; loading: boolean };
  if (mode === 'sign-in') {
    cta = {
      label: '로그인',
      onPress: () => void signIn(),
      disabled: !identifier.trim() || !password,
      loading: busyNow,
    };
  } else if (!invitation) {
    cta = {
      label: '초대 확인',
      onPress: verifyInvite,
      disabled: !inviteValue.trim(),
      loading: checking,
    };
  } else {
    cta = {
      label: '가입하고 시작하기',
      onPress: () => void signUp(),
      disabled: !canSignUp,
      loading: busyNow,
    };
  }

  return (
    <View style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + space.x12,
            paddingHorizontal: space.x6,
            paddingBottom: footerH + space.x6,
          }}>
          <View ref={contentRef} style={s.content}>
            <View style={s.brand}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={s.logo}
                accessibilityIgnoresInvertColors
              />
              <Text variant="t12-bold" accessibilityRole="header" style={{ marginTop: space.x5 }}>
                강한선배
              </Text>
              <Text variant="t5-regular" color="neutralMuted">
                엄격한 관리가 성적을 만듭니다
              </Text>
            </View>

            <Segmented<Mode>
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
              disabled={busyNow}
              options={[
                { value: 'sign-in', label: '로그인' },
                { value: 'invite', label: '초대받았어요' },
              ]}
              style={{ marginTop: space.x8 }}
            />

            {mode === 'sign-in' ? (
              <View style={s.form}>
                <TextField
                  label="아이디 또는 이메일"
                  accessibilityLabel="아이디 또는 이메일"
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    setError(null);
                  }}
                  placeholder="아이디 또는 이메일"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!busyNow}
                />
                <PasswordField
                  ref={passwordRef}
                  label="비밀번호"
                  accessibilityLabel="비밀번호"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError(null);
                  }}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void signIn()}
                  editable={!busyNow}
                />
                {error != null && (
                  <Notice tone="bad" icon={CircleAlert}>
                    {error}
                  </Notice>
                )}
                <Press
                  onPress={openForgotPassword}
                  scale={0}
                  pressedBg
                  accessibilityRole="link"
                  style={s.textLink}>
                  <Text variant="t4-medium" color="neutralSubtle">
                    비밀번호를 잊었어요
                  </Text>
                </Press>
              </View>
            ) : !invitation ? (
              <View style={s.form}>
                <Text variant="t4-regular" color="neutralMuted">
                  독서실에서 받은 초대 링크를 눌러 앱을 열거나, 링크를 복사해 아래에 붙여 넣어 주세요.
                </Text>
                <TextField
                  label="초대 링크 또는 코드"
                  accessibilityLabel="초대 링크 또는 코드"
                  value={inviteValue}
                  onChangeText={onInviteChange}
                  placeholder="https://… 또는 초대 코드"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="go"
                  onSubmitEditing={verifyInvite}
                  errorMessage={check?.state === 'error' ? check.message : null}
                  editable={!checking}
                />
                {error != null && (
                  <Notice tone="bad" icon={CircleAlert}>
                    {error}
                  </Notice>
                )}
              </View>
            ) : (
              <View style={s.form}>
                <InvitationCard invitation={invitation} onChange={busyNow ? undefined : changeInvite} />
                <TextField
                  ref={usernameRef}
                  label="로그인 아이디"
                  accessibilityLabel="로그인 아이디"
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    setFieldErrors((e) => ({ ...e, username: undefined }));
                  }}
                  onFocus={() => reveal(usernameRef.current)}
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                  placeholder="예: minjun_kim"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="username-new"
                  textContentType="username"
                  maxLength={30}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => (isStaffInvite ? newPasswordRef : emailRef).current?.focus()}
                  description={USERNAME_RULE}
                  errorMessage={usernameError}
                  editable={!busyNow}
                />
                <TextField
                  ref={emailRef}
                  label={isStaffInvite ? '이메일' : '복구 이메일'}
                  accessibilityLabel={isStaffInvite ? '이메일' : '복구 이메일'}
                  value={isStaffInvite ? (invitation.email ?? email) : email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setFieldErrors((e) => ({ ...e, email: undefined }));
                  }}
                  onFocus={() => reveal(emailRef.current)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => newPasswordRef.current?.focus()}
                  editable={!isStaffInvite && !busyNow}
                  description={
                    isStaffInvite
                      ? '직원 계정은 등록된 이메일로 가입돼요'
                      : '비밀번호를 잊었을 때 이 주소로 재설정 메일을 보내 드려요'
                  }
                  errorMessage={emailError}
                />
                <PasswordField
                  ref={newPasswordRef}
                  label="비밀번호"
                  accessibilityLabel="새 비밀번호"
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    setFieldErrors((e) => ({ ...e, password: undefined }));
                  }}
                  onFocus={() => reveal(newPasswordRef.current)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => againRef.current?.focus()}
                  description={`${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요`}
                  errorMessage={passwordError}
                  editable={!busyNow}
                />
                <PasswordField
                  ref={againRef}
                  label="비밀번호 확인"
                  accessibilityLabel="비밀번호 확인"
                  value={again}
                  onChangeText={(v) => {
                    setAgain(v);
                    if (v.length >= newPassword.length) setTouched((t) => ({ ...t, again: true }));
                  }}
                  onFocus={() => reveal(againRef.current)}
                  onBlur={() => setTouched((t) => ({ ...t, again: true }))}
                  placeholder="비밀번호를 한 번 더 입력"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={() => void signUp()}
                  errorMessage={againError}
                  editable={!busyNow}
                />
                {error != null && (
                  <Notice tone="bad" icon={CircleAlert}>
                    {error}
                  </Notice>
                )}
              </View>
            )}
          </View>
        </ScrollView>
        <BottomCTA background={color.bg.layerDefault} onHeight={setFooterH} maxWidth={CONTENT_WIDTH}>
          <Button
            size="xl"
            block
            onPress={cta.onPress}
            loading={cta.loading}
            disabled={cta.disabled}>
            {cta.label}
          </Button>
        </BottomCTA>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── 초대 정보 카드 ─────────────────────────────────────────────────

function InvitationCard({
  invitation,
  onChange,
}: {
  invitation: MobileInvitation;
  onChange?: () => void;
}) {
  const inviter = invitation.inviterName
    ? `${invitation.inviterName}${invitation.inviterRole ? ` ${invitation.inviterRole}` : ''}님이 보낸 초대예요`
    : null;
  const children = invitation.children ?? [];
  return (
    <View style={s.card} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <IconTile icon={TYPE_ICON[invitation.type]} tone={INVITE_TYPE_TONE[invitation.type]} size={48} round />
        <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
          <Badge tone={INVITE_TYPE_TONE[invitation.type]}>{`${INVITE_TYPE_LABEL[invitation.type]} 계정`}</Badge>
          <Text variant="t6-bold">{invitation.name}님, 반가워요</Text>
        </View>
      </View>
      <View style={{ gap: space.x1 }}>
        {inviter != null && (
          <Text variant="t4-regular" color="neutralMuted">
            {inviter}
          </Text>
        )}
        {invitation.type === 'PARENT' && children.length > 0 && (
          <Text variant="t4-regular" color="neutralMuted">
            연결될 자녀 · <Text variant="t4-bold">{children.join(', ')}</Text>
            {invitation.relation ? ` (${invitation.relation})` : ''}
          </Text>
        )}
        <Text variant="t3-regular" color="neutralSubtle">
          {formatKoreanDateTime(invitation.expiresAt)}까지 가입할 수 있어요
        </Text>
      </View>
      {onChange && (
        <Press onPress={onChange} scale={0} pressedBg accessibilityRole="button" style={s.cardLink}>
          <Text variant="t4-medium" color="neutralSubtle">
            다른 초대로 바꾸기
          </Text>
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg.layerDefault },
  content: { width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center' },
  brand: { gap: space.x1 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.r4,
    borderWidth: 1,
    borderColor: color.stroke.neutralSubtle,
  },
  form: { gap: space.x5, marginTop: space.x6 },
  textLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.x3,
    borderRadius: radius.r2,
  },
  card: {
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
  },
  cardLink: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    marginLeft: -space.x2,
    paddingHorizontal: space.x2,
    borderRadius: radius.r2,
  },
});

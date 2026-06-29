import { Redirect, router } from 'expo-router';
import { KeyRound, LogIn } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { API_BASE_URL, authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session';

type AuthMode = 'sign-in' | 'activate';
type Invitation = {
  email: string | null;
  expiresAt: string;
  name: string;
  type: 'STAFF' | 'STUDENT';
};

function extractToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes('://')) return trimmed;

  try {
    return new URL(trimmed).searchParams.get('token') ?? '';
  } catch {
    return '';
  }
}

export default function AuthScreen() {
  const { refreshProfile, session, status } = useSession();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [identifier, setIdentifier] = useState('');
  const [inviteValue, setInviteValue] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inviteToken = useMemo(() => extractToken(inviteValue), [inviteValue]);

  if (status === 'authenticated' && session) {
    return <Redirect href={session.role === 'student' ? '/(student)' : '/(staff)'} />;
  }

  async function finishAuthentication() {
    const profile = await refreshProfile();
    if (!profile) {
      throw new Error('연결된 학생 또는 직원 정보를 찾을 수 없습니다');
    }
    router.replace(profile.role === 'student' ? '/(student)' : '/(staff)');
  }

  async function signIn() {
    setError('');
    setSubmitting(true);
    try {
      const normalized = identifier.trim();
      const result = normalized.includes('@')
        ? await authClient.signIn.email({
            email: normalized.toLowerCase(),
            password,
            rememberMe: true,
          })
        : await authClient.signIn.username({
            username: normalized,
            password,
            rememberMe: true,
          });

      if (result.error) {
        setError('아이디 또는 비밀번호를 확인하세요.');
        return;
      }
      await finishAuthentication();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '로그인하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyInvitation() {
    setError('');
    if (!inviteToken) {
      setError('초대 링크 또는 초대 코드를 입력하세요.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/mobile/v1/auth/invitation?token=${encodeURIComponent(inviteToken)}`,
      );
      if (!response.ok) {
        setInvitation(null);
        setError('유효하지 않거나 만료된 초대입니다.');
        return;
      }

      const nextInvitation = (await response.json()) as Invitation;
      setInvitation(nextInvitation);
      setEmail(nextInvitation.email ?? '');
    } catch {
      setError('초대 정보를 확인하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function activate() {
    if (!invitation) {
      await verifyInvitation();
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const result = await authClient.signUp.email(
        {
          email: email.trim().toLowerCase(),
          name: invitation.name,
          password,
          username: identifier.trim(),
          displayUsername: identifier.trim(),
        },
        {
          headers: {
            'x-studyroom-invite': inviteToken,
          },
        },
      );

      if (result.error) {
        setError(result.error.message || '계정을 만들지 못했습니다.');
        return;
      }
      await finishAuthentication();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정을 만들지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/khsb-wordmark.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>강한선배</Text>
          <Text style={styles.brandCaption}>학생 관리와 시설 운영을 한곳에서</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.segmented}>
            <ModeButton
              active={mode === 'sign-in'}
              icon={LogIn}
              label="로그인"
              onPress={() => {
                setMode('sign-in');
                setError('');
              }}
            />
            <ModeButton
              active={mode === 'activate'}
              icon={KeyRound}
              label="초대 가입"
              onPress={() => {
                setMode('activate');
                setError('');
              }}
            />
          </View>

          {mode === 'activate' ? (
            <View style={styles.form}>
              <Field
                label="초대 링크 또는 코드"
                onChangeText={(value) => {
                  setInviteValue(value);
                  setInvitation(null);
                }}
                placeholder="관리자에게 받은 링크"
                value={inviteValue}
              />
              {invitation ? (
                <>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteName}>{invitation.name}</Text>
                    <Text style={styles.inviteType}>
                      {invitation.type === 'STAFF' ? '직원 계정' : '학생 계정'}
                    </Text>
                  </View>
                  <Field
                    autoCapitalize="none"
                    label="로그인 아이디"
                    onChangeText={setIdentifier}
                    placeholder="영문·숫자 4~30자"
                    value={identifier}
                  />
                  <Field
                    autoCapitalize="none"
                    editable={invitation.type === 'STUDENT'}
                    keyboardType="email-address"
                    label="복구 이메일"
                    onChangeText={setEmail}
                    placeholder="name@example.com"
                    value={email}
                  />
                  <Field
                    label="비밀번호"
                    onChangeText={setPassword}
                    placeholder="10자 이상"
                    secureTextEntry
                    value={password}
                  />
                  <Field
                    label="비밀번호 확인"
                    onChangeText={setConfirmPassword}
                    placeholder="비밀번호 다시 입력"
                    secureTextEntry
                    value={confirmPassword}
                  />
                </>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton disabled={submitting} onPress={activate}>
                {submitting
                  ? '처리 중...'
                  : invitation
                    ? '가입 완료'
                    : '초대 확인'}
              </PrimaryButton>
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                autoCapitalize="none"
                label="아이디 또는 이메일"
                onChangeText={setIdentifier}
                placeholder="로그인 아이디"
                value={identifier}
              />
              <Field
                label="비밀번호"
                onChangeText={setPassword}
                placeholder="비밀번호"
                secureTextEntry
                value={password}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton disabled={submitting} onPress={signIn}>
                {submitting ? '로그인 중...' : '로그인'}
              </PrimaryButton>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9AA49F"
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: typeof LogIn;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}>
      <Icon color={active ? colors.primary : colors.muted} size={18} />
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandLogo: {
    height: 64,
    width: 200,
  },
  brandName: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '900',
  },
  brandCaption: {
    color: colors.muted,
    fontSize: 14,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  segmented: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 42,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
  },
  modeLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: colors.primary,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  inviteInfo: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    gap: 3,
    padding: spacing.md,
  },
  inviteName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  inviteType: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 18,
  },
});

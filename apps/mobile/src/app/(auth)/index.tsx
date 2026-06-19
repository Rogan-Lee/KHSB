import { Redirect, router } from 'expo-router';
import { BriefcaseBusiness, GraduationCap, LockKeyhole, LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
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
import { AppRole, useSession } from '@/lib/session';

export default function SignInScreen() {
  const { session, startDemoSession, status } = useSession();
  const [role, setRole] = useState<AppRole>('student');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && session) {
    return <Redirect href={session.role === 'student' ? '/(student)' : '/(staff)'} />;
  }

  const submit = async () => {
    setSubmitting(true);
    try {
      await startDemoSession(role, name);
      router.replace(role === 'student' ? '/(student)' : '/(staff)');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <LockKeyhole color={colors.surface} size={28} />
          </View>
          <Text style={styles.brandName}>스터디룸 매니저</Text>
          <Text style={styles.brandCaption}>학생 관리와 시설 운영을 한곳에서</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>로그인 유형</Text>
          <View style={styles.roleSelector}>
            <RoleButton
              active={role === 'student'}
              icon={GraduationCap}
              label="학생"
              onPress={() => setRole('student')}
            />
            <RoleButton
              active={role === 'staff'}
              icon={BriefcaseBusiness}
              label="관리자"
              onPress={() => setRole('staff')}
            />
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setName}
              placeholder={role === 'student' ? '학생 이름' : '관리자 이름'}
              placeholderTextColor="#9AA49F"
              style={styles.input}
              value={name}
            />
            <PrimaryButton disabled={submitting} onPress={submit}>
              {submitting ? '로그인 중...' : role === 'student' ? '학생으로 시작' : '관리자로 시작'}
            </PrimaryButton>
          </View>

          <Text style={styles.devNotice}>
            개발 브랜치에서는 데모 세션으로 실행됩니다. 운영 인증은 모바일 API 단계에서 연결합니다.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleButton({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.roleButton, active && styles.roleButtonActive]}>
      <Icon color={active ? colors.primary : colors.muted} size={22} />
      <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>{label}</Text>
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
    marginBottom: spacing.xxl,
  },
  brandIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56,
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
  panelTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleButton: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minHeight: 78,
    justifyContent: 'center',
  },
  roleButtonActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  roleLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  roleLabelActive: {
    color: colors.primary,
  },
  form: {
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
  devNotice: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});

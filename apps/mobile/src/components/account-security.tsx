import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session';

export function AccountSecurity() {
  const { signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function changePassword() {
    setMessage('');
    if (newPassword.length < 10) {
      setMessage('새 비밀번호는 10자 이상이어야 합니다.');
      return;
    }

    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setMessage('현재 비밀번호를 확인하세요.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setMessage('비밀번호를 변경했습니다.');
    } catch {
      setMessage('비밀번호를 변경하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  function confirmDelete() {
    if (!currentPassword) {
      setMessage('계정 삭제를 위해 현재 비밀번호를 입력하세요.');
      return;
    }

    Alert.alert(
      '로그인 계정 삭제',
      '로그인 계정과 모든 기기 세션이 삭제됩니다. 학습·출결 기록은 보존됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계정 삭제',
          style: 'destructive',
          onPress: async () => {
            setPending(true);
            try {
              const result = await authClient.deleteUser({
                password: currentPassword,
              });
              if (result.error) {
                setMessage('현재 비밀번호를 확인하세요.');
                return;
              }
              await signOut();
              router.replace('/(auth)');
            } catch {
              setMessage('계정을 삭제하지 못했습니다.');
            } finally {
              setPending(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>계정 보안</Text>
      <TextInput
        autoComplete="current-password"
        onChangeText={setCurrentPassword}
        placeholder="현재 비밀번호"
        placeholderTextColor="#9AA49F"
        secureTextEntry
        style={styles.input}
        value={currentPassword}
      />
      <TextInput
        autoComplete="new-password"
        onChangeText={setNewPassword}
        placeholder="새 비밀번호 10자 이상"
        placeholderTextColor="#9AA49F"
        secureTextEntry
        style={styles.input}
        value={newPassword}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <PrimaryButton disabled={pending} onPress={changePassword} variant="secondary">
        비밀번호 변경
      </PrimaryButton>
      <PrimaryButton disabled={pending} onPress={confirmDelete} variant="danger">
        로그인 계정 삭제
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  input: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  message: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});

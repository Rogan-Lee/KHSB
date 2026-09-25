import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** 딥링크 studyroom://invite?token=… — 초대 가입 화면으로 토큰을 넘긴다. */
export default function InviteLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return (
    <Redirect
      href={{ pathname: '/(auth)', params: token ? { invite: String(token) } : {} } as Href}
    />
  );
}

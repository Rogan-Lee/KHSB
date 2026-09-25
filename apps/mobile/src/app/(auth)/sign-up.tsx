import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** 웹 초대 링크 https://…/sign-up?token=… 로 앱이 열렸을 때 — 초대 가입 화면으로 토큰을 넘긴다. */
export default function SignUpLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return (
    <Redirect
      href={{ pathname: '/(auth)', params: token ? { invite: String(token) } : {} } as Href}
    />
  );
}

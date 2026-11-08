"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // 브라우저는 지금 연 주소로 보낸다. admin 도메인으로 고정하면 khsb.vercel.app(앱의 "비밀번호 찾기"가 여는 주소)에서
  // 교차 출처 요청이 CORS 에 막혀 POST 가 아예 나가지 않는다.
  baseURL:
    typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL,
  plugins: [usernameClient()],
});

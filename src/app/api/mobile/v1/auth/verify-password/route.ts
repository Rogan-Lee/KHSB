import { NextRequest } from "next/server";

import { authServer } from "@/lib/auth-server";
import {
  clientIpFrom,
  completeLoginAttempt,
  LOGIN_LOCKED_MESSAGE,
  reserveLoginAttempt,
} from "@/lib/login-guard";

// 로그인 비밀번호가 맞는지만 확인한다 — 학생 앱 집중 모드의 "잠금 비밀번호를 잊었어요" 초기화용.
// 맞다/틀리다만 돌려주고 집중 모드에 관한 것은 아무것도 받거나 남기지 않는다
// (스크린 타임 약관: 기기 사용 정보를 기기 밖으로 보내지 않는다. 잠금 비밀번호 자체도 기기 안에만 있다).
// better-auth 의 verify-password 는 서버 전용이라 여기서 감싼다. 이 경로는 better-auth 의 IP 제한을 거치지 않으므로
// 로그인과 같은 계정 단위 실패 제한(login-guard)을 별도 키로 건다.
export async function POST(request: NextRequest) {
  const session = await authServer.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return Response.json({ error: "비밀번호를 입력해 주세요" }, { status: 400 });

  const key = `verify-password:${session.user.id}`;
  const attempt = await reserveLoginAttempt(key, clientIpFrom(request.headers));
  if (attempt.locked) return Response.json({ error: LOGIN_LOCKED_MESSAGE }, { status: 429 });

  const ok = await authServer.api
    .verifyPassword({ headers: request.headers, body: { password } })
    .then(
      () => true,
      () => false,
    );
  await completeLoginAttempt(key, ok);
  if (!ok) return Response.json({ error: "비밀번호가 맞지 않아요" }, { status: 400 });
  return Response.json({ ok: true });
}

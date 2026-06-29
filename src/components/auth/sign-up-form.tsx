"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type PublicInvitation = {
  email: string | null;
  expiresAt: string;
  name: string;
  type: "STAFF" | "STUDENT";
};

export function SignUpForm({
  invitation,
  token,
}: {
  invitation: PublicInvitation | null;
  token: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);

  if (!invitation) {
    return (
      <AuthShell
        title="사용할 수 없는 초대"
        description="초대가 만료되었거나 이미 사용되었습니다. 관리자에게 새 링크를 요청하세요.">
        <Button asChild className="w-full" variant="outline">
          <Link href="/sign-in">로그인으로 돌아가기</Link>
        </Button>
      </AuthShell>
    );
  }
  const activeInvitation = invitation;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signUp.email(
        {
          email: email.trim().toLowerCase(),
          name: activeInvitation.name,
          password,
          username: username.trim(),
          displayUsername: username.trim(),
        },
        {
          headers: {
            "x-studyroom-invite": token,
          },
        },
      );

      if (result.error) {
        toast.error(result.error.message || "계정을 만들지 못했습니다");
        return;
      }

      router.replace(activeInvitation.type === "STAFF" ? "/" : "/student");
      router.refresh();
    } catch {
      toast.error("계정 생성 중 오류가 발생했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title={`${invitation.name}님 계정 만들기`}
      description={
        invitation.type === "STAFF"
          ? "직원용 로그인 아이디와 비밀번호를 설정하세요."
          : "학생 앱에서 사용할 아이디와 복구 이메일을 설정하세요."
      }>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="username">로그인 아이디</Label>
          <Input
            id="username"
            autoCapitalize="none"
            autoComplete="username"
            pattern="[a-zA-Z0-9._-]{4,30}"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <p className="text-xs text-ink-4">
            영문, 숫자, 점, 밑줄, 하이픈으로 4~30자
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">복구 이메일</Label>
          <Input
            id="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={invitation.type === "STAFF"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="text-xs text-ink-4">10자 이상 입력하세요</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">비밀번호 확인</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "계정 생성 중..." : "가입 완료"}
        </Button>
      </form>
    </AuthShell>
  );
}

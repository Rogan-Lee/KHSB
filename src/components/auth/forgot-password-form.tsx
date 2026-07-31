"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: "/reset-password",
      });
      setSent(true);
      toast.success("계정이 존재하면 재설정 메일이 발송됩니다");
    } catch {
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="비밀번호 재설정"
      description="가입할 때 등록한 복구 이메일로 재설정 링크를 보냅니다.">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink-2">
            계정이 존재하면 재설정 메일이 발송됩니다. 메일함과 스팸함을 확인하세요.
          </p>
          <Button asChild className="w-full" variant="outline">
            <Link href="/sign-in">로그인으로 돌아가기</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">복구 이메일</Label>
            <Input
              id="email"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? "요청 중..." : "재설정 링크 받기"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

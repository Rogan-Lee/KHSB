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

type MeResponse = {
  accountType: "STAFF" | "STUDENT";
};

export function SignInForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const normalized = identifier.trim();
      const result = normalized.includes("@")
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
        toast.error("아이디 또는 비밀번호를 확인하세요");
        return;
      }

      const response = await fetch("/api/mobile/v1/auth/me", {
        cache: "no-store",
      });
      if (!response.ok) {
        await authClient.signOut();
        toast.error("연결된 직원 또는 학생 정보를 찾을 수 없습니다");
        return;
      }

      const me = (await response.json()) as MeResponse;
      router.replace(me.accountType === "STAFF" ? "/" : "/student");
      router.refresh();
    } catch {
      toast.error("로그인 중 오류가 발생했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="로그인"
      description="관리자에게 받은 계정으로 로그인하세요.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="identifier">아이디 또는 이메일</Label>
          <Input
            id="identifier"
            autoCapitalize="none"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "로그인 중..." : "로그인"}
        </Button>
        <div className="flex items-center justify-between text-xs">
          <Link className="text-ink-3 hover:text-ink" href="/forgot-password">
            비밀번호 재설정
          </Link>
          <span className="text-ink-4">가입은 초대 링크에서만 가능합니다</span>
        </div>
      </form>
    </AuthShell>
  );
}

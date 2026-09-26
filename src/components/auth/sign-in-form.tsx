"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { AuthShell, authInputClass, authLinkClass } from "@/components/auth/auth-shell";
import { FormField, Notice } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type MeResponse = {
  accountType: "STAFF" | "STUDENT";
};

export function SignInForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  // 화면 안 오류 표시 (토스트와 같은 문구)
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

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
        // 429: IP 단위 요청 제한 또는 계정 단위 로그인 잠금 (src/lib/login-guard.ts)
        const message =
          result.error.status === 429
            ? "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요."
            : "아이디 또는 비밀번호를 확인하세요";
        toast.error(message);
        setError(message);
        return;
      }

      const response = await fetch("/api/mobile/v1/auth/me", {
        cache: "no-store",
      });
      if (!response.ok) {
        await authClient.signOut();
        toast.error("연결된 직원 또는 학생 정보를 찾을 수 없습니다");
        setError("연결된 직원 또는 학생 정보를 찾을 수 없습니다");
        return;
      }

      const me = (await response.json()) as MeResponse;
      router.replace(me.accountType === "STAFF" ? "/" : "/student");
      router.refresh();
    } catch {
      toast.error("로그인 중 오류가 발생했습니다");
      setError("로그인 중 오류가 발생했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="로그인"
      description="관리자에게 받은 계정으로 로그인하세요."
      footer={
        <>
          <Link className={authLinkClass} href="/forgot-password">
            비밀번호 재설정
          </Link>
          <p className="t3-regular text-fg-neutral-subtle">가입은 초대 링크로만 할 수 있어요</p>
        </>
      }>
      <form className="flex flex-col gap-x5" onSubmit={submit}>
        <FormField label="아이디 또는 이메일" htmlFor="identifier">
          <Input
            id="identifier"
            autoCapitalize="none"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            aria-invalid={error ? true : undefined}
            className={authInputClass}
            required
          />
        </FormField>
        <FormField label="비밀번호" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            className={authInputClass}
            minLength={10}
            required
          />
        </FormField>
        {error && (
          <div role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <Button className="mt-x1 w-full" size="lg" type="submit" disabled={pending}>
          {pending ? "로그인 중…" : "로그인"}
        </Button>
      </form>
    </AuthShell>
  );
}

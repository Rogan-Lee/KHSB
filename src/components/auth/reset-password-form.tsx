"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { LinkIcon } from "lucide-react";

import { AuthShell, authInputClass, authLinkClass } from "@/components/auth/auth-shell";
import { FormField, Notice } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  // 화면 안 오류 표시 (토스트와 같은 문구)
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell
        icon={LinkIcon}
        iconTone="critical"
        title="잘못된 재설정 링크"
        description="재설정 토큰이 없습니다. 새 링크를 요청하세요.">
        <Button asChild className="w-full" size="lg" variant="secondary">
          <Link href="/forgot-password">새 링크 요청</Link>
        </Button>
      </AuthShell>
    );
  }

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
      setError("비밀번호가 일치하지 않습니다");
      return;
    }

    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        toast.error("만료되었거나 사용할 수 없는 링크입니다");
        setError("만료되었거나 사용할 수 없는 링크입니다");
        return;
      }
      toast.success("비밀번호가 변경되었습니다");
      router.replace("/sign-in");
    } catch {
      toast.error("비밀번호를 변경하지 못했습니다");
      setError("비밀번호를 변경하지 못했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="새 비밀번호 설정"
      description="다른 서비스에서 사용하지 않는 비밀번호를 설정하세요."
      footer={
        <Link className={authLinkClass} href="/forgot-password">
          새 링크 요청
        </Link>
      }>
      <form className="flex flex-col gap-x5" onSubmit={submit}>
        <FormField label="새 비밀번호" htmlFor="password" hint="10자 이상 입력하세요">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={authInputClass}
            required
          />
        </FormField>
        <FormField
          label="새 비밀번호 확인"
          htmlFor="confirmPassword"
          error={mismatch ? "비밀번호가 일치하지 않아요" : undefined}>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={mismatch ? true : undefined}
            className={authInputClass}
            required
          />
        </FormField>
        {error && (
          <div role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <Button className="mt-x1 w-full" size="lg" type="submit" disabled={pending}>
          {pending ? "변경 중…" : "비밀번호 변경"}
        </Button>
      </form>
    </AuthShell>
  );
}

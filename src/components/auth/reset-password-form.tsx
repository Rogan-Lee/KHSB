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

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <AuthShell
        title="잘못된 재설정 링크"
        description="재설정 토큰이 없습니다. 새 링크를 요청하세요.">
        <Button asChild className="w-full" variant="outline">
          <Link href="/forgot-password">새 링크 요청</Link>
        </Button>
      </AuthShell>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
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
        return;
      }
      toast.success("비밀번호가 변경되었습니다");
      router.replace("/sign-in");
    } catch {
      toast.error("비밀번호를 변경하지 못했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="새 비밀번호 설정"
      description="다른 서비스에서 사용하지 않는 비밀번호를 설정하세요.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="password">새 비밀번호</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
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
          {pending ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </form>
    </AuthShell>
  );
}

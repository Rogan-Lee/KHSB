"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { AuthShell, authInputClass, authLinkClass } from "@/components/auth/auth-shell";
import { FormField } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  if (sent) {
    return (
      <AuthShell
        icon={MailCheck}
        iconTone="positive"
        title="메일을 확인해 주세요"
        description={"계정이 존재하면 재설정 메일이 발송됩니다.\n메일함과 스팸함을 확인하세요."}>
        <Button asChild className="w-full" size="lg" variant="secondary">
          <Link href="/sign-in">로그인으로 돌아가기</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="비밀번호 재설정"
      description="가입할 때 등록한 복구 이메일로 재설정 링크를 보냅니다."
      footer={
        <Link className={authLinkClass} href="/sign-in">
          로그인으로 돌아가기
        </Link>
      }>
      <form className="flex flex-col gap-x5" onSubmit={submit}>
        <FormField label="복구 이메일" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authInputClass}
            required
          />
        </FormField>
        <Button className="mt-x1 w-full" size="lg" type="submit" disabled={pending}>
          {pending ? "요청 중…" : "재설정 링크 받기"}
        </Button>
      </form>
    </AuthShell>
  );
}

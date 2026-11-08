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
    // 없는 이메일도 서버는 성공을 돌려준다(계정 열거 방지). 여기서 나는 실패는 네트워크·요청 제한뿐이라 그대로 알린다.
    try {
      const { error } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: "/reset-password",
      });
      if (error) {
        toast.error(
          error.status === 429
            ? "요청이 너무 많습니다. 1분 뒤 다시 시도해 주세요"
            : "재설정 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요",
        );
        return;
      }
      setSent(true);
      toast.success("계정이 존재하면 재설정 메일이 발송됩니다");
    } catch {
      toast.error("재설정 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요");
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

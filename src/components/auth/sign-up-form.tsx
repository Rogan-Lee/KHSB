"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { LinkIcon } from "lucide-react";

import { AuthShell, authInputClass } from "@/components/auth/auth-shell";
import { FormField, Notice, StatusBadge } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import {
  SIGNUP_CONSENT_HEADER,
  formatSignupConsentHeader,
  missingSignupConsent,
  signupConsentItems,
  type SignupConsentKey,
} from "@/lib/privacy/signup-consent";
import { Checkbox } from "seed-design/ui/checkbox";

type PublicInvitation = {
  email: string | null;
  expiresAt: string;
  name: string;
  type: "STAFF" | "STUDENT" | "PARENT";
  under14: boolean;
};

const INVITE_LABEL: Record<PublicInvitation["type"], string> = {
  STAFF: "직원 계정 초대",
  STUDENT: "학생 계정 초대",
  PARENT: "학부모 계정 초대",
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
  const [agreed, setAgreed] = useState<Set<SignupConsentKey>>(() => new Set());
  // 화면 안 오류 표시 (토스트와 같은 문구)
  const [error, setError] = useState<string | null>(null);

  if (!invitation) {
    return (
      <AuthShell
        icon={LinkIcon}
        iconTone="critical"
        title="사용할 수 없는 초대"
        description={"초대가 만료되었거나 이미 사용되었어요.\n관리자에게 새 링크를 요청하세요."}>
        <Button asChild className="w-full" size="lg" variant="secondary">
          <Link href="/sign-in">로그인으로 돌아가기</Link>
        </Button>
      </AuthShell>
    );
  }
  const activeInvitation = invitation;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const consentItems = signupConsentItems(invitation.type, { under14: invitation.under14 });
  const allAgreed = consentItems.every((item) => agreed.has(item.key));

  function toggleConsent(key: SignupConsentKey, checked: boolean) {
    setAgreed((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다");
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    const missingConsent = missingSignupConsent(agreed, consentItems);
    if (missingConsent) {
      toast.error(missingConsent);
      setError(missingConsent);
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
            [SIGNUP_CONSENT_HEADER]: formatSignupConsentHeader(agreed),
          },
        },
      );

      if (result.error) {
        toast.error(result.error.message || "계정을 만들지 못했습니다");
        setError(result.error.message || "계정을 만들지 못했습니다");
        return;
      }

      if (activeInvitation.type === "PARENT") {
        toast.success("가입 완료! 모바일 앱에서 로그인하세요");
        router.replace("/sign-in");
      } else {
        router.replace(activeInvitation.type === "STAFF" ? "/" : "/student");
      }
      router.refresh();
    } catch {
      toast.error("계정 생성 중 오류가 발생했습니다");
      setError("계정 생성 중 오류가 발생했습니다");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      meta={<StatusBadge tone="brand">{INVITE_LABEL[invitation.type]}</StatusBadge>}
      title={`${invitation.name}님 계정 만들기`}
      description={
        invitation.type === "STAFF"
          ? "직원용 로그인 아이디와 비밀번호를 설정하세요."
          : invitation.type === "PARENT"
            ? "자녀 조회용 모바일 앱에서 사용할 아이디와 복구 이메일을 설정하세요."
            : "학생 앱에서 사용할 아이디와 복구 이메일을 설정하세요."
      }>
      <form className="flex flex-col gap-x5" onSubmit={submit}>
        <FormField label="로그인 아이디" htmlFor="username" required hint="영문, 숫자, 점, 밑줄, 하이픈으로 4~30자">
          <Input
            id="username"
            autoCapitalize="none"
            autoComplete="username"
            // 하이픈은 이스케이프 — 최신 브라우저는 pattern 을 v 플래그로 컴파일해 맨 끝 "-" 도 오류로 보고 무시한다
            pattern="[a-zA-Z0-9._\-]{4,30}"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={authInputClass}
            required
          />
        </FormField>
        <FormField
          label="복구 이메일"
          htmlFor="email"
          required
          hint={
            invitation.type === "STAFF"
              ? "초대받은 이메일로 정해져 있어요"
              : "비밀번호를 잊었을 때 재설정 링크를 받을 주소예요"
          }>
          <Input
            id="email"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={invitation.type === "STAFF"}
            className={authInputClass}
            required
          />
        </FormField>
        <FormField label="비밀번호" htmlFor="password" required hint="10자 이상 입력하세요">
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
          label="비밀번호 확인"
          htmlFor="confirmPassword"
          required
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
        <fieldset className="flex flex-col">
          <legend className="sr-only">약관 동의</legend>
          <Checkbox
            label="전체 동의"
            size="large"
            weight="bold"
            checked={allAgreed}
            onCheckedChange={(checked) => setAgreed(new Set(checked ? consentItems.map((item) => item.key) : []))}
            className="min-h-11 w-full items-center"
          />
          <ul className="mt-x1 flex flex-col border-t border-stroke-neutral-muted pt-x1">
            {consentItems.map((item) => (
              <li key={item.key} className="relative">
                <Checkbox
                  label={`[${item.required ? "필수" : "선택"}] ${item.label}`}
                  checked={agreed.has(item.key)}
                  onCheckedChange={(checked) => toggleConsent(item.key, checked)}
                  className="min-h-11 w-full items-center pr-x12"
                />
                {/* 요약 펼치기 — summary 는 체크 줄 오른쪽에 띄우고 내용은 그 아래로 펼친다 */}
                <details className="group">
                  <summary className="absolute right-0 top-0 flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-end t3-regular text-fg-neutral-subtle underline [&::-webkit-details-marker]:hidden">
                    <span className="sr-only">{item.label} </span>
                    <span className="group-open:hidden">보기</span>
                    <span className="hidden group-open:inline">접기</span>
                  </summary>
                  <div className="mb-x2 flex flex-col gap-x2 rounded-r3 bg-bg-layer-fill p-x4">
                    <dl className="flex flex-col gap-x2">
                      {item.rows.map((row) => (
                        <div key={row.label}>
                          <dt className="t3-medium text-fg-neutral-subtle">{row.label}</dt>
                          <dd className={row.strong ? "t3-bold text-fg-neutral underline" : "t3-regular text-fg-neutral"}>
                            {row.text}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {item.doc && (
                      <a
                        href={item.doc.url}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-11 items-center self-start t3-medium text-fg-neutral underline">
                        {item.doc.label}
                      </a>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </fieldset>
        {error && (
          <div role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <Button className="mt-x1 w-full" size="lg" type="submit" disabled={pending}>
          {pending ? "계정 만드는 중…" : "가입 완료"}
        </Button>
        <p className="text-center t3-regular text-fg-neutral-subtle tabular-nums">
          초대 링크 만료 {new Date(invitation.expiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
        </p>
      </form>
    </AuthShell>
  );
}

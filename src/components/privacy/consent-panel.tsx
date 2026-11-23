"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePaperConsent } from "@/actions/privacy";
import { EmptyState, StatusBadge } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONSENT_KIND_LABEL, GUARDIAN_CHECKS, PAPER_CONSENT_KINDS, type PaperConsentKind } from "@/lib/privacy/consent";
import { FileSignature } from "lucide-react";

export type ConsentRow = {
  id: string;
  kind: keyof typeof CONSENT_KIND_LABEL;
  agreed: boolean;
  channel: "WEB_APPLY" | "SIGN_UP" | "PAPER";
  docVersion: string;
  agreedOn: string;
  under14: boolean | null;
  guardianName: string | null;
};

const CHANNEL_LABEL = { WEB_APPLY: "입회 신청", SIGN_UP: "가입", PAPER: "서면" } as const;

const FIELD_LABEL: Record<PaperConsentKind, string> = {
  PRIVACY_REQUIRED: "필수 수집·이용",
  PRIVACY_OPTIONAL: "선택 항목 (사진·생년월일·차량번호)",
  MARKETING: "광고성 정보 수신",
  SENSITIVE: "민감정보 별도 동의 (받은 경우만)",
};

/** 원생 상세 › 기본 정보 — 받은 동의서를 등록하고 지난 동의를 본다 */
export function ConsentPanel({
  studentId,
  rows,
  today,
  under14Known,
}: {
  studentId: string;
  rows: ConsentRow[];
  today: string;
  /** 생년월일로 알 수 있으면 그 값, 모르면 null */
  under14Known: boolean | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agreedOn, setAgreedOn] = useState(today);
  const [under14Input, setUnder14Input] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianCheck, setGuardianCheck] = useState("");
  const [agreed, setAgreed] = useState<Record<PaperConsentKind, boolean>>({
    PRIVACY_REQUIRED: false,
    PRIVACY_OPTIONAL: false,
    MARKETING: false,
    SENSITIVE: false,
  });
  const [error, setError] = useState<string | null>(null);
  const under14 = under14Known ?? under14Input;

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        // 민감정보는 동의서에 항목이 있을 때만 등록한다 — 체크하지 않으면 '받지 않음'이지 '거부'가 아니다
        const { SENSITIVE, ...rest } = agreed;
        const res = await savePaperConsent({
          studentId,
          agreedOn,
          under14,
          guardianName,
          guardianCheck,
          agreed: SENSITIVE ? { ...rest, SENSITIVE } : rest,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success("동의 기록을 남겼어요");
        router.refresh();
      } catch {
        setError("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요");
      }
    });
  };

  return (
    <div className="flex flex-col gap-x6">
      <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
        <div className="flex flex-col gap-x2">
          <Label htmlFor="consent-date">서명한 날</Label>
          <Input
            id="consent-date"
            type="date"
            max={today}
            value={agreedOn}
            onChange={(e) => setAgreedOn(e.target.value)}
            className="h-11 t5-regular"
          />
        </div>
        <div className="flex flex-col gap-x2">
          <Label htmlFor="consent-guardian">서명한 법정대리인{under14 ? "" : " (있으면)"}</Label>
          <Input
            id="consent-guardian"
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={40}
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            className="h-11 t5-regular"
          />
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-x2 t4-regular text-fg-neutral">
        <Checkbox
          checked={under14}
          disabled={under14Known !== null}
          onCheckedChange={(v) => setUnder14Input(v === true)}
        />
        서명한 날 기준 만 14세 미만
        {under14Known !== null && <span className="t3-regular text-fg-neutral-subtle">생년월일로 확인</span>}
      </label>

      {under14 && (
        <div className="flex flex-col gap-x2">
          <Label htmlFor="consent-check">법정대리인 동의를 확인한 방법</Label>
          <Select value={guardianCheck} onValueChange={setGuardianCheck}>
            <SelectTrigger id="consent-check" className="h-11">
              <SelectValue placeholder="골라주세요" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GUARDIAN_CHECKS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <fieldset className="flex flex-col">
        <legend className="mb-x1 t4-medium text-fg-neutral">동의한 항목</legend>
        {PAPER_CONSENT_KINDS.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center gap-x2 t4-regular text-fg-neutral">
            <Checkbox checked={agreed[kind]} onCheckedChange={(v) => setAgreed((a) => ({ ...a, [kind]: v === true }))} />
            {FIELD_LABEL[kind]}
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="t4-regular text-fg-critical">
          {error}
        </p>
      )}
      <div>
        <Button type="button" size="lg" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : "동의 기록 남기기"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileSignature} title="남긴 동의 기록이 없어요" description="동의서를 받으면 위에서 등록해 주세요." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>날짜</TableHead>
              <TableHead>항목</TableHead>
              <TableHead>동의</TableHead>
              <TableHead>받은 곳</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{r.agreedOn}</TableCell>
                <TableCell>{CONSENT_KIND_LABEL[r.kind]}</TableCell>
                <TableCell>
                  <StatusBadge tone={r.agreed ? "ok" : "gray"}>{r.agreed ? "동의" : "동의 안 함"}</StatusBadge>
                </TableCell>
                <TableCell className="text-fg-neutral-muted">
                  {CHANNEL_LABEL[r.channel]}
                  {r.under14 && r.guardianName ? ` · 법정대리인 ${r.guardianName}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

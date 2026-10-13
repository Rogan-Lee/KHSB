"use client";

// 사용 통제 화면 공용 — 시간 표기, 배지, 서버 액션 실행 훅.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AccessCatalogItem, AccessRuleView } from "@/actions/access-control";
import { TARGET_KIND_LABELS } from "@/lib/access-control/input";
import type { AccessAction, AccessTargetKind } from "@/lib/access-control/types";
import { StatusBadge, TONE_SOFT, type Tone } from "@/components/backoffice/ui";
import { cn, DAY_NAMES } from "@/lib/utils";

export const ACCESS_PATH = "/access-control";

export type StudentOption = { id: string; name: string; grade: string; seat: string | null };

// ─── 시간 표기 — 서버와 클라이언트가 같은 글자를 그리도록 시간대·형식을 고정한다 ───

const KST = "Asia/Seoul";

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: KST,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function kstDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: KST });
}

/** "10. 11. 14:00 ~ 15:30" — 같은 날에 끝나면 끝 시각은 시간만 */
export function fmtRange(startIso: string, endIso: string): string {
  const end = kstDay(startIso) === kstDay(endIso) ? fmtTime(endIso) : fmtDateTime(endIso);
  return `${fmtDateTime(startIso)} ~ ${end}`;
}

/** 남은 시간 — 기준 시각은 서버가 준 now 를 쓴다 (렌더 중 시계를 읽지 않는다) */
export function remainingText(endIso: string, nowIso: string): string {
  const min = Math.max(1, Math.ceil((new Date(endIso).getTime() - new Date(nowIso).getTime()) / 60_000));
  if (min < 60) return `${min}분 남음`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분 남음` : `${h}시간 남음`;
}

/** "항상" 또는 "월·화·수 09:00~22:00" */
export function scheduleText(rule: Pick<AccessRuleView, "daysOfWeek" | "startTime" | "endTime">): string {
  const { daysOfWeek: days, startTime, endTime } = rule;
  const dayText = days.length === 0 || days.length === 7 ? "" : days.map((d) => DAY_NAMES[d]).join("·");
  const timeText = startTime && endTime ? `${startTime}~${endTime < startTime ? "다음 날 " : ""}${endTime}` : "";
  return [dayText, timeText].filter(Boolean).join(" ") || "항상";
}

export function studentText(s: { name: string; grade: string }): string {
  return `${s.name} ${s.grade}`;
}

export function studentOptionLabel(s: StudentOption): string {
  return `${s.name} · ${s.grade}${s.seat ? ` · 좌석 ${s.seat}` : ""}`;
}

/** 서비스 id → 표시 이름. 목록에 없으면 id 를 그대로 보여 준다 */
export function serviceNameMap(catalog: AccessCatalogItem[]): Map<string, string> {
  return new Map(catalog.map((c) => [c.id, c.name]));
}

// ─── 배지·칩 ─────────────────────────────────────────────────────────

export function ActionBadge({ action }: { action: AccessAction }) {
  return <StatusBadge tone={action === "BLOCK" ? "bad" : "ok"}>{action === "BLOCK" ? "차단" : "허용"}</StatusBadge>;
}

/** 대상 종류 — "인터넷 전체"는 이름과 같아 따로 붙이지 않는다 */
export function KindBadge({ kind }: { kind: AccessTargetKind }) {
  if (kind === "ALL") return null;
  return <StatusBadge tone="gray">{TARGET_KIND_LABELS[kind]}</StatusBadge>;
}

/** 지금 적용 중인 대상 하나 (읽기 전용 칩) */
export function PolicyChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full px-x2_5 py-x0_5 t3-medium", TONE_SOFT[tone])}>
      {children}
    </span>
  );
}

// ─── 서버 액션 실행 ──────────────────────────────────────────────────

type Fail = { ok: false; error: string };

/**
 * 통제 액션 실행 — 입력 오류({ ok: false })는 서버 문구 그대로, 권한 오류 등 throw 는 일반 문구로 알린다
 * (운영 빌드는 throw 한 메시지를 화면에 넘기지 않는다). 성공하면 화면 데이터를 다시 받는다.
 */
export function useAccessAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function run<T extends { ok: true }>(
    action: () => Promise<T | Fail>,
    options: { key?: string; success?: string | ((result: T) => string); onSuccess?: (result: T) => void } = {},
  ) {
    setBusyKey(options.key ?? null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          const message = typeof options.success === "function" ? options.success(result) : options.success;
          if (message) toast.success(message);
          options.onSuccess?.(result);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("처리하지 못했어요. 권한을 확인하고 다시 시도해 주세요.");
      }
      setBusyKey(null);
    });
  }

  return { pending, busyKey, run };
}

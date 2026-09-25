// 초기 설문 답변 보기(직원용) 공용 조각 — 질문 라벨은 t3 subtle, 답은 t4.
// 무거운 상자 대신 여백·구분선으로 묶는다. 훅 없음(서버 컴포넌트에서도 사용).

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

/** 답변 묶음 전체 */
export function SurveyAnswers({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-x6 t4-regular text-fg-neutral">{children}</div>;
}

/** 한 질문 — 라벨(질문) + 답 */
export function SurveyItem({
  label,
  trailing,
  children,
}: {
  label: ReactNode;
  /** 라벨 옆 보조 표시(합계 등) */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-x2 flex items-center gap-x2 t3-medium text-fg-neutral-subtle">
        <span>{label}</span>
        {trailing}
      </div>
      <div className="t4-regular text-fg-neutral">{children}</div>
    </div>
  );
}

/** 반복 항목(1지망·과목별 등) 목록 — 구분선으로 나눈다 */
export function SurveyEntries({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-stroke-neutral-muted border-y border-stroke-neutral-muted">{children}</ul>
  );
}

export function SurveyEntry({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <li className={cn("py-x3", muted && "text-fg-neutral-subtle")}>{children}</li>;
}

/** 항목 머리 줄 — 굵은 제목 + 배지들 */
export function SurveyEntryHead({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-x2 gap-y-x1">{children}</div>;
}

/** 항목 안 "라벨: 값" 한 줄 (선택 이유·사유 등) */
export function SurveyField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-x2">
      <div className="t3-regular text-fg-neutral-subtle">{label}</div>
      <p className="mt-x0_5 whitespace-pre-wrap break-words t4-regular text-fg-neutral">{children}</p>
    </div>
  );
}

/** 선택형 답 칩 (SEED Badge neutral) — "기타: …" 처럼 긴 답은 줄바꿈 */
export function SurveyTag({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "ok" | "warn" | "bad" | "brand" }) {
  return (
    <StatusBadge tone={tone} className="max-w-full whitespace-normal break-words">
      {children}
    </StatusBadge>
  );
}

export function SurveyTags({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x1">{children}</div>;
}

/** 입력되지 않은 칸 */
export function Missing({ children = "미입력" }: { children?: ReactNode }) {
  return <span className="text-fg-placeholder">{children}</span>;
}

/** 아무 답도 없을 때 */
export function SurveyEmpty() {
  return <p className="t4-regular text-fg-placeholder">아직 답하지 않았어요</p>;
}

/** 이전 버전 설문의 자유 기술 답변 */
export function LegacyAnswer({ text }: { text: string }) {
  return (
    <div className="rounded-r2 bg-bg-warning-weak px-x4 py-x3">
      <p className="t3-bold text-fg-warning">이전 자유 기술 답변</p>
      <p className="mt-x1 whitespace-pre-wrap break-words t4-regular text-fg-neutral">{text}</p>
    </div>
  );
}

/** 제출 조건 미충족 안내 */
export function IncompleteNote() {
  return (
    <p className="inline-flex items-center gap-x1 t3-medium text-fg-warning">
      <AlertCircle className="size-4" aria-hidden />
      일부 항목이 비어 있어 제출 조건을 채우지 못했어요
    </p>
  );
}

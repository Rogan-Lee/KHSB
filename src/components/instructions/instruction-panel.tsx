"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Send, SendHorizontal } from "lucide-react";
import { sendInstructionAction } from "@/actions/student-instructions";
import type { StaffInstructionView } from "@/lib/student-instructions";
import { INSTRUCTION_MAX_LEN, mentionsParent } from "@/lib/student-instruction-rules";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { CountBadge, EmptyState, SectionLink, StatusBadge } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

// 학생 지시 — 학생 상세·멘토링 상세 패널과 소통 › 학생 지시 화면(instruction-board)이 같이 쓰는 조각.
// 원장 결정: 학생에게는 학부모 요청이라는 사실이 보이지 않는다. 원본 요청은 운영진 화면에만 그린다.

export type InstructionStudentOption = { id: string; name: string; grade: string };

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** 서버 액션 결과를 토스트로 알린다 — 성공이면 data, 아니면 null */
export async function runAction<T>(action: () => Promise<ActionResult<T>>): Promise<T | null> {
  try {
    const res = await action();
    if (res.ok) return res.data;
    toast.error(res.error);
  } catch {
    toast.error("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요");
  }
  return null;
}

export function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const KIND_RE = /^\[([^\]]{1,10})\]\s*/;

/** 학부모 요청 원문 — 앞의 [종류] 머리말은 작은 라벨로 */
export function RequestText({ text, className }: { text: string; className?: string }) {
  const m = text.match(KIND_RE);
  return (
    <p className={cn("whitespace-pre-wrap break-words t4-regular text-fg-neutral", className)}>
      {m && (
        <StatusBadge tone="gray" className="mr-x1_5 align-middle">
          {m[1]}
        </StatusBadge>
      )}
      {m ? text.slice(m[0].length) : text}
    </p>
  );
}

/** 지시 입력칸 — 글자 수 + 학생에게 보이는 방식 안내(부모님을 떠올리게 하는 말이 있으면 경고) */
export function InstructionField({
  value,
  onChange,
  disabled,
  placeholder = "학생에게 보낼 지시를 적어 주세요",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const warn = mentionsParent(value);
  return (
    <div className="flex flex-col gap-x1_5">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={INSTRUCTION_MAX_LEN}
        placeholder={placeholder}
        aria-label="학생에게 보낼 지시"
        disabled={disabled}
        className="resize-none"
      />
      <div className="flex items-start justify-between gap-x2 t3-regular">
        <p className={warn ? "t3-medium text-fg-critical" : "text-fg-neutral-subtle"} role={warn ? "alert" : undefined}>
          {warn
            ? "문장에 부모님을 떠올리게 하는 말이 있어요. 학생에게 그대로 보여요."
            : "학생에게는 학부모 요청이라는 게 보이지 않아요. 보낸 사람 이름으로만 전달돼요."}
        </p>
        <span className="shrink-0 tabular-nums text-fg-neutral-subtle">
          {value.length}/{INSTRUCTION_MAX_LEN}
        </span>
      </div>
    </div>
  );
}

/** 바로 지시하기 — studentId 를 주면 그 학생 고정, students 를 주면 학생을 고른다 */
export function DirectInstructionForm({
  studentId: fixedStudentId,
  students,
}: {
  studentId?: string;
  students?: InstructionStudentOption[];
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(fixedStudentId ?? "");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function send() {
    if (!studentId) return void toast.error("학생을 골라 주세요");
    startTransition(async () => {
      const item = await runAction(() => sendInstructionAction({ studentId, content }));
      if (!item) return;
      toast.success(`${item.student.name} 학생에게 보냈어요`);
      setContent("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      {students && (
        <Combobox
          items={students.map((s) => ({ value: s.id, label: s.name, subLabel: s.grade }))}
          value={studentId}
          onChange={setStudentId}
          placeholder="학생 선택"
          searchPlaceholder="이름 검색..."
          emptyMessage="학생을 찾을 수 없습니다"
          disabled={pending}
        />
      )}
      <InstructionField value={content} onChange={setContent} disabled={pending} />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={send} disabled={pending || !studentId || !content.trim()}>
          <Send aria-hidden />
          {pending ? "보내는 중…" : "학생에게 보내기"}
        </Button>
      </div>
    </div>
  );
}

/** 보낸 지시 한 건 — 보낸 사람·시각, 학생 확인 여부, 출처(학부모 요청 원문은 접어 둔다) */
export function SentInstruction({ item, showStudent = false }: { item: StaffInstructionView; showStudent?: boolean }) {
  return (
    <li className="py-x3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x1_5">
        <StatusBadge tone={item.request ? "warn" : "gray"}>{item.request ? "학부모 요청" : "바로 지시"}</StatusBadge>
        {showStudent && (
          <Link
            href={`/students/${item.student.id}`}
            className="ml-x0_5 t4-medium text-fg-neutral underline-offset-4 hover:underline"
          >
            {item.student.name}
            <span className="ml-x1 t3-regular text-fg-neutral-subtle">{item.student.grade}</span>
          </Link>
        )}
        <span className="ml-auto">
          {item.ackedAt ? (
            <StatusBadge tone="ok">학생 확인 {fmt(item.ackedAt)}</StatusBadge>
          ) : (
            <StatusBadge tone="warn">확인 전</StatusBadge>
          )}
        </span>
      </div>
      <p className="mt-x1_5 whitespace-pre-wrap break-words t4-regular text-fg-neutral">{item.content}</p>
      <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
        보낸 사람 {item.sentByName ?? "운영진"} · {fmt(item.sentAt ?? item.createdAt)}
      </p>
      {item.request && (
        <details className="group mt-x2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-x1 rounded-r2 t3-medium text-fg-neutral-subtle outline-none hover:text-fg-neutral focus-visible:ring-2 focus-visible:ring-stroke-focus-ring [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            학부모 요청 원문
          </summary>
          <div className="mt-x1_5 rounded-r2 bg-bg-layer-fill px-x3 py-x2_5">
            <p className="t3-regular tabular-nums text-fg-neutral-subtle">
              {item.request.createdByName} · {fmt(item.request.createdAt)}
            </p>
            <RequestText text={item.request.content} className="mt-x1 text-fg-neutral-muted" />
          </div>
        </details>
      )}
    </li>
  );
}

/** 학생 상세·멘토링 상세 — 이 학생에게 보낸 지시 + 바로 지시하기 */
export function InstructionPanel({
  studentId,
  studentName,
  items,
}: {
  studentId: string;
  studentName: string;
  items: StaffInstructionView[];
}) {
  const unacked = items.filter((i) => !i.ackedAt).length;
  return (
    <div className="flex flex-col gap-x4">
      <div className="flex items-center justify-between gap-x2">
        <div className="flex min-w-0 items-center gap-x1_5">
          <span className="t4-bold text-fg-neutral">학생 지시</span>
          <CountBadge count={unacked} />
        </div>
        <SectionLink href="/instructions">학부모 요청 처리하기</SectionLink>
      </div>

      <DirectInstructionForm studentId={studentId} />

      {items.length === 0 ? (
        <EmptyState compact icon={SendHorizontal} title={`${studentName} 학생에게 보낸 지시가 없어요`} />
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted pt-x3">
          {items.map((item) => (
            <SentInstruction key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

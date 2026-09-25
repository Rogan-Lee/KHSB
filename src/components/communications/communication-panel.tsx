"use client";

import { useState, useTransition } from "react";
import { createCommunication, checkCommunication, deleteCommunication } from "@/actions/communications";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CountBadge, EmptyState, FilterChip, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp, Inbox, Plus } from "lucide-react";
import type { Communication } from "@/generated/prisma";

interface Props {
  studentId: string;
  initialItems: Communication[];
  compact?: boolean; // 입퇴실/멘토링 패널에서 간소화 모드
}

const TYPE_LABELS = {
  PARENT_REQUEST: { label: "학부모 요청", tone: "warn" },
  STAFF_NOTE: { label: "운영진 전달", tone: "info" },
} satisfies Record<Communication["type"], { label: string; tone: Tone }>;

/** 행 안의 작은 아이콘 버튼 (확인·삭제) */
const ICON_BUTTON =
  "-my-1 grid size-x7 shrink-0 place-items-center rounded-full text-fg-neutral-subtle outline-none transition-colors hover:bg-bg-transparent-pressed focus-visible:ring-2 focus-visible:ring-stroke-focus-ring disabled:pointer-events-none disabled:text-fg-disabled";

function formatRelative(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return "방금";
}

export function CommunicationPanel({ studentId, initialItems, compact = false }: Props) {
  const [items, setItems] = useState<Communication[]>(initialItems);
  const [activeType, setActiveType] = useState<"PARENT_REQUEST" | "STAFF_NOTE">("STAFF_NOTE");
  const [content, setContent] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showChecked, setShowChecked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAdding, startAddTransition] = useTransition();
  const busy = isPending || isAdding;

  const unchecked = items.filter((i) => !i.isChecked);
  const checked = items.filter((i) => i.isChecked);

  function handleAdd() {
    if (!content.trim()) return;
    startAddTransition(async () => {
      try {
        const created = await createCommunication(studentId, activeType, content.trim());
        setItems((prev) => [created, ...prev]);
        setContent("");
        setShowForm(false);
        toast.success("등록되었습니다");
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  function handleCheck(item: Communication) {
    startTransition(async () => {
      try {
        await checkCommunication(item.id, studentId);
        setItems((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, isChecked: true, checkedAt: new Date() } : i)
        );
      } catch {
        toast.error("처리 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCommunication(id, studentId);
        setItems((prev) => prev.filter((i) => i.id !== id));
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const metaText = compact ? "t2-regular" : "t3-regular";

  return (
    <div className="flex flex-col gap-x3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-x2">
        <div className="flex min-w-0 items-center gap-x1_5">
          <span className={cn("text-fg-neutral", compact ? "t3-bold" : "t4-bold")}>
            요청/전달사항
          </span>
          <CountBadge count={unchecked.length} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={showForm}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? (
            "취소"
          ) : (
            <>
              <Plus aria-hidden />
              추가
            </>
          )}
        </Button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="flex flex-col gap-x2">
          <div className="flex flex-wrap gap-x1_5" role="group" aria-label="유형">
            {(["PARENT_REQUEST", "STAFF_NOTE"] as const).map((t) => (
              <FilterChip key={t} selected={activeType === t} onClick={() => setActiveType(t)}>
                {TYPE_LABELS[t].label}
              </FilterChip>
            ))}
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={activeType === "PARENT_REQUEST" ? "학부모 요청사항을 입력하세요..." : "운영진 전달사항을 입력하세요..."}
            aria-label={activeType === "PARENT_REQUEST" ? "학부모 요청사항" : "운영진 전달사항"}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={busy || !content.trim()}>
              {isAdding ? "등록 중…" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 미확인 목록 */}
      {unchecked.length === 0 && !showForm && (
        compact ? (
          <p className="py-x2 text-center t3-regular text-fg-neutral-subtle">미확인 사항이 없어요</p>
        ) : (
          <EmptyState compact icon={Inbox} title="미확인 사항이 없어요" />
        )
      )}
      {unchecked.length > 0 && (
        <ul className="divide-y divide-stroke-neutral-muted">
          {unchecked.map((item) => (
            <li key={item.id} className="flex items-start gap-x2 py-x2_5 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => handleCheck(item)}
                disabled={busy}
                aria-label="확인 처리"
                title="확인 처리"
                className={cn(ICON_BUTTON, "hover:text-fg-positive")}
              >
                <Circle className="size-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x1_5">
                  <StatusBadge tone={TYPE_LABELS[item.type].tone}>{TYPE_LABELS[item.type].label}</StatusBadge>
                  <span className={cn(metaText, "text-fg-neutral-subtle tabular-nums")}>
                    {formatRelative(item.createdAt)} · {item.createdByName}
                  </span>
                </div>
                <p className="mt-x1 whitespace-pre-wrap break-words t4-regular text-fg-neutral">{item.content}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                disabled={busy}
                aria-label="삭제"
                title="삭제"
                className={cn(ICON_BUTTON, "hover:text-fg-critical")}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 확인 완료 목록 (접기/펼치기) */}
      {checked.length > 0 && (
        <div className="border-t border-stroke-neutral-muted pt-x3">
          <button
            type="button"
            onClick={() => setShowChecked((v) => !v)}
            aria-expanded={showChecked}
            className="inline-flex items-center gap-x1 rounded-r2 t3-medium text-fg-neutral-subtle outline-none transition-colors hover:text-fg-neutral focus-visible:ring-2 focus-visible:ring-stroke-focus-ring"
          >
            {showChecked ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            처리 완료 히스토리 <span className="tabular-nums">{checked.length}건</span>
          </button>
          {showChecked && (
            <ul className="mt-x2 flex flex-col gap-x1_5">
              {checked.map((item) => (
                <li key={item.id} className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5">
                  {/* 헤더 */}
                  <div className="flex items-center gap-x1_5">
                    <CheckCircle2 className="size-4 shrink-0 text-fg-positive" aria-hidden />
                    <StatusBadge tone={TYPE_LABELS[item.type].tone}>{TYPE_LABELS[item.type].label}</StatusBadge>
                    <span className={cn(metaText, "min-w-0 truncate text-fg-neutral-subtle tabular-nums")}>
                      {item.createdByName} · {formatRelative(item.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={busy}
                      aria-label="삭제"
                      title="삭제"
                      className={cn(ICON_BUTTON, "ml-auto hover:text-fg-critical")}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  {/* 내용 */}
                  <p className="mt-x1 whitespace-pre-wrap break-words t4-regular text-fg-neutral-muted">{item.content}</p>
                  {/* 처리 완료 날짜 */}
                  {item.checkedAt && (
                    <p className="mt-x1_5 t2-regular text-fg-positive tabular-nums">
                      {new Date(item.checkedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 처리 완료
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

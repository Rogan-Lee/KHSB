"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, MessageSquareReply, Loader2 } from "lucide-react";
import {
  setSuggestionStatus,
  replyToSuggestion,
  deleteStudentSuggestion,
  type StaffSuggestionView,
} from "@/actions/student-suggestions";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_BADGE,
} from "@/lib/suggestions";
import type { SuggestionCategory, SuggestionStatus } from "@/generated/prisma/enums";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function StudentSuggestionBoard({
  initial,
  canDelete,
}: {
  initial: StaffSuggestionView[];
  canDelete: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "ALL">("ALL");

  const filtered = useMemo(
    () =>
      initial.filter(
        (s) =>
          (statusFilter === "ALL" || s.status === statusFilter) &&
          (categoryFilter === "ALL" || s.category === categoryFilter)
      ),
    [initial, statusFilter, categoryFilter]
  );

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>
            전체 상태
          </FilterChip>
          {STATUS_ORDER.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={categoryFilter === "ALL"} onClick={() => setCategoryFilter("ALL")}>
            전체 분류
          </FilterChip>
          {CATEGORY_ORDER.map((c) => (
            <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
              {CATEGORY_LABELS[c]}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <MessageSquareReply className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">해당하는 건의사항이 없어요</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((s) => (
            <SuggestionCard key={s.id} s={s} canDelete={canDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
        active ? "bg-brand text-white" : "border bg-background text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function SuggestionCard({ s, canDelete }: { s: StaffSuggestionView; canDelete: boolean }) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState(s.staffReply ?? "");
  const [pending, startTransition] = useTransition();

  function changeStatus(status: SuggestionStatus) {
    startTransition(async () => {
      try {
        await setSuggestionStatus({ id: s.id, status });
        toast.success(`상태: ${STATUS_LABELS[status]}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "변경 실패");
      }
    });
  }

  function saveReply() {
    if (!reply.trim()) return toast.error("답변 내용을 입력하세요");
    startTransition(async () => {
      try {
        await replyToSuggestion({ id: s.id, reply });
        toast.success("답변을 저장했어요 (학생에게 안내됩니다)");
        setReplyOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function remove() {
    if (!confirm("이 건의사항을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await deleteStudentSuggestion(s.id);
        toast.success("삭제했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[s.status]}`}>
          {STATUS_LABELS[s.status]}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {CATEGORY_LABELS[s.category]}
        </span>
        <span className="text-[13px] font-medium text-foreground">{s.studentName}</span>
        <span className="text-[12px] text-muted-foreground">{s.studentGrade}</span>
        <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">{fmt(s.createdAt)}</span>
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug">{s.title}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{s.content}</p>

      {s.staffReply && !replyOpen && (
        <div className="mt-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
          <p className="text-[11.5px] font-semibold text-brand">
            답변{s.handledByName ? ` · ${s.handledByName}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground/90">{s.staffReply}</p>
        </div>
      )}

      {/* 상태 변경 + 답변 + 삭제 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
        <span className="text-[11.5px] text-muted-foreground">상태</span>
        {STATUS_ORDER.map((st) => (
          <button
            key={st}
            type="button"
            disabled={pending || s.status === st}
            onClick={() => changeStatus(st)}
            className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-default ${
              s.status === st
                ? "border-brand bg-brand text-white"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {STATUS_LABELS[st]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            type="button"
            onClick={() => setReplyOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent"
          >
            <MessageSquareReply className="h-3.5 w-3.5" /> {s.staffReply ? "답변 수정" : "답변"}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              title="삭제"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {replyOpen && (
        <div className="mt-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="학생에게 전달할 답변 (반영 결과 안내)"
            className="w-full rounded-lg border bg-background px-3 py-2 text-[14px] focus:border-brand focus:outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setReplyOpen(false)}
              className="rounded-md border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveReply}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              답변 저장
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

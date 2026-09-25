"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, MessageSquareReply, Loader2, EyeOff, Eye, MessageSquarePlus } from "lucide-react";
import {
  setSuggestionStatus,
  replyToSuggestion,
  deleteStudentSuggestion,
  setSuggestionHidden,
  type StaffSuggestionView,
} from "@/actions/student-suggestions";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/lib/suggestions";
import type { SuggestionCategory, SuggestionStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  FilterChip,
  FormActions,
  Segmented,
  StatusBadge,
  Toolbar,
  type Tone,
} from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "./use-confirm-dialog";

// 상태 배지 — SEED 역할색 (lib/suggestions 의 STATUS_BADGE 는 학생 포털 등 다른 화면용으로 남겨 둔다)
const STATUS_TONE: Record<SuggestionStatus, Tone> = {
  RECEIVED: "warn",
  REVIEWING: "info",
  REFLECTED: "ok",
  DECLINED: "gray",
};

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
  const { confirm, dialog } = useConfirmDialog();

  const filtered = useMemo(
    () =>
      initial.filter(
        (s) =>
          (statusFilter === "ALL" || s.status === statusFilter) &&
          (categoryFilter === "ALL" || s.category === categoryFilter)
      ),
    [initial, statusFilter, categoryFilter]
  );

  // 필터 칩 옆 개수 — 다른 축 필터를 반영한 건수
  const byCategory = initial.filter((s) => categoryFilter === "ALL" || s.category === categoryFilter);
  const byStatus = initial.filter((s) => statusFilter === "ALL" || s.status === statusFilter);
  const statusCount = (st: SuggestionStatus) => byCategory.filter((s) => s.status === st).length;
  const categoryCount = (c: SuggestionCategory) => byStatus.filter((s) => s.category === c).length;

  return (
    <div>
      {/* 필터 */}
      <Toolbar className="flex-col items-start gap-x3">
        <div className="flex flex-wrap items-center gap-x1_5">
          <span className="w-10 shrink-0 t3-medium text-fg-neutral-subtle">상태</span>
          <FilterChip selected={statusFilter === "ALL"} count={byCategory.length} onClick={() => setStatusFilter("ALL")}>
            전체
          </FilterChip>
          {STATUS_ORDER.map((s) => (
            <FilterChip key={s} selected={statusFilter === s} count={statusCount(s)} onClick={() => setStatusFilter(s)}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x1_5">
          <span className="w-10 shrink-0 t3-medium text-fg-neutral-subtle">분류</span>
          <FilterChip selected={categoryFilter === "ALL"} count={byStatus.length} onClick={() => setCategoryFilter("ALL")}>
            전체
          </FilterChip>
          {CATEGORY_ORDER.map((c) => (
            <FilterChip key={c} selected={categoryFilter === c} count={categoryCount(c)} onClick={() => setCategoryFilter(c)}>
              {CATEGORY_LABELS[c]}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      {filtered.length === 0 ? (
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <EmptyState
            icon={MessageSquarePlus}
            title={initial.length === 0 ? "아직 들어온 건의사항이 없어요" : "조건에 맞는 건의사항이 없어요"}
            description={initial.length === 0 ? "학생이 포털에서 건의를 올리면 여기에 모여요." : "위의 상태·분류 필터를 바꿔 보세요."}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-x3">
          {filtered.map((s) => (
            <SuggestionCard key={s.id} s={s} canDelete={canDelete} confirm={confirm} />
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}

function SuggestionCard({
  s,
  canDelete,
  confirm,
}: {
  s: StaffSuggestionView;
  canDelete: boolean;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
}) {
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

  async function remove() {
    const ok = await confirm({
      title: "이 건의사항을 삭제할까요?",
      description: `「${s.title}」\n삭제하면 학생 포털에 ‘삭제됨’으로 안내돼요.`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteStudentSuggestion(s.id);
        toast.success("삭제했어요 (학생에게 안내됩니다)");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  function toggleHidden() {
    startTransition(async () => {
      try {
        await setSuggestionHidden({ id: s.id, hidden: !s.isHidden });
        toast.success(s.isHidden ? "숨김 해제했어요" : "숨김 처리했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "변경 실패");
      }
    });
  }

  return (
    <li
      className={cn(
        "rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default",
        s.isHidden && "bg-bg-layer-fill",
      )}
    >
      <div className={cn("px-x5 pt-x5", s.isHidden && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-x1_5">
          <StatusBadge tone={STATUS_TONE[s.status]}>{STATUS_LABELS[s.status]}</StatusBadge>
          <StatusBadge tone="gray">{CATEGORY_LABELS[s.category]}</StatusBadge>
          {s.isHidden && (
            <StatusBadge tone="gray">
              <EyeOff />숨김
            </StatusBadge>
          )}
          <span className="ml-x1 t4-medium text-fg-neutral">{s.studentName}</span>
          <span className="t3-regular text-fg-neutral-subtle">{s.studentGrade}</span>
          <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">{fmt(s.createdAt)}</span>
        </div>

        <p className="mt-x3 t5-bold text-fg-neutral">{s.title}</p>
        <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral-muted">{s.content}</p>

        {s.staffReply && !replyOpen && (
          <div className="mt-x4 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
            <p className="flex items-center gap-x1 t3-medium text-fg-neutral-subtle">
              <MessageSquareReply className="size-3.5" aria-hidden />
              답변{s.handledByName ? ` · ${s.handledByName}` : ""}
            </p>
            <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral">{s.staffReply}</p>
          </div>
        )}
      </div>

      {replyOpen && (
        <div className="px-x5 pt-x4">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="학생에게 전달할 답변 (반영 결과 안내)"
            aria-label="답변"
            autoFocus
          />
          <FormActions>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>
              취소
            </Button>
            <Button type="button" size="sm" onClick={saveReply} disabled={pending}>
              {pending ? "저장 중…" : "답변 저장"}
            </Button>
          </FormActions>
        </div>
      )}

      {/* 상태 변경 + 답변 + 숨김/삭제 */}
      <div className="mt-x4 flex flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x5 py-x3">
        <span className="t3-medium text-fg-neutral-subtle">상태 변경</span>
        <Segmented
          aria-label="건의사항 상태 변경"
          value={s.status}
          onChange={(st) => {
            if (st !== s.status) changeStatus(st);
          }}
          disabled={pending}
          options={STATUS_ORDER.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
          className="w-full sm:w-auto"
        />
        <div className="ml-auto flex items-center gap-x1">
          {pending && <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="처리 중" />}
          {!replyOpen && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setReplyOpen(true)}>
              <MessageSquareReply /> {s.staffReply ? "답변 수정" : "답변하기"}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleHidden}
              disabled={pending}
              title={s.isHidden ? "숨김 해제" : "숨김 처리"}
              aria-label={s.isHidden ? "숨김 해제" : "숨김 처리"}
            >
              {s.isHidden ? <Eye /> : <EyeOff />}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={pending}
              title="삭제"
              aria-label="삭제"
              className="text-fg-critical"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

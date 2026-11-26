"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveAiJob, rejectAiJob } from "@/actions/report-ai-queue";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import { EmptyState, SearchField, StatusBadge, Toolbar } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { useStickyState } from "@/hooks/use-sticky-state";
import { matchesSearch } from "@/lib/utils";
import type { AiReviewRow } from "@/lib/report-ai-queue";

/** AI 가 만든 글 확인 — 반영해야 학부모 리포트에 들어간다 */
export function AiReviewList({ rows }: { rows: AiReviewRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discard, setDiscard] = useState<AiReviewRow | null>(null);
  const [query, setQuery] = useStickyState("ai-review:query", "");
  const shown = rows.filter((row) => matchesSearch(query, row.studentName));

  const run = (row: AiReviewRow, action: typeof approveAiJob, done: string) => {
    setBusyId(row.jobId);
    startTransition(async () => {
      try {
        const res = await action(row.jobId);
        if (res.ok) toast.success(done);
        else toast.error(res.reason ?? "처리하지 못했어요");
      } catch {
        toast.error("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요");
      } finally {
        setBusyId(null);
        setDiscard(null);
      }
    });
  };

  return (
    <>
      <Toolbar className="mb-0 border-b border-stroke-neutral-muted px-x4 py-x3">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="학생 이름 검색"
          aria-label="검색"
        />
      </Toolbar>
      {shown.length === 0 && <EmptyState compact title="검색 결과가 없어요" />}
      <ul className="flex flex-col divide-y divide-stroke-neutral-muted">
        {shown.map((row) => (
          <li key={row.jobId} className="flex flex-col gap-x3 px-x4 py-x4">
            <div className="flex flex-wrap items-center gap-x2">
              <span className="t5-bold text-fg-neutral">{row.studentName}</span>
              <StatusBadge tone="gray">{row.typeLabel}</StatusBadge>
              {row.periodLabel && <span className="t3-regular text-fg-neutral-subtle">{row.periodLabel}</span>}
            </div>
            {row.text ? (
              <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words t4-regular text-fg-neutral">{row.text}</p>
            ) : (
              <p className="t4-regular text-fg-critical">리포트에 넣을 수 없는 결과예요. 버리고 다시 예약해 주세요.</p>
            )}
            <div className="flex gap-x2">
              <Button
                type="button"
                size="lg"
                disabled={pending || !row.text}
                onClick={() => run(row, approveAiJob, "리포트에 반영했어요")}
              >
                {pending && busyId === row.jobId && !discard ? "반영 중…" : "확인하고 반영"}
              </Button>
              <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => setDiscard(row)}>
                버리기
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={discard !== null}
        onOpenChange={(open) => !open && setDiscard(null)}
        title="이 결과를 버릴까요?"
        description="버린 글은 되살릴 수 없어요. 필요하면 다시 예약해 주세요."
        confirmLabel="버리기"
        pendingLabel="버리는 중…"
        destructive
        pending={pending}
        onConfirm={() => discard && run(discard, rejectAiJob, "결과를 버렸어요")}
      />
    </>
  );
}

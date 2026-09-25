"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, History } from "lucide-react";
import {
  recordSubjectProgress,
  deleteSubjectProgressEntry,
} from "@/actions/online/subject-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  FormActions,
  FormField,
  ProgressBar,
  Section,
} from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";

export type ProgressEntry = {
  id: string;
  subject: string;
  currentTopic: string;
  textbookPage: string | null;
  weeklyProgress: number | null;
  notes: string | null;
  recordedAt: string; // ISO
  authorName: string;
};

export function SubjectProgressPanel({
  studentId,
  subjects,
  entriesBySubject,
  canEdit,
}: {
  studentId: string;
  subjects: readonly string[];
  entriesBySubject: Record<string, ProgressEntry[]>;
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-2">
      {subjects.map((subject) => (
        <SubjectCard
          key={subject}
          studentId={studentId}
          subject={subject}
          entries={entriesBySubject[subject] ?? []}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function SubjectCard({
  studentId,
  subject,
  entries,
  canEdit,
}: {
  studentId: string;
  subject: string;
  entries: ProgressEntry[];
  canEdit: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const latest = entries[0];

  const hasHistory = entries.length > 1;
  const canAdd = canEdit && !showForm;

  return (
    <Section
      title={subject}
      actions={
        hasHistory || canAdd ? (
          <>
            {hasHistory && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
              >
                <History />
                기록 {entries.length}개
              </Button>
            )}
            {canAdd && (
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Plus />
                업데이트
              </Button>
            )}
          </>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-x4"
    >
      {latest ? (
        <LatestView entry={latest} />
      ) : (
        <EmptyState
          compact
          title="아직 기록이 없어요"
          description={canEdit ? "업데이트를 눌러 첫 진도를 기록해 보세요." : undefined}
        />
      )}

      {showForm && canEdit && (
        <ProgressForm
          studentId={studentId}
          subject={subject}
          onSaved={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showHistory && hasHistory && (
        <div className="border-t border-stroke-neutral-muted pt-x4">
          <p className="t3-medium text-fg-neutral-subtle">이전 기록</p>
          <ul className="divide-y divide-stroke-neutral-muted">
            {entries.slice(1).map((e) => (
              <HistoryItem
                key={e.id}
                entry={e}
                canDelete={canEdit}
                studentId={studentId}
              />
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function LatestView({ entry }: { entry: ProgressEntry }) {
  return (
    <div className="flex flex-col gap-x2">
      <div className="flex flex-wrap items-baseline gap-x-x2 gap-y-x0_5">
        <span className="t5-bold text-fg-neutral">{entry.currentTopic}</span>
        {entry.textbookPage && (
          <span className="t3-regular text-fg-neutral-subtle">{entry.textbookPage}</span>
        )}
      </div>
      {entry.weeklyProgress != null && (
        <div className="flex items-center gap-x3">
          <span className="shrink-0 t3-regular text-fg-neutral-subtle">주간 진행률</span>
          <ProgressBar value={entry.weeklyProgress / 100} tone="brand" className="flex-1" />
          <span className="w-x10 shrink-0 text-right t3-medium tabular-nums text-fg-neutral-muted">
            {entry.weeklyProgress}%
          </span>
        </div>
      )}
      {entry.notes && (
        <p className="whitespace-pre-wrap t4-regular text-fg-neutral-muted">{entry.notes}</p>
      )}
      <p className="t3-regular text-fg-neutral-subtle">
        {entry.authorName} · {new Date(entry.recordedAt).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

function HistoryItem({
  entry,
  canDelete,
  studentId,
}: {
  entry: ProgressEntry;
  canDelete: boolean;
  studentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onDelete = () => {
    startTransition(async () => {
      try {
        await deleteSubjectProgressEntry(entry.id);
        toast.success("삭제되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  // satisfy TS — studentId는 revalidate hint용으로 사용 안 하지만 prop 유지
  void studentId;

  return (
    <li className="flex items-start gap-x3 py-x3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-x2 gap-y-x0_5">
          <span className="t4-medium text-fg-neutral">{entry.currentTopic}</span>
          {entry.textbookPage && (
            <span className="t3-regular text-fg-neutral-subtle">{entry.textbookPage}</span>
          )}
          {entry.weeklyProgress != null && (
            <span className="t3-medium tabular-nums text-fg-neutral-muted">{entry.weeklyProgress}%</span>
          )}
        </div>
        {entry.notes && (
          <p className="mt-x1 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{entry.notes}</p>
        )}
        <p className="mt-x1 t2-regular text-fg-neutral-subtle">
          {entry.authorName} · {new Date(entry.recordedAt).toLocaleString("ko-KR")}
        </p>
      </div>
      {canDelete && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            aria-label="기록 삭제"
            className="text-fg-neutral-subtle hover:text-fg-critical"
          >
            <Trash2 />
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="이 기록을 삭제할까요?"
            description="삭제한 진도 기록은 되돌릴 수 없어요."
            confirmLabel="삭제"
            destructive
            pending={isPending}
            onConfirm={() => {
              setConfirmOpen(false);
              onDelete();
            }}
          />
        </>
      )}
    </li>
  );
}

function ProgressForm({
  studentId,
  subject,
  onSaved,
  onCancel,
}: {
  studentId: string;
  subject: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentTopic, setCurrentTopic] = useState("");
  const [textbookPage, setTextbookPage] = useState("");
  const [weeklyProgress, setWeeklyProgress] = useState("");
  const [notes, setNotes] = useState("");
  const fieldId = useId();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTopic.trim()) {
      toast.error("현재 진도 위치는 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        await recordSubjectProgress({
          studentId,
          subject,
          currentTopic,
          textbookPage: textbookPage || null,
          weeklyProgress: weeklyProgress ? Number(weeklyProgress) : null,
          notes: notes || null,
        });
        toast.success("진도가 기록되었습니다");
        onSaved();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "기록 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-x4 rounded-r3 bg-bg-layer-fill p-x4">
      <FormField label="현재 단원 · 위치" required htmlFor={`${fieldId}-topic`}>
        <Input
          id={`${fieldId}-topic`}
          value={currentTopic}
          onChange={(e) => setCurrentTopic(e.target.value)}
          placeholder="지금 공부 중인 단원이나 위치"
          autoFocus
        />
      </FormField>
      <div className="grid grid-cols-1 gap-x4 md:grid-cols-2">
        <FormField label="교재 · 페이지" htmlFor={`${fieldId}-page`}>
          <Input
            id={`${fieldId}-page`}
            value={textbookPage}
            onChange={(e) => setTextbookPage(e.target.value)}
            placeholder="교재명과 페이지"
          />
        </FormField>
        <FormField label="주간 진행률 (%)" htmlFor={`${fieldId}-progress`}>
          <Input
            id={`${fieldId}-progress`}
            type="number"
            min={0}
            max={100}
            value={weeklyProgress}
            onChange={(e) => setWeeklyProgress(e.target.value)}
            placeholder="0~100"
            className="tabular-nums"
          />
        </FormField>
      </div>
      <FormField label="이슈 · 특이사항" htmlFor={`${fieldId}-notes`}>
        <Textarea
          id={`${fieldId}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="필요할 때만 적어 주세요"
          rows={2}
          className="resize-y"
        />
      </FormField>
      <FormActions className="pt-0">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" variant="brand" disabled={isPending || !currentTopic.trim()}>
          {isPending ? "기록 중…" : "기록"}
        </Button>
      </FormActions>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, History } from "lucide-react";
import {
  recordSubjectProgress,
  deleteSubjectProgressEntry,
} from "@/actions/online/subject-progress";

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
    <div className="space-y-4">
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

  return (
    <section className="rounded-[12px] border border-line bg-panel p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-semibold text-ink">{subject}</h3>
        <div className="flex items-center gap-1">
          {entries.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11.5px] text-ink-4 hover:text-ink hover:bg-canvas-2"
            >
              <History className="h-3 w-3" />
              기록 {entries.length}개
            </button>
          )}
          {canEdit && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 rounded-[6px] border border-dashed border-line hover:border-line-strong px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink"
            >
              <Plus className="h-3 w-3" />
              업데이트
            </button>
          )}
        </div>
      </header>

      {latest ? (
        <LatestView entry={latest} />
      ) : (
        <p className="text-[12px] text-ink-5">아직 기록이 없습니다.</p>
      )}

      {showForm && canEdit && (
        <ProgressForm
          studentId={studentId}
          subject={subject}
          onSaved={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showHistory && entries.length > 1 && (
        <div className="mt-3 space-y-2 border-t border-line-2 pt-3">
          <p className="text-[11px] text-ink-4">이전 기록</p>
          {entries.slice(1).map((e) => (
            <HistoryItem
              key={e.id}
              entry={e}
              canDelete={canEdit}
              studentId={studentId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LatestView({ entry }: { entry: ProgressEntry }) {
  return (
    <div className="space-y-1.5 text-[12.5px]">
      <div className="flex items-baseline gap-2">
        <span className="text-ink font-medium">{entry.currentTopic}</span>
        {entry.textbookPage && (
          <span className="text-ink-4 text-[11.5px]">{entry.textbookPage}</span>
        )}
      </div>
      {entry.weeklyProgress != null && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded bg-canvas-2 overflow-hidden">
            <div
              className="h-full bg-ink"
              style={{ width: `${entry.weeklyProgress}%` }}
            />
          </div>
          <span className="text-[11px] text-ink-4 tabular-nums">
            {entry.weeklyProgress}%
          </span>
        </div>
      )}
      {entry.notes && (
        <p className="text-[12px] text-ink-3 leading-relaxed whitespace-pre-wrap">
          {entry.notes}
        </p>
      )}
      <p className="text-[10.5px] text-ink-5">
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

  const onDelete = () => {
    if (!confirm("이 기록을 삭제합니다.")) return;
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
    <div className="rounded-[8px] bg-canvas-2/50 px-3 py-2 text-[11.5px]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-ink">{entry.currentTopic}</span>
            {entry.textbookPage && (
              <span className="text-ink-5 text-[10.5px]">{entry.textbookPage}</span>
            )}
            {entry.weeklyProgress != null && (
              <span className="text-ink-4 text-[10.5px] tabular-nums">
                {entry.weeklyProgress}%
              </span>
            )}
          </div>
          {entry.notes && (
            <p className="mt-0.5 text-ink-4 leading-relaxed whitespace-pre-wrap">
              {entry.notes}
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-ink-5">
            {entry.authorName} · {new Date(entry.recordedAt).toLocaleString("ko-KR")}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            title="삭제"
            className="p-1 rounded text-red-400 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
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
    <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-[10px] border border-line-2 bg-canvas p-3">
      <input
        value={currentTopic}
        onChange={(e) => setCurrentTopic(e.target.value)}
        placeholder="현재 단원 · 위치 (필수)"
        className="w-full rounded-[6px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        autoFocus
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={textbookPage}
          onChange={(e) => setTextbookPage(e.target.value)}
          placeholder="교재 · 페이지"
          className="rounded-[6px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={weeklyProgress}
          onChange={(e) => setWeeklyProgress(e.target.value)}
          placeholder="주간 진행률 (0~100)"
          className="rounded-[6px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px]"
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="이슈 · 특이사항 (선택)"
        rows={2}
        className="w-full rounded-[6px] border border-line bg-panel px-2.5 py-1.5 text-[12.5px] resize-y"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-[6px] border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-3"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending || !currentTopic.trim()}
          className="rounded-[6px] bg-ink text-white px-3 py-1 text-[12px] font-semibold disabled:opacity-50"
        >
          {isPending ? "기록 중..." : "기록"}
        </button>
      </div>
    </form>
  );
}

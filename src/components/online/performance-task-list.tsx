"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  createPerformanceTask,
  updatePerformanceTaskStatus,
  deletePerformanceTask,
} from "@/actions/online/performance-tasks";
import type { PerformanceTaskStatus } from "@/generated/prisma";

export type PerformanceTaskRow = {
  id: string;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;       // ISO
  scoreWeight: number | null;
  format: string | null;
  status: PerformanceTaskStatus;
};

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_COLORS: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-amber-100 text-amber-800",
  NEEDS_REVISION: "bg-red-100 text-red-800",
  DONE: "bg-emerald-100 text-emerald-800",
};

export function PerformanceTaskList({
  studentId,
  tasks,
  canManage,
}: {
  studentId: string;
  tasks: PerformanceTaskRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const handleStatusChange = (taskId: string, status: PerformanceTaskStatus) => {
    startTransition(async () => {
      try {
        await updatePerformanceTaskStatus({ taskId, status });
        toast.success("상태가 변경되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "변경 실패");
      }
    });
  };

  const handleDelete = (taskId: string, title: string) => {
    if (!confirm(`"${title}" 수행평가를 삭제합니다. 제출물도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      try {
        await deletePerformanceTask(taskId);
        toast.success("삭제되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <>
          {showForm ? (
            <CreateTaskForm
              studentId={studentId}
              onSaved={() => {
                setShowForm(false);
                router.refresh();
              }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-line hover:border-line-strong px-3 py-2 text-[12.5px] font-medium text-ink-3 hover:text-ink transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              수행평가 추가
            </button>
          )}
        </>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/50 p-6 text-center text-[12.5px] text-ink-5">
          등록된 수행평가가 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">과목</th>
                <th className="text-left px-3 py-2 font-semibold">제목</th>
                <th className="text-left px-3 py-2 font-semibold">마감일</th>
                <th className="text-left px-3 py-2 font-semibold">상태</th>
                {canManage && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const due = new Date(t.dueDate);
                const daysLeft = Math.ceil(
                  (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const dueClass =
                  daysLeft < 0
                    ? "text-red-700 font-semibold"
                    : daysLeft <= 1
                      ? "text-amber-700 font-semibold"
                      : daysLeft <= 3
                        ? "text-amber-600"
                        : "text-ink-3";
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{t.subject}</td>
                    <td className="px-3 py-2 text-ink">
                      {t.title}
                      {t.format && (
                        <span className="ml-2 text-[11px] text-ink-5">({t.format})</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${dueClass}`}>
                      {due.toLocaleDateString("ko-KR")}
                      <span className="ml-1 text-[11px]">
                        {daysLeft < 0
                          ? `D+${-daysLeft}`
                          : daysLeft === 0
                            ? "D-Day"
                            : `D-${daysLeft}`}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleStatusChange(
                              t.id,
                              e.target.value as PerformanceTaskStatus
                            )
                          }
                          disabled={isPending}
                          className={`rounded-[6px] border border-line px-2 py-0.5 text-[11.5px] font-medium ${STATUS_COLORS[t.status]}`}
                        >
                          {(Object.keys(STATUS_LABEL) as PerformanceTaskStatus[]).map(
                            (s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            )
                          )}
                        </select>
                      ) : (
                        <span
                          className={`inline-block rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium ${STATUS_COLORS[t.status]}`}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id, t.title)}
                          disabled={isPending}
                          title="삭제"
                          className="p-1.5 rounded-[6px] text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateTaskForm({
  studentId,
  onSaved,
  onCancel,
}: {
  studentId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [format, setFormat] = useState("");
  const [scoreWeight, setScoreWeight] = useState<string>("");
  const [description, setDescription] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !title || !dueDate) {
      toast.error("과목 · 제목 · 마감일은 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        await createPerformanceTask({
          studentId,
          subject,
          title,
          dueDate,
          format: format || null,
          scoreWeight: scoreWeight ? Number(scoreWeight) : null,
          description: description || null,
        });
        toast.success("수행평가가 추가되었습니다");
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "추가 실패");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded-[12px] border border-line bg-panel p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Field label="과목" required>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="예: 국어"
            className="field"
          />
        </Field>
        <Field label="제목" required className="md:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 독서 감상문 발표"
            className="field"
          />
        </Field>
        <Field label="마감일" required>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="field"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Field label="형식">
          <input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="예: 발표, 보고서"
            className="field"
          />
        </Field>
        <Field label="배점">
          <input
            type="number"
            value={scoreWeight}
            onChange={(e) => setScoreWeight(e.target.value)}
            placeholder="예: 20"
            className="field"
          />
        </Field>
        <Field label="메모" className="md:col-span-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 — 학생에게 전달할 안내"
            className="field"
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-[8px] border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-3"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "추가"}
        </button>
      </div>
      <style jsx>{`
        .field {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--canvas);
          padding: 6px 10px;
          font-size: 12.5px;
        }
        .field:focus {
          outline: none;
          border-color: var(--line-strong);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] text-ink-4">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

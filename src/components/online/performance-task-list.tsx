"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Loader2, MessageSquare, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import {
  createPerformanceTask,
  updatePerformanceTaskStatus,
  deletePerformanceTask,
} from "@/actions/online/performance-tasks";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  FormActions,
  FormField,
  Section,
  StatusBadge,
  TableCard,
} from "@/components/backoffice/ui";
import { DueDate, PerfStatusBadge, PerfStatusSelect } from "@/components/online/performance-status";
import { useConfirm } from "@/components/online/use-confirm";

export type PerformanceTaskRow = {
  id: string;
  subject: string;
  title: string;
  description: string | null;
  dueDate: string;       // ISO
  scoreWeight: number | null;
  format: string | null;
  status: PerformanceTaskStatus;
  hasSubmission?: boolean;
  latestVersion?: number;
  latestHasFeedback?: boolean;
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
  const [confirm, confirmDialog] = useConfirm();
  // 마감 D-day 계산 기준 시각 — 화면을 연 시점으로 고정
  const [now] = useState(() => Date.now());

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

  const handleDelete = async (taskId: string, title: string) => {
    if (
      !(await confirm({
        title: `‘${title}’ 수행평가를 삭제할까요?`,
        description: "학생 제출물과 피드백도 함께 삭제되고, 되돌릴 수 없어요.",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;
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
    <div className="flex flex-col gap-x4">
      {canManage && (
        <>
          {showForm ? (
            <Section title="수행평가 추가">
              <CreateTaskForm
                studentId={studentId}
                onSaved={() => {
                  setShowForm(false);
                  router.refresh();
                }}
                onCancel={() => setShowForm(false)}
              />
            </Section>
          ) : (
            tasks.length > 0 && (
              <div>
                <Button variant="outline" onClick={() => setShowForm(true)}>
                  <Plus />
                  수행평가 추가
                </Button>
              </div>
            )
          )}
        </>
      )}

      {tasks.length === 0 ? (
        !showForm && (
          <TableCard>
            <EmptyState
              icon={ClipboardList}
              title="등록된 수행평가가 없어요"
              description={canManage ? "과목·제목·마감일을 등록하면 학생 포털에도 보여요." : undefined}
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>
                    <Plus />
                    수행평가 추가
                  </Button>
                ) : undefined
              }
            />
          </TableCard>
        )
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>마감일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>피드백</TableHead>
                {canManage && (
                  <TableHead className="w-x14">
                    <span className="sr-only">삭제</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">{t.subject}</TableCell>
                  <TableCell className="min-w-48">
                    <Link
                      href={`/online/students/${studentId}/tasks/${t.id}`}
                      className="t4-medium text-fg-neutral underline-offset-2 hover:underline"
                    >
                      {t.title}
                    </Link>
                    {t.format && (
                      <span className="ml-x2 t3-regular text-fg-neutral-subtle">{t.format}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DueDate dueIso={t.dueDate} now={now} done={t.status === "DONE"} />
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <PerfStatusSelect
                        value={t.status}
                        onChange={(s) => handleStatusChange(t.id, s)}
                        disabled={isPending}
                      />
                    ) : (
                      <PerfStatusBadge status={t.status} />
                    )}
                  </TableCell>
                  <TableCell>
                    {t.hasSubmission && !t.latestHasFeedback ? (
                      <Link
                        href={`/online/students/${studentId}/tasks/${t.id}#feedback-v${t.latestVersion ?? 1}`}
                        title={`v${t.latestVersion} 제출됨 — 피드백 작성 필요`}
                        className="inline-flex rounded-full transition-opacity hover:opacity-80"
                      >
                        <StatusBadge tone="warn">
                          <MessageSquarePlus aria-hidden />
                          작성 필요
                        </StatusBadge>
                      </Link>
                    ) : t.latestHasFeedback ? (
                      <StatusBadge tone="ok">
                        <MessageSquare aria-hidden />
                        작성됨
                      </StatusBadge>
                    ) : (
                      <span className="text-fg-placeholder">—</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="py-0 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(t.id, t.title)}
                        disabled={isPending}
                        aria-label={`${t.title} 삭제`}
                        title="삭제"
                        className="size-x8 text-fg-neutral-subtle hover:text-fg-critical"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {confirmDialog}
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

  const idp = `perf-add-${studentId}`;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-x4">
      <div className="grid grid-cols-1 gap-x3 md:grid-cols-4">
        <FormField label="과목" required htmlFor={`${idp}-subject`}>
          <Input
            id={`${idp}-subject`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="예: 국어"
          />
        </FormField>
        <FormField label="제목" required htmlFor={`${idp}-title`} className="md:col-span-2">
          <Input
            id={`${idp}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 독서 감상문 발표"
          />
        </FormField>
        <FormField label="마감일" required htmlFor={`${idp}-due`}>
          <Input
            id={`${idp}-due`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="형식" htmlFor={`${idp}-format`}>
          <Input
            id={`${idp}-format`}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="예: 발표, 보고서"
          />
        </FormField>
        <FormField label="배점" htmlFor={`${idp}-weight`}>
          <Input
            id={`${idp}-weight`}
            type="number"
            value={scoreWeight}
            onChange={(e) => setScoreWeight(e.target.value)}
            placeholder="예: 20"
            className="tabular-nums"
          />
        </FormField>
        <FormField label="메모" htmlFor={`${idp}-desc`} className="md:col-span-2">
          <Input
            id={`${idp}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 — 학생에게 전달할 안내"
          />
        </FormField>
      </div>
      <FormActions className="pt-0 max-sm:[&>button]:flex-1">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "저장 중…" : "추가"}
        </Button>
      </FormActions>
    </form>
  );
}

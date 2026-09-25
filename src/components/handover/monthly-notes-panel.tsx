"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useDraft } from "@/hooks/use-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "seed-design/ui/switch";
import { Plus, Trash2, X, StickyNote, SearchX } from "lucide-react";
import {
  EmptyState,
  FormActions,
  FormField,
  SearchField,
  Section,
  StatusBadge,
  Toolbar,
} from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { createMonthlyNote, deleteMonthlyNote, toggleMonthlyNoteVisibility } from "@/actions/monthly-notes";

type MonthlyNote = {
  id: string;
  year: number;
  month: number;
  studentId: string | null;
  studentName: string;
  content: string;
  visibleInReport: boolean;
  authorId: string;
  authorName: string;
  createdAt: Date;
};

type Student = { id: string; name: string; grade: string };

interface Props {
  initialNotes: MonthlyNote[];
  students: Student[];
  year: number;
  month: number;
  currentUserId: string;
  currentUserRole: string;
}

export function MonthlyNotesPanel({
  initialNotes,
  students,
  year,
  month,
  currentUserId,
  currentUserRole,
}: Props) {
  const [notes, setNotes] = useState<MonthlyNote[]>(initialNotes);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formDraft, setFormDraft, clearFormDraft] = useDraft<{
    content: string;
    manualName: string;
    selectedStudent: Student | null;
  }>(`monthly-notes-form-${year}-${month}`, {
    content: "",
    manualName: "",
    selectedStudent: null,
  });

  const content = formDraft.content;
  const selectedStudent = formDraft.selectedStudent;
  const manualName = formDraft.manualName;

  const setContent = (v: string) => setFormDraft((d) => ({ ...d, content: v }));
  const setSelectedStudent = (s: Student | null) => setFormDraft((d) => ({ ...d, selectedStudent: s }));
  const setManualName = (v: string) => setFormDraft((d) => ({ ...d, manualName: v }));

  const isAdmin = currentUserRole === "DIRECTOR" || currentUserRole === "SUPER_ADMIN";

  const filteredStudents = students.filter((s) =>
    s.name.includes(studentQuery) || s.grade.includes(studentQuery)
  );

  const filteredNotes = notes.filter(
    (n) => !searchQuery || n.studentName.includes(searchQuery) || n.content.includes(searchQuery)
  );

  function handleAdd() {
    const sName = selectedStudent?.name || manualName.trim();
    if (!sName || !content.trim()) return;

    startTransition(async () => {
      try {
        const created = await createMonthlyNote({
          year,
          month,
          studentId: selectedStudent?.id,
          studentName: sName,
          content: content.trim(),
        });
        setNotes((prev) => [created as MonthlyNote, ...prev]);
        clearFormDraft();
        setStudentQuery("");
        setShowForm(false);
        toast.success("특이사항이 등록되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteMonthlyNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        setDeleteConfirmId(null);
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleToggleVisibility(note: MonthlyNote) {
    const nextVisible = !note.visibleInReport;
    startTransition(async () => {
      try {
        await toggleMonthlyNoteVisibility(note.id, nextVisible);
        setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, visibleInReport: nextVisible } : n)));
        toast.success(nextVisible ? "리포트에 표시됩니다" : "리포트에서 숨겨졌습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "변경 실패");
      }
    });
  }

  function cancelForm() {
    setShowForm(false);
    clearFormDraft();
    setStudentQuery("");
  }

  return (
    <div className="flex flex-col gap-x4">
      {/* Header */}
      <Toolbar className="mb-0">
        <SearchField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="학생 이름, 내용으로 검색"
          aria-label="특이사항 검색"
        />
        {!showForm && (
          <Button variant="secondary" onClick={() => setShowForm(true)} className="sm:ml-auto">
            <Plus />
            특이사항 등록
          </Button>
        )}
      </Toolbar>

      {/* Add form */}
      {showForm && (
        <Section title="새 특이사항" description={`${year}년 ${month}월 노트에 추가돼요`}>
          <div className="flex flex-col gap-x4">
            <FormField label="학생" required>
              {/* Student search */}
              {!selectedStudent ? (
                <div className="flex flex-col gap-x2">
                  {!manualName && (
                    <Input
                      type="text"
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder="학생 이름 검색"
                      aria-label="학생 이름 검색"
                      autoFocus
                    />
                  )}
                  {studentQuery && (
                    <div className="max-h-44 overflow-y-auto rounded-r3 bg-bg-layer-floating py-x1 shadow-[var(--seed-shadow-s2)]">
                      {filteredStudents.length === 0 ? (
                        <div className="flex flex-wrap items-center gap-x1 px-x3 py-x2 t4-regular text-fg-neutral-subtle">
                          검색 결과가 없어요 —
                          <button
                            type="button"
                            className="t4-medium text-fg-brand underline-offset-4 hover:underline"
                            onClick={() => { setManualName(studentQuery); setStudentQuery(""); }}
                          >
                            &quot;{studentQuery}&quot; 직접 입력
                          </button>
                        </div>
                      ) : (
                        filteredStudents.slice(0, 8).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="flex w-full items-center gap-x2 px-x3 py-x2 text-left transition-colors hover:bg-bg-layer-default-pressed"
                            onClick={() => { setSelectedStudent(s); setStudentQuery(""); }}
                          >
                            <span className="t4-medium text-fg-neutral">{s.name}</span>
                            <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {manualName && (
                    <SelectedChip label={manualName} hint="직접 입력" onClear={() => setManualName("")} />
                  )}
                </div>
              ) : (
                <SelectedChip label={selectedStudent.name} hint={selectedStudent.grade} onClear={() => setSelectedStudent(null)} />
              )}
            </FormField>

            <FormField label="내용" required>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="어떤 일이 있었는지 적어 주세요"
                aria-label="특이사항 내용"
                rows={3}
                className="resize-none"
              />
            </FormField>

            <FormActions>
              <Button variant="secondary" onClick={cancelForm}>
                취소
              </Button>
              <Button
                onClick={handleAdd}
                disabled={isPending || (!selectedStudent && !manualName.trim()) || !content.trim()}
              >
                {isPending ? "등록 중…" : "등록"}
              </Button>
            </FormActions>
          </div>
        </Section>
      )}

      {/* Notes list */}
      <Section
        title={`${month}월 특이사항`}
        count={filteredNotes.length}
        description="리포트 표시를 끄면 월간 리포트에 나오지 않아요"
        flush
      >
        {filteredNotes.length === 0 ? (
          notes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title={`${month}월 특이사항이 없어요`}
              description="학생에게 있었던 일을 남겨 두면 월간 리포트에 함께 담겨요"
              action={
                !showForm ? (
                  <Button variant="secondary" onClick={() => setShowForm(true)}>
                    <Plus />
                    특이사항 등록
                  </Button>
                ) : undefined
              }
              className="border-t border-stroke-neutral-muted"
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="검색 결과가 없어요"
              description="학생 이름이나 내용을 다시 확인해 주세요"
              className="border-t border-stroke-neutral-muted"
            />
          )
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {filteredNotes.map((n) => (
              <li key={n.id} className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x2">
                    <span className="t5-bold text-fg-neutral">{n.studentName}</span>
                    <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                      {new Date(n.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} · {n.authorName}
                    </span>
                    {!n.visibleInReport && <StatusBadge>리포트 비표시</StatusBadge>}
                  </div>
                  <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral-muted">{n.content}</p>
                </div>
                <div className="flex shrink-0 items-center gap-x2">
                  <div
                    className="inline-flex items-center gap-x2"
                    title={n.visibleInReport ? "리포트에 표시됨 — 끄면 숨겨요" : "리포트에서 숨김 — 켜면 표시해요"}
                  >
                    <span className="t3-medium text-fg-neutral-muted">리포트 표시</span>
                    <Switch
                      size="24"
                      checked={n.visibleInReport}
                      disabled={isPending}
                      onCheckedChange={() => handleToggleVisibility(n)}
                      inputProps={{ "aria-label": `${n.studentName} 특이사항 리포트 표시` }}
                    />
                  </div>
                  {(n.authorId === currentUserId || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmId(n.id)}
                      aria-label="특이사항 삭제"
                      title="삭제"
                      className="size-8 hover:text-fg-critical"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmDialog
        open={deleteConfirmId != null}
        onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}
        title="이 특이사항을 삭제할까요?"
        description="삭제하면 되돌릴 수 없어요."
        pendingLabel="삭제하는 중…"
        pending={isPending}
        onConfirm={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); }}
      />
    </div>
  );
}

/** 선택된 학생(또는 직접 입력한 이름) 표시 + 지우기 */
function SelectedChip({ label, hint, onClear }: { label: string; hint?: string; onClear: () => void }) {
  return (
    <div className="flex h-10 items-center gap-x2 rounded-r2 bg-bg-brand-weak px-x3">
      <span className="t4-bold text-fg-neutral">{label}</span>
      {hint && <span className="t3-regular text-fg-neutral-subtle">{hint}</span>}
      <button
        type="button"
        onClick={onClear}
        aria-label={`${label} 선택 해제`}
        className="ml-auto grid size-7 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

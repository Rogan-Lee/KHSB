"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useDraft } from "@/hooks/use-draft";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { createMonthlyNote, deleteMonthlyNote } from "@/actions/monthly-notes";

type MonthlyNote = {
  id: string;
  year: number;
  month: number;
  studentId: string | null;
  studentName: string;
  content: string;
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

  const isAdmin = currentUserRole === "DIRECTOR" || currentUserRole === "ADMIN";

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="학생 이름, 내용으로 검색..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5 h-8 text-xs shrink-0">
          <Plus className="h-3.5 w-3.5" />
          특이사항 등록
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground">새 특이사항 등록</p>

          {/* Student search */}
          {!selectedStudent ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="학생 이름 검색..."
                className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {studentQuery && (
                <div className="border rounded-lg bg-popover shadow-md max-h-36 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      검색 결과 없음 —
                      <button
                        className="ml-1 text-primary underline"
                        onClick={() => { setManualName(studentQuery); setStudentQuery(""); }}
                      >
                        "{studentQuery}" 직접 입력
                      </button>
                    </div>
                  ) : (
                    filteredStudents.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                        onClick={() => { setSelectedStudent(s); setStudentQuery(""); }}
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground text-xs">{s.grade}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {manualName && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
                  <span className="text-sm font-medium flex-1">{manualName}</span>
                  <button onClick={() => setManualName("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium flex-1">{selectedStudent.name}</span>
              <span className="text-xs text-muted-foreground">{selectedStudent.grade}</span>
              <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="특이사항 내용..."
            rows={3}
            className="resize-none text-sm"
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={isPending || (!selectedStudent && !manualName.trim()) || !content.trim()}
              className="h-7 text-xs gap-1 flex-1"
            >
              <Plus className="h-3 w-3" />
              등록
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); clearFormDraft(); setStudentQuery(""); }} className="h-7 text-xs">
              취소
            </Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {notes.length === 0 ? `${month}월 특이사항이 없습니다` : "검색 결과가 없습니다"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotes.map((n) =>
            deleteConfirmId === n.id ? (
              <div key={n.id} className="rounded-xl border border-red-200 bg-red-50/60 p-3 flex items-center justify-between gap-3">
                <p className="text-sm text-red-700">이 특이사항을 삭제하시겠습니까?</p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(n.id)} disabled={isPending} className="h-7 text-xs">삭제</Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="h-7 text-xs">취소</Button>
                </div>
              </div>
            ) : (
              <div key={n.id} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{n.studentName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{n.authorName}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{n.content}</p>
                </div>
                {(n.authorId === currentUserId || isAdmin) && (
                  <button
                    onClick={() => setDeleteConfirmId(n.id)}
                    className={cn("p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-0.5")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

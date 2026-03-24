"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import {
  createMeetingMinutes,
  updateMeetingMinutes,
  deleteMeetingMinutes,
  markMeetingMinutesRead,
} from "@/actions/meeting-minutes";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Read = { userId: string; userName: string; readAt: Date };
type Minutes = {
  id: string;
  title: string;
  date: Date;
  content: string;
  attendees: string[];
  authorId: string;
  authorName: string;
  reads: Read[];
  createdAt: Date;
};

type Props = {
  initialMinutes: Minutes[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  staffList: { id: string; name: string }[];
};

export function MeetingMinutesBoard({
  initialMinutes,
  currentUserId,
  currentUserRole,
  staffList,
}: Props) {
  const [minutesList, setMinutesList] = useState<Minutes[]>(initialMinutes);
  const [expandedId, setExpandedId] = useState<string | null>(
    initialMinutes[0]?.id ?? null
  );
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = currentUserRole === "DIRECTOR" || currentUserRole === "ADMIN";

  // Form state
  const emptyForm = { title: "", date: todayStr(), content: "", attendees: [] as string[] };
  const [form, setForm] = useState(emptyForm);
  const [attendeeInput, setAttendeeInput] = useState("");

  function todayStr() {
    const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  function openNew() {
    setForm(emptyForm);
    setAttendeeInput("");
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(m: Minutes) {
    setForm({ title: m.title, date: m.date.toISOString().slice(0, 10), content: m.content, attendees: [...m.attendees] });
    setAttendeeInput("");
    setEditingId(m.id);
    setShowForm(true);
  }

  function addAttendee() {
    const name = attendeeInput.trim();
    if (!name || form.attendees.includes(name)) return;
    setForm((f) => ({ ...f, attendees: [...f.attendees, name] }));
    setAttendeeInput("");
  }

  function removeAttendee(name: string) {
    setForm((f) => ({ ...f, attendees: f.attendees.filter((a) => a !== name) }));
  }

  function addStaff(name: string) {
    if (!form.attendees.includes(name)) {
      setForm((f) => ({ ...f, attendees: [...f.attendees, name] }));
    }
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.date) {
      toast.error("제목과 날짜를 입력해주세요");
      return;
    }
    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await updateMeetingMinutes(editingId, form);
          setMinutesList((prev) => prev.map((m) => (m.id === editingId ? updated as Minutes : m)));
          toast.success("수정되었습니다");
        } else {
          const created = await createMeetingMinutes(form);
          setMinutesList((prev) => [created as Minutes, ...prev]);
          setExpandedId(created.id);
          toast.success("회의록이 등록되었습니다");
        }
        setShowForm(false);
        setEditingId(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteMeetingMinutes(id);
        setMinutesList((prev) => prev.filter((m) => m.id !== id));
        setDeleteConfirmId(null);
        if (expandedId === id) setExpandedId(null);
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleRead(id: string) {
    startTransition(async () => {
      try {
        await markMeetingMinutesRead(id);
        setMinutesList((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  reads: m.reads.some((r) => r.userId === currentUserId)
                    ? m.reads
                    : [...m.reads, { userId: currentUserId, userName: "나", readAt: new Date() }],
                }
              : m
          )
        );
      } catch {
        toast.error("확인 처리 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">회의록</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-sm bg-[#0066ff] text-white px-3 py-1.5 rounded-lg hover:bg-[#0052cc] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          새 회의록
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">{editingId ? "회의록 수정" : "새 회의록 작성"}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">제목 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="회의 제목"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">날짜 *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* 참석자 */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">참석자</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }}
                placeholder="이름 입력 후 Enter"
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addAttendee}
                className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors"
              >
                추가
              </button>
            </div>
            {/* 직원 빠른 추가 */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {staffList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addStaff(s.name)}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                    form.attendees.includes(s.name)
                      ? "bg-[#eaf2fe] border-[#c5d8fd] text-[#005eeb]"
                      : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {/* 선택된 참석자 */}
            {form.attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.attendees.map((name) => (
                  <span key={name} className="flex items-center gap-1 text-xs bg-[#eaf2fe] text-[#005eeb] px-2 py-0.5 rounded-full">
                    {name}
                    <button onClick={() => removeAttendee(name)} className="hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 내용 */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">회의 내용</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="회의 내용, 결정 사항, 액션 아이템 등을 입력하세요"
              rows={8}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="px-4 py-2 text-sm bg-[#0066ff] text-white rounded-lg hover:bg-[#0052cc] transition-colors disabled:opacity-50"
            >
              {editingId ? "수정 완료" : "등록"}
            </button>
          </div>
        </div>
      )}

      {/* 회의록 목록 */}
      {minutesList.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground text-sm">
          등록된 회의록이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {minutesList.map((m) => {
            const isExpanded = expandedId === m.id;
            const hasRead = m.reads.some((r) => r.userId === currentUserId);
            const canEdit = m.authorId === currentUserId || isAdmin;

            return (
              <div key={m.id} className={cn("rounded-xl border bg-card overflow-hidden transition-shadow", isExpanded && "shadow-sm")}>
                {/* 헤더 행 */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!hasRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0066ff] shrink-0" />
                      )}
                      <p className="text-sm font-semibold truncate">{m.title}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.date)}
                      </span>
                      <span className="text-xs text-muted-foreground">작성: {m.authorName}</span>
                      {m.attendees.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {m.attendees.slice(0, 3).join(", ")}
                          {m.attendees.length > 3 && ` 외 ${m.attendees.length - 3}명`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 읽음 배지 */}
                    {m.reads.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                        {m.reads.length}명 확인
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* 펼쳐진 내용 */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-4">
                    {/* 참석자 */}
                    {m.attendees.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.attendees.map((name) => (
                          <span key={name} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 내용 */}
                    <div className="text-sm whitespace-pre-wrap leading-relaxed text-[#1e2124]">
                      {m.content || <span className="text-muted-foreground italic">내용 없음</span>}
                    </div>

                    {/* 읽은 사람 목록 */}
                    {m.reads.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-[11px] text-muted-foreground mb-1.5">확인한 사람</p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.reads.map((r) => (
                            <span key={r.userId} className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                              {r.userName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 액션 버튼 */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-2">
                        {!hasRead && (
                          <button
                            onClick={() => handleRead(m.id)}
                            disabled={isPending}
                            className="flex items-center gap-1.5 text-xs text-[#0066ff] border border-[#c5d8fd] bg-[#eaf2fe] px-3 py-1.5 rounded-lg hover:bg-[#d0e6ff] transition-colors"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            확인했습니다
                          </button>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(m)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                            수정
                          </button>
                          {deleteConfirmId === m.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleDelete(m.id)}
                                disabled={isPending}
                                className="text-xs px-2.5 py-1.5 bg-destructive text-white rounded-lg"
                              >
                                삭제
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-muted"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(m.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              삭제
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

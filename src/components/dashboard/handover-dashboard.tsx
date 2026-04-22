"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, AlertTriangle, StickyNote, Pin,
  Plus, CheckSquare, Square, User, Send,
  Clock, ListChecks, MessageSquare, Pencil,
  ChevronDown, ChevronUp, Calendar, ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { markHandoverRead, toggleHandoverTask } from "@/actions/handover";
import { toggleTodo } from "@/actions/todos";
import { createMonthlyNote } from "@/actions/monthly-notes";

// ── Types ─────────────────────────────────────────────────────────────────────
type HandoverTask = { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number; isCompleted: boolean; completedAt: Date | null };
type HandoverChecklist = { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; order: number };
type HandoverRead = { userId: string; userName: string; readAt: Date };
type Handover = { id: string; date: Date; content: string; priority: "URGENT" | "NORMAL"; category: string | null; isPinned: boolean; authorId: string; authorName: string; reads: HandoverRead[]; tasks: HandoverTask[]; checklist: HandoverChecklist[]; createdAt: Date };
type ChecklistTemplate = { id: string; title: string; shiftType: string; order: number; isActive: boolean };
type MonthlyNote = { id: string; studentName: string; content: string; authorName: string; createdAt: Date };
type Student = { id: string; name: string; grade: string };
type Staff = { id: string; name: string; role: string };
type Todo = { id: string; title: string; content: string | null; dueDate: Date | null; priority: string; isCompleted: boolean; completedAt: Date | null; authorId: string; authorName: string; assigneeId: string | null; assigneeName: string | null; category: string | null; createdAt: Date };

interface Props {
  handovers: Handover[];
  templates: ChecklistTemplate[];
  monthlyNotes: MonthlyNote[];
  students: Student[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  year: number;
  month: number;
  todos: Todo[];
}

const SHIFT_COLOR: Record<string, string> = { OPEN: "bg-blue-50 text-blue-700 border-blue-200", CLOSE: "bg-purple-50 text-purple-700 border-purple-200", ALL: "bg-gray-50 text-gray-500 border-gray-200" };
const SHIFT_LABEL: Record<string, string> = { OPEN: "오픈", CLOSE: "마감", ALL: "공통" };

const DRAFT_KEY = "handover-form-draft";

function fmtDate(d: Date | null) {
  if (!d) return null;
  const date = new Date(d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}일 초과`;
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function isOverdue(d: Date | null, done: boolean) {
  if (!d || done) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(d) < today;
}

export function HandoverDashboard({ handovers, templates, monthlyNotes, students, staffList, currentUserId, currentUserName, year, month, todos }: Props) {
  const [isPending, startTransition] = useTransition();
  const [localHandovers, setLocalHandovers] = useState<Handover[]>(handovers);
  const [localTodos, setLocalTodos] = useState<Todo[]>(todos);
  const [localNotes, setLocalNotes] = useState<MonthlyNote[]>(monthlyNotes);

  // 이달 특이사항 빠른 등록
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteStudentName, setNoteStudentName] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // 섹션 접기/펼치기
  const [openSections, setOpenSections] = useState({ handoverTasks: true, routine: false, todos: true });
  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  }

  const unread = localHandovers.filter((h) => h.authorId !== currentUserId && !h.reads.some((r) => r.userId === currentUserId));

  // 나에게 배정된 인수인계 할 일
  type MyHandoverTask = HandoverTask & { handoverAuthorName: string; handoverDate: Date };
  const myHandoverTasks: MyHandoverTask[] = localHandovers
    .flatMap((h) => h.tasks.filter((t) => t.assigneeId === currentUserId).map((t) => ({ ...t, handoverAuthorName: h.authorName, handoverDate: h.date, isSelfAssigned: h.authorId === currentUserId })));

  // 루틴 체크리스트
  const prevHandover = localHandovers[0];
  const [routineItems, setRoutineItems] = useState<HandoverChecklist[]>(() =>
    prevHandover?.checklist.length
      ? prevHandover.checklist
      : templates.filter((t) => t.isActive).map((t, i) => ({ id: `t-${t.id}`, templateId: t.id, title: t.title, shiftType: t.shiftType, isChecked: false, order: i }))
  );

  // 내 투두 (미완료만 표시, 완료된 건 별도)
  const myPendingTodos = localTodos.filter((t) => !t.isCompleted);
  const myCompletedTodos = localTodos.filter((t) => t.isCompleted);

  // 전체 완료율
  const totalItems = myHandoverTasks.length + routineItems.length + myPendingTodos.length + myCompletedTodos.length;
  const doneItems = myHandoverTasks.filter((t) => t.isCompleted).length + routineItems.filter((c) => c.isChecked).length + myCompletedTodos.length;

  // 루틴 → localStorage 동기화
  useEffect(() => {
    try {
      const existing = localStorage.getItem(DRAFT_KEY);
      const parsed = existing ? JSON.parse(existing) : {};
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...parsed,
        checklist: routineItems.map((c) => ({ templateId: c.templateId, isChecked: c.isChecked })),
      }));
    } catch { /* ignore */ }
  }, [routineItems]);

  const filteredStudents = students.filter((s) => noteQuery && s.name.includes(noteQuery));

  function handleMarkRead(h: Handover) {
    startTransition(async () => {
      try {
        await markHandoverRead(h.id);
        setLocalHandovers((prev) => prev.map((item) => item.id === h.id ? { ...item, reads: [...item.reads, { userId: currentUserId, userName: currentUserName, readAt: new Date() }] } : item));
        toast.success("확인 완료");
      } catch { toast.error("처리 실패"); }
    });
  }

  function handleToggleHandoverTask(taskId: string) {
    startTransition(async () => {
      try {
        await toggleHandoverTask(taskId);
        setLocalHandovers((prev) => prev.map((h) => ({
          ...h,
          tasks: h.tasks.map((t) => t.id === taskId ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date() : null } : t),
        })));
      } catch { toast.error("처리 실패"); }
    });
  }

  function handleToggleTodo(todoId: string) {
    startTransition(async () => {
      try {
        await toggleTodo(todoId);
        setLocalTodos((prev) => prev.map((t) => t.id === todoId ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date() : null } : t));
      } catch { toast.error("처리 실패"); }
    });
  }

  function toggleRoutine(idx: number) {
    setRoutineItems((prev) => prev.map((c, i) => i === idx ? { ...c, isChecked: !c.isChecked } : c));
  }

  function handleAddNote() {
    if (!noteStudentName.trim() || !noteContent.trim()) return;
    startTransition(async () => {
      try {
        const created = await createMonthlyNote({ year, month, studentName: noteStudentName.trim(), content: noteContent.trim() });
        setLocalNotes((prev) => [created as MonthlyNote, ...prev]);
        setNoteStudentName(""); setNoteQuery(""); setNoteContent(""); setShowNoteForm(false);
        toast.success("특이사항이 등록되었습니다");
      } catch (err) { toast.error(err instanceof Error ? err.message : "등록 실패"); }
    });
  }

  return (
    <div className="space-y-4">
      {/* KPI 칩 */}
      <div className="grid grid-cols-3 gap-2">
        <KpiChip value={unread.length} label="미확인" color={unread.length > 0 ? "red" : "muted"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <KpiChip value={`${doneItems}/${totalItems}`} label="오늘 업무 완료" color={doneItems === totalItems && totalItems > 0 ? "green" : "muted"} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        <KpiChip value={localNotes.length} label="이달 특이사항" color="amber" icon={<StickyNote className="h-3.5 w-3.5" />} />
      </div>

      {/* 미확인 인수인계 배너 */}
      {unread.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-100">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-sm font-semibold text-red-700">미확인 인수인계 {unread.length}건</span>
            <Link href="/handover" className="ml-auto text-[11px] text-red-400 hover:text-red-600">전체보기 →</Link>
          </div>
          <div className="divide-y divide-red-100">
            {unread.slice(0, 2).map((h) => (
              <div key={h.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {h.isPinned && <Pin className="h-3 w-3 text-amber-400" />}
                    {h.priority === "URGENT" && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    <span className="text-[11px] text-muted-foreground">{h.authorName} · {new Date(h.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="text-sm font-medium line-clamp-1">{h.content || "(내용 없음)"}</p>
                </div>
                <button onClick={() => handleMarkRead(h)} disabled={isPending} className="shrink-0 flex items-center gap-1 text-xs bg-red-600 text-white rounded-md px-2.5 py-1.5 hover:bg-red-700 font-medium">
                  <CheckCircle2 className="h-3 w-3" />확인
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-col 메인 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

        {/* LEFT: 통합 오늘의 업무 + 인수인계 작성 + 최근 피드 */}
        <div className="space-y-3">

          {/* ── 오늘의 업무 헤더 ── */}
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold flex-1">오늘의 업무</span>
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border",
              totalItems > 0 && doneItems === totalItems ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"
            )}>{doneItems}/{totalItems} 완료</span>
          </div>

          {/* ── 오늘의 업무 3열 ── */}
          <div className="grid grid-cols-3 gap-3 items-stretch">

            {/* 1. 인수인계 할 일 */}
            <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <ListChecks className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold flex-1">인수인계 할 일</span>
                <span className="text-[10px] text-muted-foreground">{myHandoverTasks.filter((t) => t.isCompleted).length}/{myHandoverTasks.length}</span>
              </div>
              {myHandoverTasks.length === 0 ? (
                <div className="px-4 py-6 text-xs text-muted-foreground text-center flex-1 flex items-center justify-center">배정된 할 일 없음</div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto flex-1">
                  {myHandoverTasks.map((t) => (
                    <button key={t.id} type="button" onClick={() => handleToggleHandoverTask(t.id)} disabled={isPending}
                      className={cn("w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors", t.isCompleted && "opacity-50")}
                    >
                      {t.isCompleted ? <CheckSquare className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" /> : <Square className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs font-medium", t.isCompleted && "line-through text-muted-foreground")}>{t.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.handoverAuthorName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. 루틴 체크리스트 */}
            <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-semibold flex-1">루틴</span>
                <span className="text-[10px] text-muted-foreground">{routineItems.filter((c) => c.isChecked).length}/{routineItems.length}</span>
              </div>
              {routineItems.length === 0 ? (
                <div className="px-4 py-6 text-xs text-muted-foreground text-center flex-1 flex items-center justify-center">
                  루틴 없음 · <Link href="/handover" className="text-primary underline">관리</Link>
                </div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto flex-1">
                  {routineItems.map((item, i) => (
                    <button key={item.id} type="button" onClick={() => toggleRoutine(i)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors", item.isChecked && "opacity-50")}
                    >
                      {item.isChecked ? <CheckSquare className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Square className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                      <span className={cn("text-xs flex-1", item.isChecked && "line-through text-muted-foreground")}>{item.title}</span>
                      <span className={cn("text-[10px] border rounded px-1 py-0.5 shrink-0", SHIFT_COLOR[item.shiftType] ?? "")}>
                        {SHIFT_LABEL[item.shiftType] ?? item.shiftType}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. 투두리스트 */}
            <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <ListTodo className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs font-semibold flex-1">투두</span>
                <Link href="/todos" className="text-[10px] text-primary hover:underline">관리 →</Link>
              </div>
              {localTodos.length === 0 ? (
                <div className="px-4 py-6 text-xs text-muted-foreground text-center flex-1 flex items-center justify-center">
                  투두 없음 · <Link href="/todos" className="text-primary underline">추가</Link>
                </div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto flex-1">
                  {myPendingTodos.slice(0, 8).map((t) => (
                    <button key={t.id} type="button" onClick={() => handleToggleTodo(t.id)} disabled={isPending}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                    >
                      <Square className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{t.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {t.dueDate && (
                            <span className={cn("text-[10px]", isOverdue(t.dueDate, false) ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                              {fmtDate(t.dueDate)}
                            </span>
                          )}
                          {t.assigneeName && <span className="text-[10px] text-muted-foreground">{t.assigneeName}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {(myCompletedTodos.length > 0 || myPendingTodos.length > 8) && (
                    <div className="px-3 py-2 text-[10px] text-muted-foreground">
                      {myCompletedTodos.length > 0 && `완료 ${myCompletedTodos.length}개`}
                      {myPendingTodos.length > 8 && ` · +${myPendingTodos.length - 8}개 더`}
                      {" · "}<Link href="/todos" className="text-primary underline">전체 보기</Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 최근 인수인계 피드 */}
          <Panel
            title="최근 인수인계"
            icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
            action={<Link href="/handover" className="text-[11px] text-muted-foreground hover:text-foreground">전체보기 →</Link>}
          >
            {localHandovers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">인수인계 내역이 없습니다</p>
            ) : (
              <div className="divide-y">
                {localHandovers.slice(0, 5).map((h) => {
                  const isRead = h.reads.some((r) => r.userId === currentUserId);
                  const isAuthor = h.authorId === currentUserId;
                  const showUnread = !isRead && !isAuthor;
                  return (
                    <Link key={h.id} href="/handover">
                      <div className="flex items-start gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", showUnread ? "bg-primary" : "bg-transparent")} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm line-clamp-1", showUnread && "font-medium")}>{h.content || "(내용 없음)"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {h.tasks.length > 0 && <span className="text-[10px] text-blue-600">할 일 {h.tasks.length}</span>}
                            {h.checklist.length > 0 && <span className="text-[10px] text-green-600">루틴 {h.checklist.filter((c) => c.isChecked).length}/{h.checklist.length}</span>}
                            <span className="text-[10px] text-muted-foreground">{h.authorName}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{new Date(h.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                          </div>
                        </div>
                        {isRead && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* RIGHT: 이달 특이사항 */}
        <div className="space-y-3">
          <Panel
            title={`이달 특이사항 (${month}월)`}
            icon={<StickyNote className="h-3.5 w-3.5 text-amber-500" />}
            action={
              <button onClick={() => setShowNoteForm((p) => !p)} className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" />등록
              </button>
            }
          >
            {showNoteForm && (
              <div className="px-3 pt-2 pb-3 border-b space-y-2">
                <div className="relative">
                  <input type="text" value={noteQuery} onChange={(e) => { setNoteQuery(e.target.value); setNoteStudentName(e.target.value); }}
                    placeholder="학생 이름..." autoFocus
                    className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  {filteredStudents.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-popover border rounded-lg shadow-md max-h-28 overflow-y-auto">
                      {filteredStudents.slice(0, 4).map((s) => (
                        <button key={s.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex gap-2" onClick={() => { setNoteStudentName(s.name); setNoteQuery(s.name); }}>
                          <span className="font-medium">{s.name}</span><span className="text-muted-foreground text-xs">{s.grade}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="내용..." rows={2} className="resize-none text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddNote} disabled={isPending || !noteStudentName.trim() || !noteContent.trim()} className="h-7 text-xs flex-1 gap-1"><Plus className="h-3 w-3" />등록</Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowNoteForm(false); setNoteStudentName(""); setNoteQuery(""); setNoteContent(""); }} className="h-7 text-xs">취소</Button>
                </div>
              </div>
            )}
            {localNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-5">{month}월 특이사항 없음</p>
            ) : (
              <div className="divide-y max-h-56 overflow-y-auto">
                {localNotes.slice(0, 8).map((n) => (
                  <div key={n.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold">{n.studentName}</span>
                      <span className="text-[10px] text-muted-foreground">{n.authorName}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(n.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/80 line-clamp-2">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
            {localNotes.length > 8 && (
              <div className="px-4 py-2 border-t"><Link href="/handover" className="text-[11px] text-muted-foreground hover:text-primary">전체 {localNotes.length}개 →</Link></div>
            )}
          </Panel>

          {/* 빠른 이동 */}
          <div className="rounded-xl border bg-card p-3 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">바로가기</p>
            <Link href="/todos" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 text-sm transition-colors">
              <ListTodo className="h-3.5 w-3.5 text-purple-500" />
              <span>투두리스트 관리</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{localTodos.filter((t) => !t.isCompleted).length}개</span>
            </Link>
            <Link href="/handover" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 text-sm transition-colors">
              <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
              <span>인수인계 전체</span>
            </Link>
          </div>

          {/* 인수인계 작성 */}
          <Link href="/handover/new" className="block">
            <div className="rounded-xl border border-[#c0d9fc] bg-[#f0f6ff] hover:bg-[#e6f0ff] transition-colors px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Pencil className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">인수인계 작성</p>
                <p className="text-[10px] text-muted-foreground">루틴 {routineItems.filter((c) => c.isChecked).length}/{routineItems.length} 완료</p>
              </div>
              <Send className="h-3.5 w-3.5 text-primary shrink-0" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────────

function SectionHeader({ title, count, doneCount, icon, open, onToggle, action }: {
  title: string; count: number; doneCount: number; icon: React.ReactNode;
  open: boolean; onToggle: () => void; action?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/20 transition-colors border-b"
    >
      {icon}
      <span className="text-xs font-semibold text-muted-foreground flex-1 text-left">{title}</span>
      {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
        count > 0 && doneCount === count ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"
      )}>{doneCount}/{count}</span>
      {open ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
    </button>
  );
}

function KpiChip({ value, label, color, icon }: { value: number | string; label: string; color: "red" | "green" | "amber" | "blue" | "muted"; icon: React.ReactNode }) {
  const colors = { red: "bg-red-50 border-red-200 text-red-700", green: "bg-green-50 border-green-200 text-green-700", amber: "bg-amber-50 border-amber-200 text-amber-700", blue: "bg-blue-50 border-blue-200 text-blue-700", muted: "bg-muted border-border text-muted-foreground" };
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", colors[color])}>
      {icon}
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] mt-0.5 opacity-70 leading-tight">{label}</p>
      </div>
    </div>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        {icon}
        <span className="text-sm font-semibold flex-1">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

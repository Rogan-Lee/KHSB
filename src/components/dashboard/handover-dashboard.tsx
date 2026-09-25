"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, Pin, Plus, Pencil, ChevronLeft, ChevronRight, History,
  ListChecks, ListTodo, StickyNote, Inbox,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ListItem,
  Section,
  SectionLink,
  Skeleton,
  StatCard,
  StatCards,
  StatusBadge,
} from "@/components/backoffice/ui";
import { CheckRow, ShiftBadge, stripMarkdownPreview } from "@/components/handover/handover-ui";
import { markHandoverRead, toggleHandoverTask } from "@/actions/handover";
import { toggleTodo, getTodoVersions } from "@/actions/todos";
import { createMonthlyNote } from "@/actions/monthly-notes";

// ── Types ─────────────────────────────────────────────────────────────────────
type HandoverTask = { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number; isCompleted: boolean; completedAt: Date | null };
type HandoverChecklist = { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; order: number };
type HandoverRead = { userId: string; userName: string; readAt: Date; confirmedAt: Date | null };
type Handover = { id: string; date: Date; content: string; priority: "URGENT" | "NORMAL"; category: string | null; isPinned: boolean; authorId: string; authorName: string; reads: HandoverRead[]; tasks: HandoverTask[]; checklist: HandoverChecklist[]; createdAt: Date };
type ChecklistTemplate = { id: string; title: string; shiftType: string; order: number; isActive: boolean };
type MonthlyNote = { id: string; studentName: string; content: string; authorName: string; createdAt: Date };
type Student = { id: string; name: string; grade: string };
type Staff = { id: string; name: string; role: string };
type Todo = { id: string; title: string; content: string | null; dueDate: Date | null; priority: string; isCompleted: boolean; completedAt: Date | null; authorId: string; authorName: string; assigneeId: string | null; assigneeName: string | null; category: string | null; createdAt: Date; lastEditorId?: string | null; lastEditorName?: string | null; lastEditedAt?: Date | null };

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

function fmtMonthDay(d: Date) {
  return new Date(d).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function HandoverDashboard({ handovers, templates, monthlyNotes, students, currentUserId, currentUserName, year, month, todos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localHandovers, setLocalHandovers] = useState<Handover[]>(handovers);
  const [localTodos, setLocalTodos] = useState<Todo[]>(todos);
  const [localNotes, setLocalNotes] = useState<MonthlyNote[]>(monthlyNotes);
  const [unreadIdx, setUnreadIdx] = useState(0);

  // 이달 특이사항 빠른 등록
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteStudentName, setNoteStudentName] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const [historyTodo, setHistoryTodo] = useState<Todo | null>(null);

  const unread = localHandovers.filter((h) => h.authorId !== currentUserId && !h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null));
  // 목록이 줄어들면 인덱스는 렌더 시점에 범위 안으로 맞춘다(아래 idx 계산)

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
  const routineDone = routineItems.filter((c) => c.isChecked).length;

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
        setLocalHandovers((prev) => prev.map((item) => {
          if (item.id !== h.id) return item;
          const has = item.reads.some((r) => r.userId === currentUserId);
          const reads = has
            ? item.reads.map((r) => r.userId === currentUserId ? { ...r, confirmedAt: new Date() } : r)
            : [...item.reads, { userId: currentUserId, userName: currentUserName, readAt: new Date(), confirmedAt: new Date() }];
          return { ...item, reads };
        }));
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

  function cancelNote() {
    setShowNoteForm(false); setNoteStudentName(""); setNoteQuery(""); setNoteContent("");
  }

  const allDone = totalItems > 0 && doneItems === totalItems;
  const myTaskDone = myHandoverTasks.filter((t) => t.isCompleted).length;

  return (
    <div className="flex flex-col gap-x6">
      {/* 요약 */}
      <StatCards cols={3}>
        <StatCard label="미확인 인수인계" value={unread.length} unit="건" tone={unread.length > 0 ? "warn" : "gray"} />
        <StatCard
          label="오늘 업무 완료"
          value={doneItems}
          unit={`/ ${totalItems}`}
          tone={allDone ? "ok" : "gray"}
          sub="할 일 · 루틴 · 투두 합계"
        />
        <StatCard label={`${month}월 특이사항`} value={localNotes.length} unit="건" className="col-span-2 lg:col-span-1" />
      </StatCards>

      {/* 미확인 인수인계 — 좌우로 넘기며 글 본문 전체를 인라인으로 (클릭 시 상세) */}
      {unread.length > 0 && (() => {
        const idx = Math.min(Math.max(0, unreadIdx), unread.length - 1);
        const h = unread[idx];
        return (
          <Section
            title="미확인 인수인계"
            count={unread.length}
            actions={
              <>
                <div className="flex items-center gap-x1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUnreadIdx(() => Math.max(0, idx - 1))}
                    disabled={idx === 0}
                    aria-label="이전 인수인계"
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-10 text-center t4-medium tabular-nums text-fg-neutral-muted">
                    {idx + 1} / {unread.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUnreadIdx(() => Math.min(unread.length - 1, idx + 1))}
                    disabled={idx >= unread.length - 1}
                    aria-label="다음 인수인계"
                  >
                    <ChevronRight />
                  </Button>
                </div>
                <SectionLink href="/handover">전체 보기</SectionLink>
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-x2">
              {h.isPinned && <StatusBadge tone="warn"><Pin />고정</StatusBadge>}
              {h.priority === "URGENT" && <StatusBadge tone="bad">긴급</StatusBadge>}
              {h.category && <StatusBadge>{h.category}</StatusBadge>}
              <span className="t3-regular text-fg-neutral-subtle">
                {h.authorName} · {fmtMonthDay(h.date)}
              </span>
              <Button size="sm" onClick={() => handleMarkRead(h)} disabled={isPending} className="ml-auto">
                <CheckCircle2 />
                확인
              </Button>
            </div>
            <div
              onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("button") || t.closest("a")) return; router.push(`/handover/${h.id}`); }}
              className="mt-x3 max-h-80 cursor-pointer overflow-y-auto rounded-r3 bg-bg-layer-fill px-x4 py-x3 t4-regular text-fg-neutral transition-colors hover:bg-bg-neutral-weak"
              title="눌러서 상세 보기"
            >
              {h.content ? <MarkdownViewer source={h.content} /> : <span className="text-fg-neutral-subtle">(내용 없음)</span>}
            </div>
          </Section>
        );
      })()}

      {/* 오늘의 업무 — 인수인계 할 일 · 루틴 · 투두 */}
      <Section
        variant="plain"
        title="오늘의 업무"
        actions={
          <StatusBadge tone={allDone ? "ok" : "gray"} size="large">
            {doneItems}/{totalItems} 완료
          </StatusBadge>
        }
      >
        <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-3">
          {/* 1. 인수인계 할 일 */}
          <Section
            title="인수인계 할 일"
            actions={<span className="t4-medium tabular-nums text-fg-neutral-subtle">{myTaskDone}/{myHandoverTasks.length}</span>}
            flush
          >
            {myHandoverTasks.length === 0 ? (
              <EmptyState compact icon={ListChecks} title="배정된 할 일이 없어요" className="border-t border-stroke-neutral-muted" />
            ) : (
              <ul className="max-h-96 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {myHandoverTasks.map((t) => (
                  <li key={t.id}>
                    <CheckRow
                      checked={t.isCompleted}
                      onToggle={() => handleToggleHandoverTask(t.id)}
                      disabled={isPending}
                      title={t.title}
                      description={t.handoverAuthorName}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 2. 루틴 체크리스트 */}
          <Section
            title="루틴"
            actions={
              <>
                <span className="t4-medium tabular-nums text-fg-neutral-subtle">{routineDone}/{routineItems.length}</span>
                <SectionLink href="/todos?tab=routine">관리</SectionLink>
              </>
            }
            flush
          >
            {routineItems.length === 0 ? (
              <EmptyState
                compact
                icon={ListChecks}
                title="등록된 루틴이 없어요"
                action={
                  <Button asChild variant="secondary" size="xs">
                    <Link href="/todos?tab=routine">루틴 관리</Link>
                  </Button>
                }
                className="border-t border-stroke-neutral-muted"
              />
            ) : (
              <ul className="max-h-96 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {routineItems.map((item, i) => (
                  <li key={item.id}>
                    <CheckRow
                      checked={item.isChecked}
                      onToggle={() => toggleRoutine(i)}
                      title={item.title}
                      trailing={<ShiftBadge shiftType={item.shiftType} />}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 3. 투두리스트 */}
          <Section
            title="투두"
            actions={<SectionLink href="/todos">관리</SectionLink>}
            flush
          >
            {localTodos.length === 0 ? (
              <EmptyState
                compact
                icon={ListTodo}
                title="할 일이 없어요"
                action={
                  <Button asChild variant="secondary" size="xs">
                    <Link href="/todos"><Plus />할 일 추가</Link>
                  </Button>
                }
                className="border-t border-stroke-neutral-muted"
              />
            ) : (
              <div className="border-t border-stroke-neutral-muted">
                {myPendingTodos.length === 0 ? (
                  <EmptyState compact icon={CheckCircle2} title="남은 할 일을 모두 끝냈어요" />
                ) : (
                  <ul className="max-h-96 divide-y divide-stroke-neutral-muted overflow-y-auto">
                    {myPendingTodos.slice(0, 8).map((t) => (
                      <li key={t.id}>
                        <CheckRow
                          checked={false}
                          onToggle={() => handleToggleTodo(t.id)}
                          disabled={isPending}
                          title={t.title}
                          className="pr-x2"
                          description={
                            (t.dueDate || t.assigneeName) ? (
                              <span className="flex flex-wrap items-center gap-x-x2">
                                {t.dueDate && (
                                  <span className={cn("tabular-nums", isOverdue(t.dueDate, false) && "t3-bold text-fg-critical")}>
                                    {fmtDate(t.dueDate)}
                                  </span>
                                )}
                                {t.assigneeName && <span>{t.assigneeName}</span>}
                              </span>
                            ) : undefined
                          }
                          action={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setHistoryTodo(t)}
                              title="수정 이력"
                              aria-label={`${t.title} 수정 이력`}
                              className="size-8"
                            >
                              <History />
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {(myCompletedTodos.length > 0 || myPendingTodos.length > 8) && (
                  <div className="flex items-center gap-x1 border-t border-stroke-neutral-muted px-x5 py-x3 t3-regular text-fg-neutral-subtle">
                    <span className="tabular-nums">
                      {myCompletedTodos.length > 0 && `완료 ${myCompletedTodos.length}개`}
                      {myCompletedTodos.length > 0 && myPendingTodos.length > 8 && " · "}
                      {myPendingTodos.length > 8 && `+${myPendingTodos.length - 8}개 더`}
                    </span>
                    <Link href="/todos" className="ml-auto t3-medium text-fg-neutral-muted hover:text-fg-neutral">
                      전체 보기
                    </Link>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>
      </Section>

      {/* 최근 인수인계 + 오른쪽 레일 */}
      <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 최근 인수인계 피드 */}
        <Section
          title="최근 인수인계"
          actions={<SectionLink href="/handover">전체 보기</SectionLink>}
          flush
          className="min-w-0"
        >
          {localHandovers.length === 0 ? (
            <EmptyState
              compact
              icon={Inbox}
              title="아직 인수인계가 없어요"
              description="오늘 근무 내용을 남기면 다음 근무자가 바로 확인할 수 있어요"
              className="border-t border-stroke-neutral-muted"
            />
          ) : (
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              {localHandovers.slice(0, 5).map((h) => {
                const isRead = h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null);
                const isAuthor = h.authorId === currentUserId;
                const showUnread = !isRead && !isAuthor;
                return (
                  <li key={h.id}>
                    <ListItem
                      href="/handover"
                      leading={
                        <span
                          aria-hidden
                          className={cn("size-x2 shrink-0 rounded-full", showUnread ? "bg-bg-brand-solid" : "bg-transparent")}
                        />
                      }
                      title={
                        <span className={showUnread ? undefined : "t4-regular text-fg-neutral-muted"}>
                          {showUnread && <span className="sr-only">새 글 </span>}
                          {stripMarkdownPreview(h.content, 120) || "(내용 없음)"}
                        </span>
                      }
                      description={
                        <span className="flex items-center gap-x2">
                          {h.tasks.length > 0 && <span>할 일 {h.tasks.length}</span>}
                          {h.checklist.length > 0 && <span className="tabular-nums">루틴 {h.checklist.filter((c) => c.isChecked).length}/{h.checklist.length}</span>}
                          <span>{h.authorName}</span>
                        </span>
                      }
                      trailing={
                        <>
                          <span className="tabular-nums">{fmtMonthDay(h.date)}</span>
                          {isRead && <CheckCircle2 className="size-4 text-fg-positive" aria-label="확인함" />}
                        </>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* RIGHT: 인수인계 작성 · 이달 특이사항 · 바로가기 */}
        <div className="flex min-w-0 flex-col gap-x4">
          <Section
            title="인수인계 작성"
            description={`루틴 ${routineDone}/${routineItems.length} 완료`}
            actions={
              <Button asChild size="sm">
                <Link href="/handover/new"><Pencil />작성</Link>
              </Button>
            }
            className="pb-x1"
          />

          <Section
            title={`${month}월 특이사항`}
            count={localNotes.length}
            actions={
              !showNoteForm ? (
                <Button variant="ghost" size="xs" onClick={() => setShowNoteForm(true)}>
                  <Plus />등록
                </Button>
              ) : undefined
            }
            flush
          >
            {showNoteForm && (
              <div className="flex flex-col gap-x2 border-t border-stroke-neutral-muted px-x5 py-x4">
                <div className="relative">
                  <Input
                    type="text"
                    value={noteQuery}
                    onChange={(e) => { setNoteQuery(e.target.value); setNoteStudentName(e.target.value); }}
                    placeholder="학생 이름"
                    aria-label="학생 이름"
                    autoFocus
                  />
                  {filteredStudents.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-x1 max-h-40 overflow-y-auto rounded-r3 bg-bg-layer-floating py-x1 shadow-[var(--seed-shadow-s2)]">
                      {filteredStudents.slice(0, 4).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="flex w-full items-center gap-x2 px-x3 py-x2 text-left t4-regular hover:bg-bg-layer-default-pressed"
                          onClick={() => { setNoteStudentName(s.name); setNoteQuery(s.name); }}
                        >
                          <span className="t4-medium text-fg-neutral">{s.name}</span>
                          <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="어떤 일이 있었나요?"
                  aria-label="특이사항 내용"
                  rows={2}
                  className="resize-none"
                />
                <div className="flex justify-end gap-x2">
                  <Button size="sm" variant="secondary" onClick={cancelNote}>취소</Button>
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={isPending || !noteStudentName.trim() || !noteContent.trim()}
                  >
                    {isPending ? "등록 중…" : "등록"}
                  </Button>
                </div>
              </div>
            )}
            {localNotes.length === 0 ? (
              !showNoteForm && (
                <EmptyState
                  compact
                  icon={StickyNote}
                  title={`${month}월 특이사항이 없어요`}
                  className="border-t border-stroke-neutral-muted"
                />
              )
            ) : (
              <ul className="max-h-72 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {localNotes.slice(0, 8).map((n) => (
                  <li key={n.id} className="px-x5 py-x3">
                    <div className="flex items-center gap-x1_5">
                      <span className="t4-bold text-fg-neutral">{n.studentName}</span>
                      <span className="t3-regular text-fg-neutral-subtle">{n.authorName}</span>
                      <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">{fmtMonthDay(n.createdAt)}</span>
                    </div>
                    <p className="mt-x0_5 line-clamp-2 t4-regular text-fg-neutral-muted">{n.content}</p>
                  </li>
                ))}
              </ul>
            )}
            {localNotes.length > 8 && (
              <div className="border-t border-stroke-neutral-muted px-x5 py-x3">
                <Link href="/handover" className="t3-medium text-fg-neutral-muted hover:text-fg-neutral">
                  전체 {localNotes.length}개 보기
                </Link>
              </div>
            )}
          </Section>

          {/* 빠른 이동 */}
          <Section title="바로가기" flush>
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              <li>
                <ListItem
                  href="/todos"
                  title="투두리스트 관리"
                  trailing={<span className="tabular-nums">{localTodos.filter((t) => !t.isCompleted).length}개</span>}
                />
              </li>
              <li>
                <ListItem href="/handover" title="인수인계 전체" />
              </li>
            </ul>
          </Section>
        </div>
      </div>

      {historyTodo && (
        <TodoHistoryDialog todo={historyTodo} onClose={() => setHistoryTodo(null)} />
      )}
    </div>
  );
}

// ── 투두 수정 이력 다이얼로그 ─────────────────────────────────────────────────
type TodoVersionRow = {
  id: string;
  version: number;
  title: string;
  content: string | null;
  dueDate: Date | null;
  priority: string;
  editorName: string;
  createdAt: Date;
};

function fmtDateTimeLong(d: Date | string) {
  return new Date(d).toLocaleString("ko-KR", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function TodoHistoryDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const [rows, setRows] = useState<TodoVersionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodoVersions(todo.id)
      .then((r) => { if (!cancelled) setRows(r as unknown as TodoVersionRow[]); })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : "불러오기 실패"); });
    return () => { cancelled = true; };
  }, [todo.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="t6-bold">수정 이력</DialogTitle>
          <DialogDescription className="truncate">{todo.title}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {err && <p className="py-x4 text-center t4-regular text-fg-critical">{err}</p>}
          {!rows && !err && (
            <div className="flex flex-col gap-x2" aria-busy="true" aria-label="불러오는 중">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {rows && (
            <ol className="flex flex-col gap-x2">
              {/* 현재 상태 (라이브) */}
              <li className="rounded-r3 bg-bg-positive-weak p-x4">
                <div className="mb-x1 flex items-center gap-x2">
                  <StatusBadge tone="ok" solid>현재</StatusBadge>
                  <span className="t3-bold text-fg-neutral">{todo.lastEditorName ?? todo.authorName}</span>
                  <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
                    {fmtDateTimeLong(todo.lastEditedAt ?? todo.createdAt)}
                  </span>
                </div>
                <p className="t4-medium text-fg-neutral">{todo.title}</p>
                {todo.content && <p className="mt-x1 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{todo.content}</p>}
              </li>

              {/* 과거 버전 */}
              {rows.map((v) => (
                <li key={v.id} className="rounded-r3 bg-bg-layer-fill p-x4">
                  <div className="mb-x1 flex items-center gap-x2">
                    <StatusBadge tone={v.version === 1 ? "brand" : "gray"}>
                      v{v.version}{v.version === 1 && " · 최초"}
                    </StatusBadge>
                    <span className="t3-bold text-fg-neutral">{v.editorName}</span>
                    <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">{fmtDateTimeLong(v.createdAt)}</span>
                  </div>
                  <p className="t4-medium text-fg-neutral">{v.title}</p>
                  {v.content && <p className="mt-x1 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{v.content}</p>}
                </li>
              ))}
              {rows.length === 0 && (
                <li className="py-x2 text-center t3-regular text-fg-neutral-subtle">과거 수정 이력이 없어요</li>
              )}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

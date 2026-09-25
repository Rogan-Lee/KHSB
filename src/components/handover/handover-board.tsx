"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import {
  Pin, PinOff, CheckCircle2, Trash2, Eye, ListChecks, Users, CheckSquare,
  ChevronLeft, ChevronRight, Inbox, CalendarCheck,
} from "lucide-react";
import { cn, DAY_NAMES, todayKST } from "@/lib/utils";
import { deleteHandover, markHandoverRead, togglePin, toggleHandoverTask, recordHandoverView } from "@/actions/handover";
import { toggleRoutineCompletion } from "@/actions/checklist-templates";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TodoForm } from "@/components/todos/todo-manager";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { DateRangeToolbar } from "@/components/ui/date-range-toolbar";
import {
  Avatar,
  EmptyState,
  ListItem,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
  Toolbar,
} from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { CheckRow, ShiftBadge, stripMarkdownPreview } from "@/components/handover/handover-ui";

// ── Types ─────────────────────────────────────────────────────────────────────
type HandoverTask = { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number; isCompleted: boolean; completedAt: Date | null };
type HandoverChecklist = { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; checkedAt: Date | null; checkedById: string | null; checkedByName: string | null; order: number };
type HandoverRead = { userId: string; userName: string; readAt: Date; confirmedAt: Date | null };
type Handover = { id: string; date: Date; content: string; priority: "URGENT" | "NORMAL"; category: string | null; isPinned: boolean; authorId: string; authorName: string; recipientId: string | null; recipientName: string | null; reads: HandoverRead[]; tasks: HandoverTask[]; checklist: HandoverChecklist[]; monthlyNotesSnapshot: object | null; createdAt: Date };
type Staff = { id: string; name: string; role: string };
type RoutineTemplate = { id: string; title: string; shiftType: string; days: string; isActive: boolean; order: number };

const SHIFT_ORDER = ["ALL", "OPEN", "CLOSE"];

interface Props {
  initialHandovers: Handover[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  templates: RoutineTemplate[];
  /** 오늘 완료된 루틴 templateId 목록 */
  completedToday: string[];
  /** 오늘 날짜 ISO(YYYY-MM-DD, KST) */
  todayIso: string;
  /** 서버 조회 범위 (URL ?from=&to=). 기본 최근 60일~오늘+14일 */
  initialDateFrom: string;
  initialDateTo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(d: Date) {
  const date = new Date(d); const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const t = new Date(date); t.setHours(0, 0, 0, 0);
  if (t.getTime() === today.getTime()) return "오늘";
  if (t.getTime() === yest.getTime()) return "어제";
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
}
function fmtTime(d: Date) { return new Date(d).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); }

// ── Readers popover ───────────────────────────────────────────────────────────
function ReadersPopover({ reads, onClose }: { reads: HandoverRead[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [onClose]);
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-x1 w-56 rounded-r3 bg-bg-layer-floating p-x3 shadow-[var(--seed-shadow-s2)]">
      <p className="mb-x2 t3-bold text-fg-neutral">확인한 사람</p>
      {reads.length === 0 ? <p className="t3-regular text-fg-neutral-subtle">아직 없어요</p> : (
        <ul className="flex flex-col gap-x1_5">
          {reads.map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-x2 t3-regular">
              <span className="t3-medium text-fg-neutral">{r.userName}</span>
              <span className="tabular-nums text-fg-neutral-subtle">{new Date(r.readAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Summary card (슬랙/노션 스타일) ──────────────────────────────────────────
function HandoverSummaryCard({ h, currentUserId, onDelete, onRead, onTogglePin, isPending, defaultExpanded = false }: {
  h: Handover; currentUserId: string; currentUserName: string; onDelete: (id: string) => void; onRead: (h: Handover) => void; onTogglePin: (h: Handover) => void; isPending: boolean; defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const [showReaders, setShowReaders] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  // 짧은 한 줄 메모는 굳이 더보기 버튼을 달지 않는다
  const isLong = h.content.length > 160 || h.content.includes("\n");
  // isRead = "확인함". 단순 열람(confirmedAt null)은 확인으로 치지 않는다.
  const isRead = h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null);
  const confirmedReads = h.reads.filter((r) => r.confirmedAt != null);
  const isAuthor = h.authorId === currentUserId;
  const isUrgent = h.priority === "URGENT";
  const checkedCount = h.checklist.filter((c) => c.isChecked).length;
  const completedTasks = h.tasks.filter((t) => t.isCompleted).length;

  const recipientIds: string[] = h.recipientId ? (() => { try { const p = JSON.parse(h.recipientId); return Array.isArray(p) ? p : [h.recipientId]; } catch { return [h.recipientId]; } })() : [];
  const recipientNames: string[] = h.recipientName ? (() => { try { const p = JSON.parse(h.recipientName); return Array.isArray(p) ? p : [h.recipientName]; } catch { return [h.recipientName]; } })() : [];
  const isRecipient = recipientIds.includes(currentUserId);
  const needsMyConfirm = isRecipient && !isRead;
  const confirmedCount = recipientIds.filter((rid) => h.reads.some((r) => r.userId === rid && r.confirmedAt != null)).length;

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    router.push(`/handover/${h.id}`);
  }

  return (
    <div onClick={handleCardClick} className="flex cursor-pointer gap-x3">
      {/* 아바타 */}
      <Avatar name={h.authorName} size={40} />

      {/* 메시지 본문 */}
      <div className="min-w-0 flex-1">
        {/* 이름 + 시간 + 배지 */}
        <div className="flex flex-wrap items-center gap-x1_5">
          <span className="t5-bold text-fg-neutral">{h.authorName}</span>
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">{fmtTime(h.createdAt)}</span>
          {h.isPinned && <StatusBadge tone="warn"><Pin />고정</StatusBadge>}
          {isUrgent && <StatusBadge tone="bad">긴급</StatusBadge>}
          {h.category && <StatusBadge>{h.category}</StatusBadge>}
          {!isRead && !isAuthor && <StatusBadge tone="brand" solid>새 글</StatusBadge>}
          {needsMyConfirm && <StatusBadge tone="info">나에게 전달됨</StatusBadge>}
        </div>

        {/* 본문 — 카드에서 가장 눈에 띄는 요소. 펼치면 Markdown 원본을 인라인 렌더 */}
        {h.content && (
          <div className="mt-x2">
            {expanded ? (
              <div onClick={(e) => e.stopPropagation()} className="max-h-[26rem] cursor-auto overflow-y-auto pr-x1 t5-regular text-fg-neutral">
                <MarkdownViewer source={h.content} />
              </div>
            ) : (
              <p className="line-clamp-4 whitespace-pre-wrap t5-regular text-fg-neutral">
                {stripMarkdownPreview(h.content, 280)}
              </p>
            )}
            {isLong && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
                className="mt-x1 t4-medium text-fg-neutral-muted underline-offset-4 hover:text-fg-neutral hover:underline"
              >
                {expanded ? "접기" : "더보기"}
              </button>
            )}
          </div>
        )}

        {/* 하단 정보 */}
        <div className="mt-x3 flex flex-wrap items-center gap-x-x3 gap-y-x1_5 t3-regular text-fg-neutral-subtle">
          {h.tasks.length > 0 && (
            <span className="inline-flex items-center gap-x1 tabular-nums">
              <ListChecks className="size-3.5" aria-hidden />할 일 {completedTasks}/{h.tasks.length}
            </span>
          )}
          {h.checklist.length > 0 && (
            <span className="inline-flex items-center gap-x1 tabular-nums">
              <CheckSquare className="size-3.5" aria-hidden />루틴 {checkedCount}/{h.checklist.length}
            </span>
          )}
          {recipientNames.length > 0 && (
            <span className="inline-flex items-center gap-x1 tabular-nums">
              <Users className="size-3.5" aria-hidden />
              {confirmedCount}/{recipientNames.length}명 확인
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReaders((p) => !p)}
              aria-expanded={showReaders}
              aria-label={`확인한 사람 ${confirmedReads.length}명 보기`}
              className="inline-flex items-center gap-x1 rounded-r2 px-x1 py-x0_5 tabular-nums transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
            >
              <Eye className="size-3.5" aria-hidden />{confirmedReads.length}
            </button>
            {showReaders && <ReadersPopover reads={confirmedReads} onClose={() => setShowReaders(false)} />}
          </div>

          {/* 수신자 확인 현황 */}
          {recipientNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-x1">
              {recipientNames.map((name, idx) => {
                const rid = recipientIds[idx];
                const rRead = rid ? h.reads.find((r) => r.userId === rid && r.confirmedAt != null) : null;
                return (
                  <StatusBadge key={idx} tone={rRead ? "ok" : "gray"}>
                    {name}{rRead ? " ✓" : ""}
                  </StatusBadge>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 액션 */}
      <div className="flex shrink-0 flex-col items-end gap-x1_5">
        {isAuthor ? (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTogglePin(h)}
              disabled={isPending}
              aria-label={h.isPinned ? "고정 해제" : "상단 고정"}
              title={h.isPinned ? "고정 해제" : "상단 고정"}
              className="size-8"
            >
              {h.isPinned ? <PinOff /> : <Pin />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(h.id)}
              aria-label="삭제"
              title="삭제"
              className="size-8 hover:text-fg-critical"
            >
              <Trash2 />
            </Button>
          </div>
        ) : isRead ? (
          <span className="inline-flex items-center gap-x1 t3-medium text-fg-positive">
            <CheckCircle2 className="size-4" aria-hidden />확인함
          </span>
        ) : (
          <Button size="sm" onClick={() => onRead(h)} disabled={isPending}>
            확인
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
export function HandoverBoard({ initialHandovers, staffList, currentUserId, currentUserName, currentUserRole, templates, completedToday, todayIso, initialDateFrom, initialDateTo }: Props) {
  const [handovers, setHandovers] = useState<Handover[]>(initialHandovers);
  // initialHandovers가 바뀌면 (searchParams 변경 시) 상태 동기화
  useEffect(() => { setHandovers(initialHandovers); }, [initialHandovers]);
  const [isPending, startTransition] = useTransition();

  // 오늘의 루틴 완료 상태 (templateId Set)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set(completedToday));
  useEffect(() => { setCompleted(new Set(completedToday)); }, [completedToday]);
  // 할 일 추가 모달
  const [todoModalOpen, setTodoModalOpen] = useState(false);

  function toggleRoutine(templateId: string) {
    // 낙관적 토글
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
      return next;
    });
    startTransition(async () => {
      try {
        await toggleRoutineCompletion(templateId, todayIso);
      } catch {
        toast.error("처리 실패");
        setCompleted((prev) => {
          const next = new Set(prev);
          if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
          return next;
        });
      }
    });
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 정렬: 고정 먼저 → 날짜(최신) → 작성시각(최신)
  const sorted = [...handovers].sort((a, b) => {
    const dd = new Date(b.date).getTime() - new Date(a.date).getTime();
    return dd !== 0 ? dd : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const pinned = sorted.filter((h) => h.isPinned);
  const byDate = sorted.filter((h) => !h.isPinned);
  const ordered = [...pinned, ...byDate];
  const unreadCount = handovers.filter((h) => h.authorId !== currentUserId && !h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null)).length;

  // 좌우로 넘겨보는 포커스 뷰어 인덱스
  const [focusedIndex, setFocusedIndex] = useState(0);
  useEffect(() => {
    setFocusedIndex((i) => Math.min(Math.max(0, i), Math.max(0, ordered.length - 1)));
  }, [ordered.length]);
  const focused = ordered[focusedIndex];

  // 5개씩 페이지네이션 리스트
  const PAGE_SIZE = 5;
  const [listPage, setListPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  useEffect(() => { setListPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);

  // 뷰어에 뜬 인수인계는 "열람(봤음)" 로그 자동 기록 (confirmedAt 은 건드리지 않음)
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!focused || viewedRef.current.has(focused.id)) return;
    const id = focused.id;
    viewedRef.current.add(id);
    recordHandoverView(id)
      .then(() => setHandovers((prev) => prev.map((it) =>
        it.id !== id || it.reads.some((r) => r.userId === currentUserId)
          ? it
          : { ...it, reads: [...it.reads, { userId: currentUserId, userName: currentUserName, readAt: new Date(), confirmedAt: null }] }
      )))
      .catch(() => {});
  }, [focused?.id, currentUserId, currentUserName]);

  // 리스트 행 클릭 → 뷰어로 포커스 (해당 페이지도 이동)
  function focusHandover(id: string) {
    const idx = ordered.findIndex((h) => h.id === id);
    if (idx >= 0) { setFocusedIndex(idx); setListPage(Math.floor(idx / PAGE_SIZE)); }
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try { await deleteHandover(id); setHandovers((prev) => prev.filter((h) => h.id !== id)); setDeleteConfirmId(null); toast.success("삭제되었습니다"); }
      catch (err) { toast.error(err instanceof Error ? err.message : "삭제 실패"); }
    });
  }

  function handleToggleTask(taskId: string) {
    startTransition(async () => {
      try {
        await toggleHandoverTask(taskId);
        setHandovers((prev) => prev.map((h) => ({
          ...h,
          tasks: h.tasks.map((t) => t.id === taskId ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date() : null } : t),
        })));
      } catch { toast.error("처리 실패"); }
    });
  }

  function handleRead(h: Handover) {
    if (h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null)) return;
    startTransition(async () => {
      try {
        await markHandoverRead(h.id);
        setHandovers((prev) => prev.map((item) => {
          if (item.id !== h.id) return item;
          const has = item.reads.some((r) => r.userId === currentUserId);
          const reads = has
            ? item.reads.map((r) => r.userId === currentUserId ? { ...r, confirmedAt: new Date() } : r)
            : [...item.reads, { userId: currentUserId, userName: currentUserName, readAt: new Date(), confirmedAt: new Date() }];
          return { ...item, reads };
        }));
      }
      catch { toast.error("확인 처리 실패"); }
    });
  }

  function handleTogglePin(h: Handover) {
    startTransition(async () => {
      try { await togglePin(h.id); setHandovers((prev) => prev.map((item) => item.id === h.id ? { ...item, isPinned: !item.isPinned } : item)); }
      catch { toast.error("핀 처리 실패"); }
    });
  }

  const hasAny = ordered.length > 0;

  // 나에게 배정된 인수인계 할 일
  type MyTask = HandoverTask & { handoverAuthorName: string; handoverDate: Date };
  const myTasks: MyTask[] = handovers
    .flatMap((h) => h.tasks.filter((t) => t.assigneeId === currentUserId).map((t) => ({ ...t, handoverAuthorName: h.authorName, handoverDate: h.date })));
  const myTasksDone = myTasks.filter((t) => t.isCompleted).length;

  // 오늘의 루틴
  const todayDow = todayKST().getUTCDay();
  const todays = templates
    .filter((t) => t.isActive && (t.days === "" || t.days.split(",").map(Number).includes(todayDow)))
    .sort((a, b) => SHIFT_ORDER.indexOf(a.shiftType) - SHIFT_ORDER.indexOf(b.shiftType));
  const todaysDone = todays.filter((t) => completed.has(t.id)).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-x6">
      {/* 조회 기간 (서버측 범위) — 아래 요약·목록이 모두 이 기간 기준 */}
      <Toolbar className="mb-0">
        <DateRangeToolbar
          initialFrom={initialDateFrom}
          initialTo={initialDateTo}
          basePath="/handover"
          className="flex-wrap"
        />
      </Toolbar>

      {/* 요약 */}
      <StatCards cols={3}>
        <StatCard label="미확인" value={unreadCount} unit="건" tone={unreadCount > 0 ? "warn" : "gray"} />
        <StatCard label="인수인계" value={handovers.length} unit="건" sub="조회 기간 기준" />
        <StatCard
          label="루틴 항목"
          value={handovers.reduce((n, h) => n + h.checklist.length, 0)}
          unit="개"
          className="col-span-2 lg:col-span-1"
        />
      </StatCards>

      {/* 2-col main */}
      <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[minmax(0,1fr)_320px]">

        {/* LEFT -- 좌우 뷰어 + 페이지네이션 리스트 */}
        {/* min-w-0: grid item 기본 min-width:auto 때문에 긴 본문(코드블록 등)이 안 줄어들어
            오른쪽 루틴 패널을 화면 밖으로 밀어내는(overflow-clip 로 잘림) 문제 방지 */}
        <div className="flex min-w-0 flex-col gap-x4">
          {!hasAny ? (
            <Section>
              <EmptyState
                icon={Inbox}
                title="이 기간에 남긴 인수인계가 없어요"
                description={"오늘 근무 내용을 남기면 다음 근무자가 바로 확인할 수 있어요.\n조회 기간을 바꿔 볼 수도 있어요."}
              />
            </Section>
          ) : (
            <>
              {/* 좌우로 넘겨보는 포커스 뷰어 (넘길 때마다 열람 로그) */}
              <Section
                title={
                  <span className="tabular-nums">
                    {focusedIndex + 1}
                    <span className="t6-regular text-fg-neutral-subtle"> / {ordered.length}</span>
                  </span>
                }
                description={focused ? relDate(focused.date) : undefined}
                actions={
                  <div className="flex items-center gap-x1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setFocusedIndex((i) => Math.max(0, i - 1))}
                      disabled={focusedIndex === 0}
                      aria-label="이전 인수인계"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setFocusedIndex((i) => Math.min(ordered.length - 1, i + 1))}
                      disabled={focusedIndex >= ordered.length - 1}
                      aria-label="다음 인수인계"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                }
                bodyClassName="border-t border-stroke-neutral-muted pt-x5"
              >
                {focused && (
                  <HandoverSummaryCard h={focused} currentUserId={currentUserId} currentUserName={currentUserName} onDelete={setDeleteConfirmId} onRead={handleRead} onTogglePin={handleTogglePin} isPending={isPending} defaultExpanded />
                )}
              </Section>

              {/* 전체 리스트 — 5개씩 페이지네이션 (행 클릭 시 위 뷰어로) */}
              <Section title="전체 인수인계" count={ordered.length} flush>
                <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                  {ordered.slice(listPage * PAGE_SIZE, listPage * PAGE_SIZE + PAGE_SIZE).map((h) => {
                    const gi = ordered.findIndex((x) => x.id === h.id);
                    const isFocused = gi === focusedIndex;
                    const iRead = h.reads.some((r) => r.userId === currentUserId && r.confirmedAt != null);
                    const iViewed = h.reads.some((r) => r.userId === currentUserId);
                    const isNew = !iRead && h.authorId !== currentUserId;
                    return (
                      <li key={h.id} aria-current={isFocused ? "true" : undefined}>
                        <ListItem
                          onClick={() => focusHandover(h.id)}
                          chevron={false}
                          className={cn(isFocused && "bg-bg-layer-fill")}
                          leading={<Avatar name={h.authorName} size={32} />}
                          title={
                            <span className="inline-flex items-center gap-x1_5">
                              {h.authorName}
                              <span className="t3-regular text-fg-neutral-subtle">{relDate(h.date)}</span>
                              {h.isPinned && <Pin className="size-3.5 text-fg-warning" aria-label="고정" />}
                              {h.priority === "URGENT" && <StatusBadge tone="bad">긴급</StatusBadge>}
                              {isNew && <StatusBadge tone="brand" solid>새 글</StatusBadge>}
                            </span>
                          }
                          description={stripMarkdownPreview(h.content, 80) || "(내용 없음)"}
                          trailing={
                            iRead
                              ? <CheckCircle2 className="size-4 text-fg-positive" aria-label="확인함" />
                              : iViewed
                                ? <Eye className="size-4 text-fg-neutral-subtle" aria-label="열람함" />
                                : undefined
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
                <Pager
                  page={listPage}
                  pageCount={pageCount}
                  onPage={setListPage}
                  className="border-t border-stroke-neutral-muted px-x5 py-x3"
                />
              </Section>
            </>
          )}
        </div>

        {/* RIGHT -- my tasks */}
        <div className="flex min-w-0 flex-col gap-x4">
          {myTasks.length > 0 && (
            <Section
              title="내가 받은 할 일"
              actions={
                <StatusBadge tone={myTasksDone === myTasks.length ? "ok" : "gray"}>
                  {myTasksDone}/{myTasks.length} 완료
                </StatusBadge>
              }
              flush
            >
              <ul className="max-h-72 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {myTasks.map((t) => (
                  <li key={t.id}>
                    <CheckRow
                      checked={t.isCompleted}
                      onToggle={() => handleToggleTask(t.id)}
                      disabled={isPending}
                      title={t.title}
                      description={
                        <>
                          {t.content && <span className="mb-x0_5 block text-fg-neutral-muted">{t.content}</span>}
                          <span>
                            {t.handoverAuthorName} · {new Date(t.handoverDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                            {t.isCompleted && t.completedAt && <span className="ml-x1 text-fg-positive">완료</span>}
                          </span>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 오늘의 루틴 */}
          <Section
            title="오늘의 루틴"
            description={`${DAY_NAMES[todayDow]}요일 · ${todays.length}개`}
            actions={
              todays.length > 0 ? (
                <span className="t4-medium tabular-nums text-fg-neutral-subtle">{todaysDone}/{todays.length}</span>
              ) : undefined
            }
            flush
          >
            {todays.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="오늘 해당하는 루틴이 없어요" className="border-t border-stroke-neutral-muted" />
            ) : (
              <ul className="max-h-72 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {todays.map((t) => {
                  const done = completed.has(t.id);
                  return (
                    <li key={t.id}>
                      <CheckRow
                        checked={done}
                        onToggle={() => toggleRoutine(t.id)}
                        disabled={isPending}
                        title={t.title}
                        trailing={<ShiftBadge shiftType={t.shiftType} />}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* 할 일 · 루틴 바로가기 */}
          <Section title="할 일 · 루틴" flush>
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              <li>
                <ListItem onClick={() => setTodoModalOpen(true)} title="할 일 추가" description="투두리스트에 바로 등록돼요" />
              </li>
              <li>
                <ListItem href="/todos" title="투두리스트" />
              </li>
              <li>
                <ListItem href="/todos?tab=routine" title="루틴 관리" description="투두리스트 · 루틴 탭에서 요일별로 관리할 수 있어요" />
              </li>
            </ul>
          </Section>
        </div>
      </div>

      <Dialog open={todoModalOpen} onOpenChange={setTodoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="t7-bold">할 일 추가</DialogTitle>
            <DialogDescription>투두리스트에 등록돼요</DialogDescription>
          </DialogHeader>
          <TodoForm
            staffList={staffList}
            onDone={() => setTodoModalOpen(false)}
            onCancel={() => setTodoModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmId != null}
        onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}
        title="이 인수인계를 삭제할까요?"
        description="삭제하면 되돌릴 수 없어요."
        confirmLabel="삭제"
        pendingLabel="삭제하는 중…"
        pending={isPending}
        onConfirm={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); }}
      />
    </div>
  );
}

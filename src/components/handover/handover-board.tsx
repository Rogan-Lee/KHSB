"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Pin, PinOff, CheckCircle2, Clock, Pencil, Trash2, AlertTriangle,
  Eye, X, ListChecks, Users,
  ChevronDown, ChevronUp, User, CheckSquare, Square, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteHandover, markHandoverRead, togglePin, toggleHandoverTask } from "@/actions/handover";
import { HandoverForm } from "@/components/handover/handover-form";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
type HandoverTask = { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number; isCompleted: boolean; completedAt: Date | null };
type HandoverChecklist = { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; order: number };
type HandoverRead = { userId: string; userName: string; readAt: Date };
type Handover = { id: string; date: Date; content: string; priority: "URGENT" | "NORMAL"; category: string | null; isPinned: boolean; authorId: string; authorName: string; recipientId: string | null; recipientName: string | null; reads: HandoverRead[]; tasks: HandoverTask[]; checklist: HandoverChecklist[]; monthlyNotesSnapshot: object | null; createdAt: Date };
type ChecklistTemplate = { id: string; title: string; shiftType: string; order: number; isActive: boolean };
type MonthlyNote = { id: string; year: number; month: number; studentId: string | null; studentName: string; content: string; authorId: string; authorName: string; createdAt: Date };
type Student = { id: string; name: string; grade: string };
type Staff = { id: string; name: string; role: string };

type PendingTodo = { id: string; title: string; content: string | null; assigneeId: string | null; assigneeName: string | null };

interface Props {
  initialHandovers: Handover[];
  templates: ChecklistTemplate[];
  monthlyNotes: MonthlyNote[];
  students: Student[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  year: number;
  month: number;
  pendingTodos?: PendingTodo[];
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
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border bg-popover shadow-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" />확인한 사람</p>
      {reads.length === 0 ? <p className="text-xs text-muted-foreground">아직 없습니다</p> : (
        <ul className="space-y-1.5">
          {reads.map((r) => (
            <li key={r.userId} className="flex items-center justify-between text-xs">
              <span className="font-medium">{r.userName}</span>
              <span className="text-muted-foreground">{new Date(r.readAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Handover feed card ────────────────────────────────────────────────────────
function HandoverFeedCard({ h, currentUserId, onEdit, onDelete, onRead, onTogglePin, onToggleTask, isPending }: {
  h: Handover; currentUserId: string; onEdit: (h: Handover) => void; onDelete: (id: string) => void; onRead: (h: Handover) => void; onTogglePin: (h: Handover) => void; onToggleTask: (taskId: string) => void; isPending: boolean;
}) {
  const [showReaders, setShowReaders] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isRead = h.reads.some((r) => r.userId === currentUserId);
  const isAuthor = h.authorId === currentUserId;
  const isUrgent = h.priority === "URGENT";
  const checkedCount = h.checklist.filter((c) => c.isChecked).length;
  const hasDetails = h.tasks.length > 0 || h.checklist.length > 0;
  // 수신자 관련 (다중)
  const recipientIds: string[] = h.recipientId ? (() => { try { const p = JSON.parse(h.recipientId); return Array.isArray(p) ? p : [h.recipientId]; } catch { return [h.recipientId]; } })() : [];
  const recipientNames: string[] = h.recipientName ? (() => { try { const p = JSON.parse(h.recipientName); return Array.isArray(p) ? p : [h.recipientName]; } catch { return [h.recipientName]; } })() : [];
  const isRecipient = recipientIds.includes(currentUserId);
  const needsMyConfirm = isRecipient && !isRead;

  return (
    <div className={cn("rounded-xl border bg-card transition-all",
      isUrgent ? "border-red-200 bg-red-50/30" : h.isPinned ? "border-amber-200 bg-amber-50/20" : "",
      needsMyConfirm ? "ring-2 ring-primary/40" : (!isRead && !isAuthor) ? "ring-1 ring-primary/20" : ""
    )}>
      <div className="p-3 space-y-2">
        {/* Top bar */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {h.isPinned && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
              {isUrgent && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-1.5 py-0.5"><AlertTriangle className="h-2.5 w-2.5" />긴급</span>}
              {h.category && <span className="text-[10px] bg-muted text-muted-foreground border rounded-full px-2 py-0.5">{h.category}</span>}
              {!isRead && !isAuthor && <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-1.5 py-0.5">NEW</span>}
            </div>
            {/* 수신 담당자 표시 (다중) */}
            {recipientNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className="text-[10px] text-muted-foreground">수신:</span>
                {recipientNames.map((name, idx) => {
                  const rid = recipientIds[idx];
                  const rRead = rid ? h.reads.find((r) => r.userId === rid) : null;
                  return (
                    <span key={idx} className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                      rRead
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-[#eaf2fe] text-[#005eeb] border-[#c0d9fc]"
                    )}>
                      <User className="h-2.5 w-2.5" />
                      {name}
                      {rRead
                        ? <><CheckCircle2 className="h-2.5 w-2.5 ml-0.5" />확인</>
                        : <span className="opacity-60 ml-0.5">미확인</span>
                      }
                    </span>
                  );
                })}
              </div>
            )}
            {h.content && <p className="text-sm leading-snug whitespace-pre-wrap break-words line-clamp-2">{h.content}</p>}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onTogglePin(h)} disabled={isPending} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {h.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </button>
            {isAuthor && <>
              <button onClick={() => onEdit(h)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
              <button onClick={() => onDelete(h.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"><Trash2 className="h-3 w-3" /></button>
            </>}
          </div>
        </div>

        {/* Summary badges + expand */}
        {hasDetails && (
          <div className="flex items-center gap-2 flex-wrap">
            {h.tasks.length > 0 && <span className="text-[10px] flex items-center gap-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5"><ListChecks className="h-2.5 w-2.5" />할 일 {h.tasks.length}</span>}
            {h.checklist.length > 0 && <span className={cn("text-[10px] flex items-center gap-0.5 rounded-full px-1.5 py-0.5 border", checkedCount === h.checklist.length ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200")}><CheckCircle2 className="h-2.5 w-2.5" />루틴 {checkedCount}/{h.checklist.length}</span>}
            <button onClick={() => setExpanded((p) => !p)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-auto">
              {expanded ? <><ChevronUp className="h-3 w-3" />접기</> : <><ChevronDown className="h-3 w-3" />상세</>}
            </button>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="space-y-2 pt-1 border-t border-border/40">
            {h.tasks.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">다음 근무자 할 일</p>
                {h.tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleTask(t.id)}
                    disabled={isPending}
                    className={cn("w-full flex items-start gap-2 bg-muted/30 hover:bg-muted/50 rounded px-2.5 py-1.5 text-left transition-colors", t.isCompleted && "opacity-60")}
                  >
                    {t.isCompleted
                      ? <CheckSquare className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                      : <Square className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium", t.isCompleted && "line-through text-muted-foreground")}>{t.title}</p>
                      {t.content && <p className="text-[11px] text-muted-foreground">{t.content}</p>}
                      {t.assigneeName && <p className="text-[11px] text-primary flex items-center gap-0.5 mt-0.5"><User className="h-2.5 w-2.5" />{t.assigneeName}{t.isCompleted && <span className="ml-1 text-green-600">완료</span>}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {h.checklist.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">루틴 체크리스트</p>
                {h.checklist.map((c) => (
                  <div key={c.id} className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-xs", c.isChecked ? "text-green-700" : "text-muted-foreground")}>
                    {c.isChecked ? <CheckSquare className="h-3 w-3 text-green-500 shrink-0" /> : <Square className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                    <span className={cn(c.isChecked && "line-through")}>{c.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/40 gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className="font-medium truncate">{h.authorName}</span>
            <span className="text-muted-foreground shrink-0">{fmtTime(h.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button onClick={() => setShowReaders((p) => !p)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Eye className="h-3 w-3" />{h.reads.length}명
              </button>
              {showReaders && <ReadersPopover reads={h.reads} onClose={() => setShowReaders(false)} />}
            </div>
            {isAuthor ? null : isRead ? (
              <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><CheckCircle2 className="h-3 w-3" />확인됨</span>
            ) : (
              <button
                onClick={() => onRead(h)}
                disabled={isPending}
                className={cn(
                  "flex items-center gap-0.5 text-xs rounded px-2 py-0.5 font-medium transition-colors",
                  needsMyConfirm
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm ring-1 ring-primary"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                )}
              >
                <CheckCircle2 className="h-3 w-3" />{needsMyConfirm ? "내 차례 확인" : "확인"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, isPending }: { onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 flex items-center justify-between gap-2">
      <p className="text-sm text-red-700">삭제하시겠습니까?</p>
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isPending} className="h-7 text-xs">삭제</Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">취소</Button>
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
export function HandoverBoard({ initialHandovers, templates, monthlyNotes, students, staffList, currentUserId, currentUserName, currentUserRole, year, month, pendingTodos = [] }: Props) {
  const [handovers, setHandovers] = useState<Handover[]>(initialHandovers);
  const [isPending, startTransition] = useTransition();
  const [editingHandover, setEditingHandover] = useState<Handover | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);


  const sorted = [...handovers].sort((a, b) => {
    const dd = new Date(b.date).getTime() - new Date(a.date).getTime();
    return dd !== 0 ? dd : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const pinned = sorted.filter((h) => h.isPinned);
  const byDate = sorted.filter((h) => !h.isPinned);
  const unreadCount = handovers.filter((h) => h.authorId !== currentUserId && !h.reads.some((r) => r.userId === currentUserId)).length;

  // Group by date
  const groups: { label: string; items: Handover[] }[] = [];
  for (const h of byDate) {
    const label = relDate(h.date);
    const g = groups.find((g) => g.label === label);
    if (g) g.items.push(h); else groups.push({ label, items: [h] });
  }

  function handleFormDone() { setEditingHandover(null); window.location.reload(); }

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
    if (h.reads.some((r) => r.userId === currentUserId)) return;
    startTransition(async () => {
      try { await markHandoverRead(h.id); setHandovers((prev) => prev.map((item) => item.id === h.id ? { ...item, reads: [...item.reads, { userId: currentUserId, userName: currentUserName, readAt: new Date() }] } : item)); }
      catch { toast.error("확인 처리 실패"); }
    });
  }

  function handleTogglePin(h: Handover) {
    startTransition(async () => {
      try { await togglePin(h.id); setHandovers((prev) => prev.map((item) => item.id === h.id ? { ...item, isPinned: !item.isPinned } : item)); }
      catch { toast.error("핀 처리 실패"); }
    });
  }

  // ── 메인 ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">인수인계</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{year}년 {month}월 · 최근 14일</p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />미확인 {unreadCount}건
          </span>
        )}
      </div>

      {/* ── KPI 칩 ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <KpiChip value={unreadCount} label="미확인" color={unreadCount > 0 ? "red" : "muted"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <KpiChip value={handovers.length} label="인수인계" color="blue" icon={<Clock className="h-3.5 w-3.5" />} />
        <KpiChip value={templates.filter((t) => t.isActive).length} label="루틴 항목" color="green" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
      </div>

      {/* ── 인수인계 작성/수정 폼 (항상 노출) ────────────────────────────── */}
      <div className="rounded-xl border border-[#c0d9fc] bg-[#f7fbff] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-[#0066ff]" />
          <h2 className="text-sm font-semibold text-[#1e2124]">
            {editingHandover ? "인수인계 수정" : "오늘 인수인계 작성"}
          </h2>
          {editingHandover && (
            <button
              onClick={() => setEditingHandover(null)}
              className="ml-auto p-1 rounded hover:bg-[#eaf2fe] text-[#6d7882]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <HandoverForm
          editingHandover={editingHandover ?? undefined}
          templates={templates}
          monthlyNotes={monthlyNotes}
          staffList={staffList}
          pendingTodos={pendingTodos}
          onDone={handleFormDone}
          onCancel={() => setEditingHandover(null)}
        />
      </div>

      {/* ── 2-col 메인 ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_320px] gap-4 items-start">

        {/* LEFT — 인수인계 피드 */}
        <div className="space-y-3">
          {/* 고정 */}
          {pinned.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 px-1">
                <Pin className="h-3 w-3" />고정됨
              </p>
              {pinned.map((h) =>
                deleteConfirmId === h.id
                  ? <DeleteConfirm key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
                  : <HandoverFeedCard key={h.id} h={h} currentUserId={currentUserId} onEdit={setEditingHandover} onDelete={setDeleteConfirmId} onRead={handleRead} onTogglePin={handleTogglePin} onToggleTask={handleToggleTask} isPending={isPending} />
              )}
            </div>
          )}

          {/* 날짜별 그룹 */}
          {groups.length === 0 && pinned.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border bg-card">
              <Clock className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">아직 인수인계 내역이 없습니다</p>
            </div>
          ) : (
            groups.map(({ label, items }) => (
              <div key={label} className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">{label}</p>
                {items.map((h) =>
                  deleteConfirmId === h.id
                    ? <DeleteConfirm key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
                    : <HandoverFeedCard key={h.id} h={h} currentUserId={currentUserId} onEdit={setEditingHandover} onDelete={setDeleteConfirmId} onRead={handleRead} onTogglePin={handleTogglePin} onToggleTask={handleToggleTask} isPending={isPending} />
                )}
              </div>
            ))
          )}
        </div>

        {/* RIGHT — 내가 받은 할 일 + 루틴 관리 */}
        <div className="space-y-3">
          {/* 내가 받은 할 일 */}
          {(() => {
            type MyTask = HandoverTask & { handoverAuthorName: string; handoverDate: Date };
            const myTasks: MyTask[] = handovers
              .flatMap((h) => h.tasks.filter((t) => t.assigneeId === currentUserId).map((t) => ({ ...t, handoverAuthorName: h.authorName, handoverDate: h.date })));
            if (myTasks.length === 0) return null;
            const doneCount = myTasks.filter((t) => t.isCompleted).length;
            return (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                  <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-sm font-semibold flex-1">내가 받은 할 일</span>
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                    doneCount === myTasks.length ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"
                  )}>{doneCount}/{myTasks.length} 완료</span>
                </div>
                <div className="divide-y max-h-72 overflow-y-auto">
                  {myTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToggleTask(t.id)}
                      disabled={isPending}
                      className={cn("w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors", t.isCompleted && "opacity-60")}
                    >
                      {t.isCompleted
                        ? <CheckSquare className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <Square className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", t.isCompleted && "line-through text-muted-foreground")}>{t.title}</p>
                        {t.content && <p className="text-xs text-muted-foreground mt-0.5">{t.content}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />{t.handoverAuthorName} · {new Date(t.handoverDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                          {t.isCompleted && t.completedAt && <span className="ml-1 text-green-600">완료</span>}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">루틴 관리</p>
              <p className="text-xs text-muted-foreground mt-0.5">투두리스트 페이지에서 관리할 수 있습니다</p>
            </div>
            <Link href="/todos" className="text-xs text-primary hover:underline shrink-0">
              바로가기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function KpiChip({ value, label, color, icon }: { value: number | string; label: string; color: "red" | "green" | "amber" | "blue" | "muted"; icon: React.ReactNode }) {
  const colors = { red: "bg-red-50 border-red-200 text-red-700", green: "bg-green-50 border-green-200 text-green-700", amber: "bg-amber-50 border-amber-200 text-amber-700", blue: "bg-blue-50 border-blue-200 text-blue-700", muted: "bg-muted border-border text-muted-foreground" };
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", colors[color])}>
      {icon}
      <div><p className="text-lg font-bold leading-none">{value}</p><p className="text-[10px] mt-0.5 opacity-70 leading-tight">{label}</p></div>
    </div>
  );
}

"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Pin, PinOff, CheckCircle2, Clock, Trash2, AlertTriangle,
  Eye, ListChecks, Users, User, CheckSquare, Square, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteHandover, markHandoverRead, togglePin, toggleHandoverTask } from "@/actions/handover";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
type HandoverTask = { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number; isCompleted: boolean; completedAt: Date | null };
type HandoverChecklist = { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; order: number };
type HandoverRead = { userId: string; userName: string; readAt: Date };
type Handover = { id: string; date: Date; content: string; priority: "URGENT" | "NORMAL"; category: string | null; isPinned: boolean; authorId: string; authorName: string; recipientId: string | null; recipientName: string | null; reads: HandoverRead[]; tasks: HandoverTask[]; checklist: HandoverChecklist[]; monthlyNotesSnapshot: object | null; createdAt: Date };
type Staff = { id: string; name: string; role: string };

interface Props {
  initialHandovers: Handover[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
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

// ── Summary card (슬랙/노션 스타일) ──────────────────────────────────────────
function HandoverSummaryCard({ h, currentUserId, currentUserName, onDelete, onRead, onTogglePin, isPending }: {
  h: Handover; currentUserId: string; currentUserName: string; onDelete: (id: string) => void; onRead: (h: Handover) => void; onTogglePin: (h: Handover) => void; isPending: boolean;
}) {
  const router = useRouter();
  const [showReaders, setShowReaders] = useState(false);
  const isRead = h.reads.some((r) => r.userId === currentUserId);
  const isAuthor = h.authorId === currentUserId;
  const isUrgent = h.priority === "URGENT";
  const checkedCount = h.checklist.filter((c) => c.isChecked).length;
  const completedTasks = h.tasks.filter((t) => t.isCompleted).length;

  const recipientIds: string[] = h.recipientId ? (() => { try { const p = JSON.parse(h.recipientId); return Array.isArray(p) ? p : [h.recipientId]; } catch { return [h.recipientId]; } })() : [];
  const recipientNames: string[] = h.recipientName ? (() => { try { const p = JSON.parse(h.recipientName); return Array.isArray(p) ? p : [h.recipientName]; } catch { return [h.recipientName]; } })() : [];
  const isRecipient = recipientIds.includes(currentUserId);
  const needsMyConfirm = isRecipient && !isRead;
  const confirmedCount = recipientIds.filter((rid) => h.reads.some((r) => r.userId === rid)).length;

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    router.push(`/handover/${h.id}`);
  }

  // 아바타 이니셜
  const initial = h.authorName.slice(0, 1);

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "flex gap-2.5 py-2 px-2 rounded-lg cursor-pointer transition-colors group",
        needsMyConfirm ? "bg-blue-50/60 hover:bg-blue-50" :
        !isRead && !isAuthor ? "bg-muted/30 hover:bg-muted/50" :
        "hover:bg-muted/30",
      )}
    >
      {/* 아바타 */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
        isUrgent ? "bg-red-100 text-red-700" : "bg-[#eaf2fe] text-[#005eeb]"
      )}>
        {initial}
      </div>

      {/* 메시지 본문 */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* 이름 + 시간 + 뱃지 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground">{h.authorName}</span>
          <span className="text-xs text-muted-foreground">{fmtTime(h.createdAt)}</span>
          {h.isPinned && <Pin className="h-3 w-3 text-amber-500" />}
          {isUrgent && <span className="text-[10px] font-semibold bg-red-100 text-red-700 rounded px-1.5 py-0.5">긴급</span>}
          {h.category && <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">{h.category}</span>}
          {!isRead && !isAuthor && <span className="text-[10px] font-semibold bg-blue-500 text-white rounded px-1.5 py-0.5">NEW</span>}
        </div>

        {/* 하단 정보 */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          {h.tasks.length > 0 && (
            <span className="flex items-center gap-1">
              <ListChecks className="h-3 w-3" />할 일 {completedTasks}/{h.tasks.length}
            </span>
          )}
          {h.checklist.length > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />루틴 {checkedCount}/{h.checklist.length}
            </span>
          )}
          {recipientNames.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {confirmedCount}/{recipientNames.length}명 확인
            </span>
          )}
          <div className="relative">
            <button onClick={() => setShowReaders((p) => !p)} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <Eye className="h-3 w-3" />{h.reads.length}
            </button>
            {showReaders && <ReadersPopover reads={h.reads} onClose={() => setShowReaders(false)} />}
          </div>

          {/* 수신자 확인 현황 */}
          {recipientNames.length > 0 && (
            <div className="flex items-center gap-1">
              {recipientNames.map((name, idx) => {
                const rid = recipientIds[idx];
                const rRead = rid ? h.reads.find((r) => r.userId === rid) : null;
                return (
                  <span key={idx} className={cn("text-[10px] rounded px-1.5 py-0.5 font-medium", rRead ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                    {name}{rRead ? " ✓" : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 액션 */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {isAuthor ? (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onTogglePin(h)} disabled={isPending} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              {h.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => onDelete(h.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : isRead ? (
          <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /></span>
        ) : (
          <button
            onClick={() => onRead(h)}
            disabled={isPending}
            className={cn(
              "flex items-center gap-1 text-xs rounded-md px-3 py-1.5 font-medium transition-colors",
              needsMyConfirm
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            확인
          </button>
        )}
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
export function HandoverBoard({ initialHandovers, staffList, currentUserId, currentUserName, currentUserRole }: Props) {
  const [handovers, setHandovers] = useState<Handover[]>(initialHandovers);
  const [isPending, startTransition] = useTransition();
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">인수인계</h1>
        <Link href="/handover/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />작성하기
          </Button>
        </Link>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-3 gap-2">
        <KpiChip value={unreadCount} label="미확인" color={unreadCount > 0 ? "red" : "muted"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <KpiChip value={handovers.length} label="인수인계" color="blue" icon={<Clock className="h-3.5 w-3.5" />} />
        <KpiChip value={handovers.reduce((n, h) => n + h.checklist.length, 0)} label="루틴 항목" color="green" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
      </div>

      {/* 2-col main */}
      <div className="grid grid-cols-[1fr_320px] gap-4 items-start">

        {/* LEFT -- feed */}
        <div className="rounded-xl border bg-card divide-y">
          {/* Pinned */}
          {pinned.length > 0 && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <Pin className="h-3 w-3" />고정됨
              </p>
              {pinned.map((h) =>
                deleteConfirmId === h.id
                  ? <DeleteConfirm key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
                  : <HandoverSummaryCard key={h.id} h={h} currentUserId={currentUserId} currentUserName={currentUserName} onDelete={setDeleteConfirmId} onRead={handleRead} onTogglePin={handleTogglePin} isPending={isPending} />
              )}
            </div>
          )}

          {/* Date groups */}
          {groups.length === 0 && pinned.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Clock className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">아직 인수인계 내역이 없습니다</p>
            </div>
          ) : (
            groups.map(({ label, items }) => (
              <div key={label} className="px-3 pt-3 pb-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                {items.map((h) =>
                  deleteConfirmId === h.id
                    ? <DeleteConfirm key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
                    : <HandoverSummaryCard key={h.id} h={h} currentUserId={currentUserId} currentUserName={currentUserName} onDelete={setDeleteConfirmId} onRead={handleRead} onTogglePin={handleTogglePin} isPending={isPending} />
                )}
              </div>
            ))
          )}
        </div>

        {/* RIGHT -- my tasks */}
        <div className="space-y-3">
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

// ── KPI Chip ──────────────────────────────────────────────────────────────────
function KpiChip({ value, label, color, icon }: { value: number | string; label: string; color: "red" | "green" | "amber" | "blue" | "muted"; icon: React.ReactNode }) {
  const colors = { red: "bg-red-50 border-red-200 text-red-700", green: "bg-green-50 border-green-200 text-green-700", amber: "bg-amber-50 border-amber-200 text-amber-700", blue: "bg-blue-50 border-blue-200 text-blue-700", muted: "bg-muted border-border text-muted-foreground" };
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", colors[color])}>
      {icon}
      <div><p className="text-lg font-bold leading-none">{value}</p><p className="text-[10px] mt-0.5 opacity-70 leading-tight">{label}</p></div>
    </div>
  );
}

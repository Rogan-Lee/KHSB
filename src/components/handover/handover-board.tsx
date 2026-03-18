"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createHandover,
  updateHandover,
  deleteHandover,
  markHandoverRead,
  togglePin,
} from "@/actions/handover";
import {
  Pin,
  PinOff,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  AlertTriangle,
  Users,
  Eye,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type HandoverRead = { userId: string; userName: string; readAt: Date };

type Handover = {
  id: string;
  date: Date;
  content: string;
  priority: "URGENT" | "NORMAL";
  category: string | null;
  isPinned: boolean;
  authorId: string;
  authorName: string;
  reads: HandoverRead[];
  createdAt: Date;
};

interface Props {
  initialHandovers: Handover[];
  currentUserId: string;
  currentUserName: string;
}

const CATEGORY_OPTIONS = ["학생관련", "시설관련", "운영관련", "청소/정리", "기타"];

function formatDate(d: Date) {
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === today.getTime()) return "오늘";
  if (target.getTime() === yesterday.getTime()) return "어제";
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function formatTime(d: Date) {
  return new Date(d).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function groupByDate(handovers: Handover[]) {
  const groups: { date: Date; items: Handover[] }[] = [];
  for (const h of handovers) {
    const found = groups.find((g) => isSameDay(g.date, h.date));
    if (found) found.items.push(h);
    else groups.push({ date: h.date, items: [h] });
  }
  return groups;
}

// ── Inline compose box ──────────────────────────────────────────────────────
function ComposeBox({
  onSubmit,
  isPending,
}: {
  onSubmit: (data: { content: string; priority: "URGENT" | "NORMAL"; category: string; isPinned: boolean }) => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "NORMAL">("NORMAL");
  const [category, setCategory] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    if (!content.trim()) return;
    onSubmit({ content, priority, category, isPinned });
    setContent("");
    setPriority("NORMAL");
    setCategory("");
    setIsPinned(false);
    setFocused(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setFocused(false);
      setContent("");
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-all duration-200",
        focused ? "shadow-md border-primary/30" : "shadow-sm",
        priority === "URGENT" && focused && "border-red-300"
      )}
    >
      <div className="p-4 space-y-3">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="인수인계 내용을 작성하세요... (⌘Enter로 등록)"
          rows={focused ? 4 : 2}
          className={cn(
            "resize-none text-sm leading-relaxed border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent",
            "placeholder:text-muted-foreground/50"
          )}
        />

        {/* Options row — only when focused */}
        {focused && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
            {/* Priority */}
            <Select value={priority} onValueChange={(v) => setPriority(v as "URGENT" | "NORMAL")}>
              <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">일반</SelectItem>
                <SelectItem value="URGENT">🚨 긴급</SelectItem>
              </SelectContent>
            </Select>

            {/* Category */}
            <Select value={category || "__none"} onValueChange={(v) => setCategory(v === "__none" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed">
                <SelectValue placeholder="분류 없음" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">분류 없음</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Pin toggle */}
            <button
              type="button"
              onClick={() => setIsPinned((p) => !p)}
              className={cn(
                "h-7 px-2.5 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
                isPinned
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "border-dashed text-muted-foreground hover:text-foreground"
              )}
            >
              <Pin className="h-3 w-3" />
              {isPinned ? "고정됨" : "고정"}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setFocused(false); setContent(""); }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                취소
              </button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isPending || !content.trim()}
                className={cn(
                  "h-7 text-xs gap-1.5",
                  priority === "URGENT" && "bg-red-600 hover:bg-red-700"
                )}
              >
                <Send className="h-3 w-3" />
                등록
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline edit box ──────────────────────────────────────────────────────────
function InlineEditBox({
  handover,
  onSave,
  onCancel,
  isPending,
}: {
  handover: Handover;
  onSave: (data: { content: string; priority: "URGENT" | "NORMAL"; category: string; isPinned: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [content, setContent] = useState(handover.content);
  const [priority, setPriority] = useState<"URGENT" | "NORMAL">(handover.priority);
  const [category, setCategory] = useState(handover.category ?? "");
  const [isPinned, setIsPinned] = useState(handover.isPinned);

  useEffect(() => {
    // auto-focus
    const el = document.getElementById(`edit-${handover.id}`);
    el?.focus();
  }, [handover.id]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSave({ content, priority, category, isPinned });
    }
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card shadow-md p-4 space-y-3">
      <Textarea
        id={`edit-${handover.id}`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        className="resize-none text-sm leading-relaxed border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
      />
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
        <Select value={priority} onValueChange={(v) => setPriority(v as "URGENT" | "NORMAL")}>
          <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NORMAL">일반</SelectItem>
            <SelectItem value="URGENT">🚨 긴급</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category || "__none"} onValueChange={(v) => setCategory(v === "__none" ? "" : v)}>
          <SelectTrigger className="h-7 text-xs w-auto gap-1 px-2.5 border-dashed">
            <SelectValue placeholder="분류 없음" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">분류 없음</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => setIsPinned((p) => !p)}
          className={cn(
            "h-7 px-2.5 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
            isPinned
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "border-dashed text-muted-foreground hover:text-foreground"
          )}
        >
          <Pin className="h-3 w-3" />
          {isPinned ? "고정됨" : "고정"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> 취소
          </button>
          <Button
            size="sm"
            onClick={() => onSave({ content, priority, category, isPinned })}
            disabled={isPending || !content.trim()}
            className="h-7 text-xs gap-1.5"
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Readers popover ──────────────────────────────────────────────────────────
function ReadersPopover({ reads, onClose }: { reads: HandoverRead[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border bg-popover shadow-lg p-3 space-y-2"
    >
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3 w-3" /> 확인한 사람
      </p>
      {reads.length === 0 ? (
        <p className="text-xs text-muted-foreground">아직 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {reads.map((r) => (
            <li key={r.userId} className="flex items-center justify-between text-xs">
              <span className="font-medium">{r.userName}</span>
              <span className="text-muted-foreground">
                {new Date(r.readAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Handover card ────────────────────────────────────────────────────────────
function HandoverCard({
  handover: h,
  currentUserId,
  onEdit,
  onDelete,
  onRead,
  onTogglePin,
  isPending,
}: {
  handover: Handover;
  currentUserId: string;
  onEdit: (h: Handover) => void;
  onDelete: (id: string) => void;
  onRead: (h: Handover) => void;
  onTogglePin: (h: Handover) => void;
  isPending: boolean;
}) {
  const [showReaders, setShowReaders] = useState(false);
  const isRead = h.reads.some((r) => r.userId === currentUserId);
  const isAuthor = h.authorId === currentUserId;
  const isUrgent = h.priority === "URGENT";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 transition-all",
        isUrgent ? "border-red-200 bg-red-50/40" : "",
        h.isPinned && !isUrgent ? "border-amber-200 bg-amber-50/30" : "",
        !isRead ? "ring-1 ring-primary/20" : ""
      )}
    >
      {/* Top: badges + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isUrgent && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              긴급
            </span>
          )}
          {h.category && (
            <span className="text-[11px] font-medium bg-muted text-muted-foreground border rounded-full px-2 py-0.5">
              {h.category}
            </span>
          )}
          {!isRead && (
            <span className="text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
              NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onTogglePin(h)}
            disabled={isPending}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={h.isPinned ? "고정 해제" : "고정"}
          >
            {h.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          {isAuthor && (
            <>
              <button
                onClick={() => onEdit(h)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(h.id)}
                className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{h.content}</p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{h.authorName}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatTime(h.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowReaders((p) => !p)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-3 w-3" />
              {h.reads.length}명 확인
            </button>
            {showReaders && (
              <ReadersPopover reads={h.reads} onClose={() => setShowReaders(false)} />
            )}
          </div>
          {isRead ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              확인함
            </span>
          ) : (
            <button
              onClick={() => onRead(h)}
              disabled={isPending}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-md px-2.5 py-1 hover:opacity-90 transition-opacity font-medium"
            >
              <CheckCircle2 className="h-3 w-3" />
              확인
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main board ───────────────────────────────────────────────────────────────
export function HandoverBoard({ initialHandovers, currentUserId }: Props) {
  const [handovers, setHandovers] = useState<Handover[]>(initialHandovers);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sorted = [...handovers].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const pinned = sorted.filter((h) => h.isPinned);
  const unpinned = sorted.filter((h) => !h.isPinned);
  const groups = groupByDate(unpinned);
  const unreadCount = handovers.filter((h) => !h.reads.some((r) => r.userId === currentUserId)).length;

  function handleCreate(data: { content: string; priority: "URGENT" | "NORMAL"; category: string; isPinned: boolean }) {
    startTransition(async () => {
      try {
        const created = await createHandover({
          content: data.content,
          priority: data.priority,
          category: data.category || undefined,
          isPinned: data.isPinned,
        });
        setHandovers((prev) => [created as Handover, ...prev]);
        toast.success("등록되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  function handleSaveEdit(id: string, data: { content: string; priority: "URGENT" | "NORMAL"; category: string; isPinned: boolean }) {
    startTransition(async () => {
      try {
        const updated = await updateHandover(id, {
          content: data.content,
          priority: data.priority,
          category: data.category || undefined,
          isPinned: data.isPinned,
        });
        setHandovers((prev) => prev.map((h) => (h.id === id ? (updated as Handover) : h)));
        setEditingId(null);
        toast.success("수정되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteHandover(id);
        setHandovers((prev) => prev.filter((h) => h.id !== id));
        setDeleteConfirmId(null);
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleRead(h: Handover) {
    if (h.reads.some((r) => r.userId === currentUserId)) return;
    startTransition(async () => {
      try {
        await markHandoverRead(h.id);
        setHandovers((prev) =>
          prev.map((item) =>
            item.id === h.id
              ? { ...item, reads: [...item.reads, { userId: currentUserId, userName: "나", readAt: new Date() }] }
              : item
          )
        );
      } catch {
        toast.error("확인 처리 실패");
      }
    });
  }

  function handleTogglePin(h: Handover) {
    startTransition(async () => {
      try {
        await togglePin(h.id);
        setHandovers((prev) =>
          prev.map((item) => (item.id === h.id ? { ...item, isPinned: !item.isPinned } : item))
        );
      } catch {
        toast.error("핀 처리 실패");
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">인수인계</h1>
          <p className="text-sm text-muted-foreground mt-0.5">최근 14일 인수인계 내역</p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            미확인 {unreadCount}건
          </span>
        )}
      </div>

      {/* Compose */}
      <ComposeBox onSubmit={handleCreate} isPending={isPending} />

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
            <Pin className="h-3 w-3" /> 고정됨
          </p>
          {pinned.map((h) =>
            editingId === h.id ? (
              <InlineEditBox
                key={h.id}
                handover={h}
                onSave={(data) => handleSaveEdit(h.id, data)}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : deleteConfirmId === h.id ? (
              <DeleteConfirmCard key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
            ) : (
              <HandoverCard
                key={h.id}
                handover={h}
                currentUserId={currentUserId}
                onEdit={(h) => setEditingId(h.id)}
                onDelete={setDeleteConfirmId}
                onRead={handleRead}
                onTogglePin={handleTogglePin}
                isPending={isPending}
              />
            )
          )}
        </div>
      )}

      {/* Timeline */}
      {groups.length === 0 && pinned.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Clock className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">아직 인수인계 내역이 없습니다</p>
        </div>
      )}

      {groups.map(({ date, items }) => (
        <div key={date.toString()} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {formatDate(date)}
          </p>
          {items.map((h) =>
            editingId === h.id ? (
              <InlineEditBox
                key={h.id}
                handover={h}
                onSave={(data) => handleSaveEdit(h.id, data)}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : deleteConfirmId === h.id ? (
              <DeleteConfirmCard key={h.id} onConfirm={() => handleDelete(h.id)} onCancel={() => setDeleteConfirmId(null)} isPending={isPending} />
            ) : (
              <HandoverCard
                key={h.id}
                handover={h}
                currentUserId={currentUserId}
                onEdit={(h) => setEditingId(h.id)}
                onDelete={setDeleteConfirmId}
                onRead={handleRead}
                onTogglePin={handleTogglePin}
                isPending={isPending}
              />
            )
          )}
        </div>
      ))}
    </div>
  );
}

function DeleteConfirmCard({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 flex items-center justify-between gap-3">
      <p className="text-sm text-red-700">이 인수인계를 삭제하시겠습니까?</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isPending} className="h-7 text-xs">
          삭제
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
          취소
        </Button>
      </div>
    </div>
  );
}

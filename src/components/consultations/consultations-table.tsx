"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { updateConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, X, Pencil, CheckCircle, XCircle, CalendarDays, MessageSquare, ClipboardList, Play,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Status = "SCHEDULED" | "COMPLETED" | "CANCELLED";

const STATUS_CONFIG: Record<Status, {
  label: string;
  bar: string;
  badge: string;
}> = {
  SCHEDULED: {
    label: "예정",
    bar: "bg-blue-400",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  COMPLETED: {
    label: "완료",
    bar: "bg-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "취소",
    bar: "bg-gray-300",
    badge: "bg-gray-50 text-gray-500 border-gray-200",
  },
};

type Consultation = {
  id: string;
  scheduledAt: Date | null;
  actualDate?: Date | null;
  status: Status;
  agenda: string | null;
  notes?: string | null;
  outcome: string | null;
  followUp: string | null;
  student: { id: string; name: string; grade: string };
};

function formatKST(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = dayNames[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const timeStr = hh === "00" && mm === "00" ? "" : ` ${hh}:${mm}`;
  return `${m}월 ${d}일 (${dow})${timeStr}`;
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditDialog({ consultation, onClose }: { consultation: Consultation; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateConsultation(consultation.id, formData);
        toast.success("저장되었습니다");
        onClose();
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{consultation.student.name}</span>
            <span className="text-sm font-normal text-muted-foreground">{consultation.student.grade}</span>
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">예정 일시</Label>
              <DateTimePickerInput
                name="scheduledAt"
                defaultValue={consultation.scheduledAt?.toISOString().slice(0, 16) ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">실제 일시</Label>
              <DateTimePickerInput
                name="actualDate"
                defaultValue={(consultation.actualDate as Date | null | undefined)?.toISOString().slice(0, 16) ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">상태</Label>
            <Select name="status" defaultValue={consultation.status}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">예정</SelectItem>
                <SelectItem value="COMPLETED">완료</SelectItem>
                <SelectItem value="CANCELLED">취소</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">면담 주제</Label>
            <Textarea name="agenda" defaultValue={consultation.agenda ?? ""} rows={2} className="text-sm resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">결과</Label>
            <Textarea name="outcome" defaultValue={consultation.outcome ?? ""} rows={2} className="text-sm resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">사후조치</Label>
            <Textarea name="followUp" defaultValue={consultation.followUp ?? ""} rows={2} className="text-sm resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">메모</Label>
            <Textarea name="notes" defaultValue={(consultation.notes as string | null | undefined) ?? ""} rows={2} className="text-sm resize-none" />
          </div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>취소</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Consultation Card ────────────────────────────────────────────────────────

function ConsultationCard({
  c,
  isPending,
  onEdit,
  onQuickStatus,
  onProgress,
}: {
  c: Consultation;
  isPending: boolean;
  onEdit: () => void;
  onQuickStatus: (status: "COMPLETED" | "CANCELLED") => void;
  onProgress: () => void;
}) {
  const cfg = STATUS_CONFIG[c.status];

  return (
    <div className={cn(
      "group flex gap-0 rounded-xl border bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md",
      c.status === "CANCELLED" && "opacity-60"
    )}>
      {/* Status bar */}
      <div className={cn("w-1 shrink-0", cfg.bar)} />

      {/* Content */}
      <div className="flex-1 px-4 py-3 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-sm">{c.student.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">{c.student.grade}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.badge)}>
              {cfg.label}
            </span>
          </div>
          {/* Actions — visible on hover */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {c.status === "SCHEDULED" && (
              <>
                <button
                  onClick={onProgress}
                  disabled={isPending}
                  title="면담 진행"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" />
                  진행
                </button>
                <button
                  onClick={() => onQuickStatus("COMPLETED")}
                  disabled={isPending}
                  title="완료 처리"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-40"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  완료
                </button>
                <button
                  onClick={() => onQuickStatus("CANCELLED")}
                  disabled={isPending}
                  title="취소 처리"
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-40"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  취소
                </button>
              </>
            )}
            <button
              onClick={onEdit}
              title="수정"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Meta row */}
        {c.scheduledAt && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <CalendarDays className="h-3 w-3" />
            {formatKST(c.scheduledAt)}
          </p>
        )}

        {/* Detail rows */}
        {(c.agenda || c.outcome || c.followUp) && (
          <div className="mt-2 space-y-1">
            {c.agenda && (
              <p className="flex items-start gap-1.5 text-xs text-foreground/80">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{c.agenda}</span>
              </p>
            )}
            {(c.outcome || c.followUp) && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ClipboardList className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="line-clamp-1">
                  {[c.outcome, c.followUp].filter(Boolean).join(" · ")}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main List ────────────────────────────────────────────────────────────────

export function ConsultationsList({ consultations }: { consultations: Consultation[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [editTarget, setEditTarget] = useState<Consultation | null>(null);
  const [isPending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();

  const filtered = consultations.filter((c) => {
    const matchesQuery = !q || c.student.name.toLowerCase().includes(q) || c.student.grade.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  function quickStatus(id: string, status: "COMPLETED" | "CANCELLED") {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("status", status);
        await updateConsultation(id, fd);
        toast.success(status === "COMPLETED" ? "완료 처리되었습니다" : "취소 처리되었습니다");
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  const tabs: { key: Status | "ALL"; label: string }[] = [
    { key: "ALL", label: "전체" },
    { key: "SCHEDULED", label: "예정" },
    { key: "COMPLETED", label: "완료" },
    { key: "CANCELLED", label: "취소" },
  ];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                statusFilter === t.key
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.key !== "ALL" && (
                <span className="ml-1 text-[10px] opacity-60">
                  {consultations.filter((c) => c.status === t.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="원생 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-44 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {q && (
          <span className="text-xs text-muted-foreground">{filtered.length}건 검색됨</span>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 rounded-xl border border-dashed">
          <p className="text-sm">{q ? "검색 결과가 없습니다" : "면담 기록이 없습니다"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ConsultationCard
              key={c.id}
              c={c}
              isPending={isPending}
              onEdit={() => setEditTarget(c)}
              onQuickStatus={(status) => quickStatus(c.id, status)}
              onProgress={() => router.push(`/consultations/${c.id}`)}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <EditDialog consultation={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

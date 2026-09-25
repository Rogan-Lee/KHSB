"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Loader2,
  Video,
  Copy,
  Check,
  Sparkles,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  CalendarClock,
  CalendarX2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, FormActions, FormField, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";
import {
  createMentoringSession,
  updateSessionNotes,
  completeMentoringSession,
  cancelMentoringSession,
} from "@/actions/online/mentoring-sessions";
import type {
  MentoringSessionPhoto,
  MentoringSessionStatus,
} from "@/generated/prisma";
import { SessionPhotoUploader } from "@/components/mentoring/session-photo-uploader";
import { TimePickerInput } from "@/components/ui/time-picker";

export type MentoringSessionRow = {
  id: string;
  title: string;
  status: MentoringSessionStatus;
  scheduledAt: string;       // ISO
  durationMinutes: number;
  meetUrl: string | null;
  calendarHtmlLink: string | null;
  notes: string | null;
  summary: string | null;
  hostName: string;
  photos: MentoringSessionPhoto[];
};

const STATUS_LABEL: Record<MentoringSessionStatus, string> = {
  SCHEDULED: "예약됨",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소됨",
};

const STATUS_TONE: Record<MentoringSessionStatus, Tone> = {
  SCHEDULED: "info",
  IN_PROGRESS: "warn",
  COMPLETED: "ok",
  CANCELED: "gray",
};

export function MentoringSessionsSection({
  studentId,
  sessions,
}: {
  studentId: string;
  sessions: MentoringSessionRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // 진행 중 + 미래 예약 + 가장 최근 완료 1개 자동 펼침
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.status === "IN_PROGRESS") ids.add(s.id);
      else if (s.status === "SCHEDULED" && new Date(s.scheduledAt).getTime() > Date.now()) ids.add(s.id);
    }
    const completedSorted = sessions
      .filter((s) => s.status === "COMPLETED")
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    if (completedSorted[0]) ids.add(completedSorted[0].id);
    return ids;
  });

  const upcoming = sessions
    .filter((s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = sessions
    .filter((s) => s.status === "COMPLETED" || s.status === "CANCELED")
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-x4">
      <div className="flex flex-wrap items-center justify-between gap-x2">
        <p className="t3-regular text-fg-neutral-subtle">
          학원 공용 Google Calendar 에 Meet 링크가 포함된 일정이 자동으로 만들어져요.
        </p>
        {!showForm && (
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus />
            새 세션 예약
          </Button>
        )}
      </div>

      {showForm && (
        <NewSessionForm
          studentId={studentId}
          onClose={() => setShowForm(false)}
        />
      )}

      {sessions.length === 0 && !showForm ? (
        <div className="rounded-r3 bg-bg-layer-fill">
          <EmptyState
            compact
            icon={CalendarX2}
            title="예약된 화상 세션이 없어요"
            description="새 세션을 예약하면 Meet 링크와 학부모 초대가 함께 나가요"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-x5">
          {upcoming.length > 0 && (
            <SessionGroup title="예정 · 진행 중" count={upcoming.length}>
              {upcoming.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  expanded={expandedIds.has(s.id)}
                  onToggle={() => toggleExpand(s.id)}
                />
              ))}
            </SessionGroup>
          )}
          {past.length > 0 && (
            <SessionGroup title="지난 세션" count={past.length}>
              {past.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  expanded={expandedIds.has(s.id)}
                  onToggle={() => toggleExpand(s.id)}
                />
              ))}
            </SessionGroup>
          )}
        </div>
      )}
    </div>
  );
}

function SessionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-x2 flex items-center gap-x1 t4-bold text-fg-neutral-muted">
        {title}
        <span className="tabular-nums text-fg-neutral-subtle">{count}</span>
      </h4>
      <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
        {children}
      </ul>
    </div>
  );
}

// ─────────────── 세션 카드 ───────────────

function SessionCard({
  session,
  expanded,
  onToggle,
}: {
  session: MentoringSessionRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>(session.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);

  // 세션 props 가 새로 들어오면 draft 동기화 (다른 세션 펼친 후 돌아왔을 때)
  useEffect(() => {
    setNotesDraft(session.notes ?? "");
  }, [session.id, session.notes]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNotesChange = (v: string) => {
    setNotesDraft(v);
    if (session.status === "CANCELED" || session.status === "COMPLETED") return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      try {
        await updateSessionNotes({ sessionId: session.id, notes: v });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSavingNotes(false);
      }
    }, 800);
  };

  const handleCopyMeet = async () => {
    if (!session.meetUrl) return;
    await navigator.clipboard.writeText(session.meetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Meet 링크 복사됨");
  };

  const handleComplete = () => {
    if (!notesDraft.trim()) {
      toast.error("노트가 비어 있어 요약할 수 없습니다");
      return;
    }
    setConfirm(null);
    setSummarizing(true);
    startTransition(async () => {
      try {
        // draft 가 아직 디바운스로 미저장일 수 있으니 먼저 저장
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        await updateSessionNotes({ sessionId: session.id, notes: notesDraft });
        await completeMentoringSession(session.id);
        toast.success("세션 종료 + 일일 보고 적재 완료");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "종료 실패");
      } finally {
        setSummarizing(false);
      }
    });
  };

  const handleCancel = () => {
    setConfirm(null);
    startTransition(async () => {
      try {
        await cancelMentoringSession(session.id);
        toast.success("세션이 취소되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "취소 실패");
      }
    });
  };

  const dt = new Date(session.scheduledAt);
  const dateLabel = dt.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isPast = dt.getTime() < Date.now();
  const editable = session.status === "SCHEDULED" || session.status === "IN_PROGRESS";

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-x3 px-x4 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
      >
        <CalendarClock className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-x2 gap-y-x0_5">
            <span className="t4-medium tabular-nums text-fg-neutral">{dateLabel}</span>
            <span className="t3-regular tabular-nums text-fg-neutral-subtle">{session.durationMinutes}분</span>
            <span className="truncate t3-regular text-fg-neutral-muted">{session.hostName}</span>
          </span>
        </span>
        <StatusBadge tone={STATUS_TONE[session.status]}>{STATUS_LABEL[session.status]}</StatusBadge>
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-x5 border-t border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x4">
          {/* Meet URL · Calendar 링크 */}
          <div className="flex flex-wrap items-center gap-x2">
            {session.meetUrl ? (
              <>
                <Button asChild size="sm">
                  <a href={session.meetUrl} target="_blank" rel="noopener">
                    <Video />
                    Meet 입장
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyMeet} title="Meet 링크 복사">
                  {copied ? <Check className="text-fg-positive" /> : <Copy />}
                  {copied ? "복사됨" : "링크 복사"}
                </Button>
              </>
            ) : (
              <span className="inline-flex items-center gap-x1 t3-medium text-fg-warning">
                <AlertTriangle className="size-4" aria-hidden />
                Meet 링크 없음 (Calendar 미연동 또는 발급 실패)
              </span>
            )}
            {session.calendarHtmlLink && (
              <Button asChild variant="ghost" size="sm" className="ml-auto">
                <a href={session.calendarHtmlLink} target="_blank" rel="noopener">
                  <ExternalLink />
                  Calendar
                </a>
              </Button>
            )}
          </div>

          {/* 요약 (완료된 경우) */}
          {session.summary && (
            <div className="rounded-r2 bg-bg-positive-weak px-x4 py-x3">
              <p className="t3-bold text-fg-positive">AI 요약 · 일일 보고에 적재됨</p>
              <p className="mt-x1_5 whitespace-pre-wrap break-words t4-regular text-fg-neutral">
                {session.summary}
              </p>
            </div>
          )}

          {/* 노트 에디터 */}
          <div className="flex flex-col gap-x2">
            <div className="flex items-center justify-between gap-x2">
              <label htmlFor={`session-notes-${session.id}`} className="t4-medium text-fg-neutral">
                노트 <span className="t3-regular text-fg-neutral-subtle">markdown</span>
              </label>
              {editable && (
                <span className="inline-flex items-center gap-x1 t3-regular text-fg-neutral-subtle" aria-live="polite">
                  {savingNotes ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      저장 중…
                    </>
                  ) : (
                    "자동 저장"
                  )}
                </span>
              )}
            </div>
            <textarea
              id={`session-notes-${session.id}`}
              value={notesDraft}
              onChange={(e) => handleNotesChange(e.target.value)}
              disabled={!editable}
              rows={isPast || session.status === "IN_PROGRESS" ? 8 : 5}
              placeholder="통화 중 실시간으로 작성하거나 통화 후 정리하세요. 종료 시 AI 요약이 일일 보고에 자동 적재됩니다."
              className={cn(inputBaseClass, "min-h-[120px] resize-y border-0 py-x2_5")}
            />
          </div>

          {/* 첨부 사진 (KDA / EXTRA / FREE) */}
          <div className="flex flex-col gap-x2">
            <p className="t4-medium text-fg-neutral">첨부 사진</p>
            <SessionPhotoUploader
              sessionId={session.id}
              existing={session.photos}
            />
          </div>

          {/* 액션 버튼 */}
          {editable && (
            <FormActions className="pt-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-fg-critical"
                onClick={() => setConfirm("cancel")}
                disabled={isPending || summarizing}
              >
                <XCircle />
                세션 취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!notesDraft.trim()) {
                    toast.error("노트가 비어 있어 요약할 수 없습니다");
                    return;
                  }
                  setConfirm("complete");
                }}
                disabled={isPending || summarizing || !notesDraft.trim()}
                title={
                  !notesDraft.trim()
                    ? "노트가 비어 있어 요약할 수 없습니다"
                    : undefined
                }
              >
                {summarizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {summarizing ? "요약 중…" : "종료 + AI 요약 → 일일 보고 적재"}
              </Button>
            </FormActions>
          )}
          {session.status === "COMPLETED" && (
            <p className="inline-flex items-center gap-x1 t3-medium text-fg-positive">
              <CheckCircle2 className="size-4" aria-hidden />
              완료된 세션이에요
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "complete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="세션을 종료할까요?"
        description="노트를 AI로 요약해서 오늘 일일 보고에 적재해요."
        confirmLabel="종료하고 요약"
        pending={isPending || summarizing}
        onConfirm={handleComplete}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="세션을 취소할까요?"
        description="Google Calendar 일정도 함께 삭제돼요."
        confirmLabel="세션 취소"
        cancelLabel="닫기"
        destructive
        pending={isPending}
        onConfirm={handleCancel}
      />
    </li>
  );
}

// ─────────────── 새 세션 예약 폼 ───────────────

function NewSessionForm({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState<string>("19:00");
  const [duration, setDuration] = useState<string>("30");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      toast.error("날짜와 시간을 입력하세요");
      return;
    }
    // KST 로 입력된 datetime → ISO. Date 로 만들면 로컬 time zone 으로 해석되는데
    // KST 환경에서 작업하므로 이대로 두되, 서버에서 그대로 저장.
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    startTransition(async () => {
      try {
        const res = await createMentoringSession({
          studentId,
          scheduledAt,
          durationMinutes: Number(duration),
        });
        if (res.calendarError) {
          toast.warning(`예약은 됐지만 Meet 링크 미발급: ${res.calendarError}`);
        } else {
          toast.success("세션이 예약되었습니다 (Meet 링크 + 학부모 invite 발송)");
        }
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "예약 실패");
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-x4 rounded-r3 bg-bg-layer-fill p-x4"
    >
      <div className="flex items-center justify-between gap-x2">
        <h4 className="t5-bold text-fg-neutral">새 화상 세션 예약</h4>
      </div>
      <div className="grid grid-cols-1 gap-x3 sm:grid-cols-3">
        <FormField label="날짜" htmlFor={`new-session-date-${studentId}`}>
          <Input
            id={`new-session-date-${studentId}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isPending}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="시간 (KST)">
          <TimePickerInput
            value={time}
            onChange={setTime}
            disabled={isPending}
            className={cn(inputBaseClass, "h-10 w-full border-0 text-left font-sans focus:ring-0")}
          />
        </FormField>
        <FormField label="길이">
          <Select value={duration} onValueChange={setDuration} disabled={isPending}>
            <SelectTrigger aria-label="세션 길이">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["15", "30", "45", "60", "90", "120"].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}분
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormActions className="pt-0">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "예약 중…" : "예약 + Meet 링크 생성"}
        </Button>
      </FormActions>
    </form>
  );
}

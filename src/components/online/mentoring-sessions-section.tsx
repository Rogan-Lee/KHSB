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
  ChevronRight,
  CalendarClock,
} from "lucide-react";
import {
  createMentoringSession,
  updateSessionNotes,
  completeMentoringSession,
  cancelMentoringSession,
} from "@/actions/online/mentoring-sessions";
import type { MentoringSessionStatus } from "@/generated/prisma";

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
};

const STATUS_LABEL: Record<MentoringSessionStatus, string> = {
  SCHEDULED: "예약됨",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELED: "취소됨",
};

const STATUS_COLORS: Record<MentoringSessionStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 border-blue-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELED: "bg-slate-100 text-slate-600 border-slate-200",
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-ink-5">
          학원 공용 Google Calendar 에 자동으로 Meet 링크 포함 이벤트가 생성됩니다.
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-[8px] bg-ink text-white px-2.5 py-1 text-[12px] font-semibold hover:bg-ink/90"
        >
          <Plus className="h-3 w-3" />
          새 세션 예약
        </button>
      </div>

      {showForm && (
        <NewSessionForm
          studentId={studentId}
          onClose={() => setShowForm(false)}
        />
      )}

      {sessions.length === 0 && !showForm ? (
        <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/40 p-5 text-center text-[12px] text-ink-5">
          예약된 화상 세션이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
                예정 / 진행 중
              </h5>
              {upcoming.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  expanded={expandedIds.has(s.id)}
                  onToggle={() => toggleExpand(s.id)}
                />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
                지난 세션
              </h5>
              {past.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  expanded={expandedIds.has(s.id)}
                  onToggle={() => toggleExpand(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
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
    if (
      !confirm(
        "이 세션을 종료하고 노트를 AI 요약하여 일일 보고에 적재합니다. 계속할까요?"
      )
    )
      return;
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
    if (
      !confirm(
        "이 세션을 취소합니다. Google Calendar 이벤트도 함께 삭제됩니다. 계속할까요?"
      )
    )
      return;
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
    <article className="rounded-[10px] border border-line bg-canvas overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="grid place-items-center w-6 h-6 rounded hover:bg-canvas-2 text-ink-4 hover:text-ink shrink-0"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <CalendarClock className="h-3.5 w-3.5 text-ink-5 shrink-0" />
          <span className="text-[12px] tabular-nums text-ink-3 shrink-0">
            {dateLabel}
          </span>
          <span className="text-[11px] text-ink-5 shrink-0">
            {session.durationMinutes}분
          </span>
          <span className="text-[11.5px] text-ink truncate">
            · {session.hostName}
          </span>
        </button>
        <span
          className={cn(
            "inline-block rounded-full border px-1.5 py-px text-[10.5px] font-medium shrink-0",
            STATUS_COLORS[session.status]
          )}
        >
          {STATUS_LABEL[session.status]}
        </span>
      </header>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-line space-y-3">
          {/* Meet URL · Calendar 링크 */}
          <div className="flex items-center gap-2 flex-wrap">
            {session.meetUrl ? (
              <>
                <a
                  href={session.meetUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[12px] font-semibold"
                >
                  <Video className="h-3.5 w-3.5" />
                  Meet 입장
                </a>
                <button
                  type="button"
                  onClick={handleCopyMeet}
                  className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong"
                  title="Meet 링크 복사"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  복사
                </button>
              </>
            ) : (
              <span className="text-[11.5px] text-amber-700">
                ⚠️ Meet 링크 없음 (Calendar 미연동 또는 발급 실패)
              </span>
            )}
            {session.calendarHtmlLink && (
              <a
                href={session.calendarHtmlLink}
                target="_blank"
                rel="noopener"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-4 hover:text-ink"
              >
                <ExternalLink className="h-3 w-3" />
                Calendar
              </a>
            )}
          </div>

          {/* 요약 (완료된 경우) */}
          {session.summary && (
            <div className="rounded-[8px] border border-emerald-200 bg-emerald-50/50 p-3">
              <h6 className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">
                AI 요약 (일일 보고에 적재됨)
              </h6>
              <pre className="text-[12px] text-ink whitespace-pre-wrap leading-relaxed font-sans">
                {session.summary}
              </pre>
            </div>
          )}

          {/* 노트 에디터 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h6 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
                노트 (markdown)
              </h6>
              {editable && (
                <span className="text-[10.5px] text-ink-5 inline-flex items-center gap-1">
                  {savingNotes ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      저장 중
                    </>
                  ) : (
                    "자동 저장"
                  )}
                </span>
              )}
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => handleNotesChange(e.target.value)}
              disabled={!editable}
              rows={isPast || session.status === "IN_PROGRESS" ? 8 : 5}
              placeholder="통화 중 실시간으로 작성하거나 통화 후 정리하세요. 종료 시 AI 요약이 일일 보고에 자동 적재됩니다."
              className="w-full rounded-[8px] border border-line bg-canvas px-2.5 py-2 text-[12.5px] leading-relaxed font-mono resize-y focus:outline-none focus:border-line-strong disabled:opacity-60"
            />
          </div>

          {/* 액션 버튼 */}
          {editable && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending || summarizing}
                className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2.5 py-1 text-[12px] text-red-600 hover:text-red-700 hover:border-red-300 disabled:opacity-50"
              >
                <XCircle className="h-3 w-3" />
                세션 취소
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={isPending || summarizing || !notesDraft.trim()}
                className="inline-flex items-center gap-1 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              >
                {summarizing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                종료 + AI 요약 → 일일 보고 적재
              </button>
            </div>
          )}
          {session.status === "COMPLETED" && (
            <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              완료된 세션입니다.
            </p>
          )}
        </div>
      )}
    </article>
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
      className="rounded-[10px] border-2 border-ink/10 bg-panel p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <h5 className="text-[12px] font-semibold text-ink">새 화상 세션 예약</h5>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="text-[11px] text-ink-5 hover:text-ink"
        >
          닫기
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isPending}
            className="field"
          />
        </Field>
        <Field label="시간 (KST)">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={isPending}
            className="field"
          />
        </Field>
        <Field label="길이 (분)">
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={isPending}
            className="field"
          >
            <option value="15">15</option>
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
            <option value="90">90</option>
            <option value="120">120</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-[8px] border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-3"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-[8px] bg-ink text-white px-3 py-1 text-[12px] font-semibold disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          예약 + Meet 링크 생성
        </button>
      </div>
      <style jsx>{`
        .field {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--canvas);
          padding: 6px 10px;
          font-size: 12.5px;
        }
        .field:focus {
          outline: none;
          border-color: var(--line-strong);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-ink-4">{label}</span>
      {children}
    </label>
  );
}

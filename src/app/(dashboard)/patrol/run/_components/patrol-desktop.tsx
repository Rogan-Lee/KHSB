"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Square,
  ScanLine,
  Check,
  AlertTriangle,
  UserX,
  ShieldCheck,
  Loader2,
  Search,
  Flag,
  X,
} from "lucide-react";
import { QrScanner } from "@/app/w/[token]/_components/qr-scanner";
import { decodeStudentQr } from "@/lib/patrol";
import {
  startPatrolRound,
  endPatrolRound,
  recordPatrol,
  getPatrolStudentInfo,
  type PatrolPortalData,
  type PatrolRecordView,
  type PatrolStudentInfo,
} from "@/actions/patrol";
import { flagStudentAttention, clearStudentAttention } from "@/actions/attention";
import type { AttentionStudent } from "@/lib/attention";
import type { PatrolStatus } from "@/generated/prisma";
import { TagPill } from "@/components/ui/tag-pill";
import { cn } from "@/lib/utils";

const STATUS_META: Record<PatrolStatus, { label: string; icon: typeof Check; pill: "ok" | "warn" | "neutral" }> = {
  OK: { label: "양호", icon: Check, pill: "ok" },
  NOTE: { label: "특이사항", icon: AlertTriangle, pill: "warn" },
  ABSENT: { label: "자리비움", icon: UserX, pill: "neutral" },
};

type Target = { id: string; name: string; seat: string | null; existing?: PatrolRecordView };

export function PatrolDesktop({
  initial,
  attention,
  autoStart = false,
}: {
  initial: PatrolPortalData;
  attention: AttentionStudent[];
  autoStart?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [draftStatus, setDraftStatus] = useState<PatrolStatus>("OK");
  const [draftNote, setDraftNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<PatrolStudentInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  // 우측 패널 — 유의 관찰 수동 지정 입력
  const [flagFormOpen, setFlagFormOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const round = data.activeRound;
  const checkedById = useMemo(() => {
    const m = new Map<string, PatrolRecordView>();
    for (const r of data.records) m.set(r.studentId, r);
    return m;
  }, [data.records]);
  const attentionIds = useMemo(() => new Set(attention.map((a) => a.studentId)), [attention]);

  const checkedCount = data.records.length;
  const rosterCount = data.roster.length;
  const pct = rosterCount > 0 ? Math.min(100, Math.round((checkedCount / rosterCount) * 100)) : 0;

  const filteredRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.roster;
    return data.roster.filter((s) => `${s.name} ${s.grade} ${s.seat ?? ""}`.toLowerCase().includes(q));
  }, [query, data.roster]);

  const offRosterRecords = useMemo(
    () => data.records.filter((r) => !data.roster.find((s) => s.id === r.studentId)),
    [data.records, data.roster],
  );

  function loadInfo(studentId: string) {
    setInfo(null);
    setInfoLoading(true);
    getPatrolStudentInfo(undefined, studentId)
      .then((d) => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setInfoLoading(false));
  }

  function selectStudent(student: { id: string; name: string; seat: string | null }) {
    const existing = checkedById.get(student.id);
    setDraftStatus(existing?.status ?? "OK");
    setDraftNote(existing?.note ?? "");
    setTarget({ ...student, existing });
    setScanning(false);
    setFlagFormOpen(false);
    setFlagReason("");
    loadInfo(student.id);
  }

  function handleScan(raw: string) {
    const studentId = decodeStudentQr(raw);
    if (!studentId) {
      toast.error("순찰용 QR이 아니에요");
      return;
    }
    const found =
      data.roster.find((s) => s.id === studentId) ?? data.allStudents.find((s) => s.id === studentId);
    selectStudent(found ?? { id: studentId, name: "스캔된 학생", seat: null });
  }

  function handleStart() {
    startTransition(async () => {
      try {
        const r = await startPatrolRound(undefined);
        setData((prev) => ({
          ...prev,
          activeRound: { id: r.id, label: r.label, startedAt: r.startedAt },
          records: [],
        }));
        toast.success(r.reused ? "진행 중인 회차에 합류했어요" : "순찰 회차를 시작했어요");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "시작 실패");
      }
    });
  }

  // 진입 즉시 진행 중 회차가 없으면 1회 자동 시작
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !round && !autoStarted.current) {
      autoStarted.current = true;
      handleStart();
    }
  }, [autoStart, round]);

  function handleEnd() {
    if (!round) return;
    if (!confirm("이번 순찰 회차를 종료할까요?")) return;
    startTransition(async () => {
      try {
        await endPatrolRound(undefined, round.id);
        setData((prev) => ({ ...prev, activeRound: null, records: [] }));
        setScanning(false);
        setTarget(null);
        toast.success("회차를 종료했어요");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "종료 실패");
      }
    });
  }

  function handleSave() {
    if (!round || !target) return;
    startTransition(async () => {
      try {
        const rec = await recordPatrol(undefined, round.id, target.id, draftStatus, draftNote);
        setData((prev) => {
          const others = prev.records.filter((r) => r.studentId !== rec.studentId);
          return { ...prev, records: [rec, ...others] };
        });
        toast.success(`${rec.studentName} · ${STATUS_META[rec.status].label} 기록`);
        setTarget(null);
        setInfo(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function handleFlag() {
    if (!target) return;
    const reason = flagReason.trim();
    if (!reason) {
      toast.error("사유를 입력하세요");
      return;
    }
    startTransition(async () => {
      try {
        await flagStudentAttention(target.id, reason);
        setInfo((cur) => (cur ? { ...cur, attentionFlag: true, attentionReason: reason } : cur));
        setFlagFormOpen(false);
        setFlagReason("");
        toast.success("유의 관찰로 지정했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  function handleClearFlag() {
    if (!target) return;
    startTransition(async () => {
      try {
        await clearStudentAttention(target.id);
        setInfo((cur) => (cur ? { ...cur, attentionFlag: false, attentionReason: null } : cur));
        toast.success("유의 관찰을 해제했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 모바일 안내 */}
      <div className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-[12px] text-warn-ink md:hidden">
        순찰 모드는 데스크탑에서 사용하세요. 모바일은 매직링크 순찰 화면을 이용해 주세요.
      </div>

      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-xs)]">
        <ShieldCheck className="h-5 w-5 text-brand" />
        <h1 className="text-[15px] font-bold tracking-[-0.01em] text-ink">순찰 — {data.patrollerName}</h1>
        {round && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[11px] font-semibold text-ok-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> 진행중
          </span>
        )}
        {round && (
          <div className="flex min-w-[180px] flex-1 items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-2">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-2">
              점검 {checkedCount} <span className="text-ink-4">/ 재실 {rosterCount}</span>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {round && (
            <button
              type="button"
              onClick={() => setScanning((s) => !s)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium",
                scanning ? "border-brand bg-brand-soft text-brand-2" : "border-line text-ink-3 hover:bg-panel-2",
              )}
            >
              <ScanLine className="h-3.5 w-3.5" /> {scanning ? "스캔 중지" : "QR 스캔"}
            </button>
          )}
          {round ? (
            <button
              type="button"
              onClick={handleEnd}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-3 hover:bg-panel-2 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> 순찰 종료
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" /> 순찰 시작
            </button>
          )}
        </div>
      </div>

      {/* QR 스캐너 (선택) */}
      {round && scanning && (
        <div className="mx-auto max-w-sm rounded-xl border border-line bg-panel p-3 shadow-[var(--shadow-xs)]">
          <QrScanner active={scanning} onScan={handleScan} onError={(m) => toast.error(m)} />
          <p className="mt-2 text-center text-[12px] text-ink-4">좌석 QR을 사각형 안에 비춰주세요</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_360px] md:items-start">
        {/* 좌: 유의 관찰 + 명단 */}
        <div className="space-y-3 min-w-0">
          {/* 유의 관찰 학생 */}
          {attention.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-warn-soft bg-warn-soft/40 shadow-[var(--shadow-xs)]">
              <p className="flex items-center gap-1.5 border-b border-warn-soft px-4 py-2.5 text-[12.5px] font-semibold text-warn-ink">
                <AlertTriangle className="h-3.5 w-3.5" /> 유의 관찰 학생 ({attention.length})
              </p>
              <ul className="divide-y divide-warn-soft/60">
                {attention.map((a) => {
                  const rec = checkedById.get(a.studentId);
                  const inRoster = data.roster.some((s) => s.id === a.studentId);
                  return (
                    <li key={a.studentId}>
                      <button
                        type="button"
                        onClick={() => selectStudent({ id: a.studentId, name: a.name, seat: a.seat })}
                        className={cn(
                          "flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-warn-soft/50",
                          target?.id === a.studentId && "bg-warn-soft/70",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            a.severity === "high" ? "bg-bad" : "bg-warn",
                          )}
                        />
                        <span className="shrink-0 text-[13.5px] font-semibold text-ink">{a.name}</span>
                        <span className="shrink-0 text-[11px] text-ink-4">{a.grade}</span>
                        {a.isManual && <TagPill variant="brand">수동</TagPill>}
                        {!inRoster && <span className="text-[10.5px] text-ink-4">(미재실)</span>}
                        <span className="ml-auto flex items-center gap-1">
                          {a.reasons[0] && (
                            <TagPill variant={a.severity === "high" ? "bad" : "warn"}>{a.reasons[0].label}</TagPill>
                          )}
                          {rec && <TagPill variant={STATUS_META[rec.status].pill}>{STATUS_META[rec.status].label}</TagPill>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 재실 명단 테이블 */}
          <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-xs)]">
            <div className="flex items-center gap-2 border-b border-line-2 px-3 py-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름 · 학년 · 좌석 검색"
                  className="h-8 w-full rounded-md border border-line bg-canvas pl-8 pr-2 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>
              <span className="shrink-0 text-[11.5px] text-ink-4 tabular-nums">
                {filteredRoster.length} / {rosterCount}
              </span>
            </div>

            {rosterCount === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-4">오늘 재실(체크인) 학생이 없어요</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line-2 bg-panel-2 text-[11px] font-semibold text-ink-4">
                    <th className="w-16 px-3 py-2 text-left">좌석</th>
                    <th className="px-3 py-2 text-left">이름</th>
                    <th className="w-16 px-3 py-2 text-left">학년</th>
                    <th className="w-24 px-3 py-2 text-right">점검상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((s) => {
                    const rec = checkedById.get(s.id);
                    const isTarget = target?.id === s.id;
                    const flagged = attentionIds.has(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        className={cn(
                          "cursor-pointer border-b border-line-2 last:border-0 hover:bg-panel-2",
                          isTarget && "bg-brand-softer",
                          flagged && "border-l-2 border-l-warn",
                        )}
                      >
                        <td className="px-3 py-2 font-mono text-[12px] text-ink-4">{s.seat ?? "—"}</td>
                        <td className="px-3 py-2 font-medium text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            {flagged && <Flag className="h-3 w-3 text-warn" />}
                            {s.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11.5px] text-ink-4">{s.grade}</td>
                        <td className="px-3 py-2 text-right">
                          {rec ? (
                            <TagPill variant={STATUS_META[rec.status].pill}>{STATUS_META[rec.status].label}</TagPill>
                          ) : (
                            <TagPill variant="neutral">진행중</TagPill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRoster.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-ink-4">
                        검색 결과 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* 명단 외 점검 */}
          {offRosterRecords.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-xs)]">
              <p className="border-b border-line-2 px-4 py-2.5 text-[12px] font-semibold text-ink-4">명단 외 점검</p>
              <ul className="divide-y divide-line-2">
                {offRosterRecords.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectStudent({ id: r.studentId, name: r.studentName, seat: r.seat })}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-panel-2"
                    >
                      <span className="w-12 shrink-0 font-mono text-[12px] text-ink-4">{r.seat ?? "—"}</span>
                      <span className="flex-1 text-[13.5px] font-medium text-ink">{r.studentName}</span>
                      <TagPill variant={STATUS_META[r.status].pill}>{STATUS_META[r.status].label}</TagPill>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 우: 선택 학생 상세 패널 */}
        <div className="rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow-xs)] md:sticky md:top-3">
          {!target ? (
            <div className="py-16 text-center text-[13px] text-ink-4">
              왼쪽 명단에서 학생을 선택하세요
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[16px] font-bold text-ink">{info?.name ?? target.name}</p>
                  <p className="text-[12px] text-ink-4">
                    {[info?.school, info?.grade, (info?.seat ?? target.seat) ? `좌석 ${info?.seat ?? target.seat}` : null]
                      .filter(Boolean)
                      .join(" · ") || "정보 불러오는 중…"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(null)}
                  className="rounded-lg p-1.5 text-ink-4 hover:bg-panel-2"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 유의 관찰 배너/지정 */}
              {info && (
                info.attentionFlag ? (
                  <div className="rounded-lg border border-warn-soft bg-warn-soft/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-warn-ink">
                        <Flag className="h-3.5 w-3.5" /> 유의 관찰 대상
                      </span>
                      <button
                        type="button"
                        onClick={handleClearFlag}
                        disabled={pending}
                        className="text-[11.5px] font-medium text-ink-3 underline underline-offset-2 hover:text-ink disabled:opacity-50"
                      >
                        해제
                      </button>
                    </div>
                    {info.attentionReason && (
                      <p className="mt-1 text-[12.5px] text-ink-2 whitespace-pre-wrap">{info.attentionReason}</p>
                    )}
                  </div>
                ) : flagFormOpen ? (
                  <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-2.5">
                    <input
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      autoFocus
                      placeholder="유의 관찰 사유 (예: 최근 집중도 저하)"
                      className="w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setFlagFormOpen(false); setFlagReason(""); }}
                        className="text-[12px] text-ink-4 hover:text-ink"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleFlag}
                        disabled={pending}
                        className="inline-flex h-7 items-center rounded-md bg-brand px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                      >
                        지정
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFlagFormOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    <Flag className="h-3.5 w-3.5" /> 유의 관찰로 지정
                  </button>
                )
              )}

              {/* 학생 메모 */}
              {infoLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2.5 text-[12.5px] text-ink-4">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 학생 정보 불러오는 중…
                </div>
              ) : info && (info.mentoringNotes || info.studentInfo || info.dailyNote) ? (
                <div className="space-y-1.5 rounded-lg bg-panel-2 px-3 py-2.5">
                  {info.dailyNote && <InfoRow label="당일 변동" value={info.dailyNote} tone="warn" />}
                  {info.mentoringNotes && <InfoRow label="멘토링 주의" value={info.mentoringNotes} />}
                  {info.studentInfo && <InfoRow label="학생 정보" value={info.studentInfo} />}
                </div>
              ) : null}

              {/* 상태 선택 */}
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(STATUS_META) as PatrolStatus[]).map((st) => {
                  const meta = STATUS_META[st];
                  const Icon = meta.icon;
                  const selected = draftStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDraftStatus(st)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 py-2.5 text-[12.5px] font-semibold transition",
                        selected ? "border-brand bg-brand text-white" : "border-line text-ink-3 hover:bg-panel-2",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              {draftStatus === "NOTE" && (
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={3}
                  placeholder="특이사항 내용 (예: 졸고 있음, 자리 이탈, 휴대폰 사용)"
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] focus:border-brand focus:outline-none"
                />
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={pending || !round}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {target.existing ? "수정 저장" : "점검 기록"}
              </button>
              {!round && (
                <p className="text-center text-[11.5px] text-ink-4">순찰을 시작해야 점검을 기록할 수 있어요</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex gap-2 text-[12.5px]">
      <span className={cn("shrink-0 font-semibold", tone === "warn" ? "text-warn-ink" : "text-ink-4")}>{label}</span>
      <span className="whitespace-pre-wrap text-ink-2">{value}</span>
    </div>
  );
}

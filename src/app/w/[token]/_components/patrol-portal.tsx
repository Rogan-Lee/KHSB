"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Play,
  Square,
  ScanLine,
  Check,
  AlertTriangle,
  UserX,
  X,
  ShieldCheck,
  Search,
  Loader2,
} from "lucide-react";
import { QrScanner } from "./qr-scanner";
import { decodeStudentQr } from "@/lib/patrol";
import {
  startPatrolRound,
  endPatrolRound,
  recordPatrol,
  getPatrolStudentInfo,
  type PatrolPortalData,
  type PatrolRecordView,
  type PatrolRosterStudent,
  type PatrolStudentInfo,
} from "@/actions/patrol";
import type { PatrolStatus } from "@/generated/prisma";

const STATUS_META: Record<PatrolStatus, { label: string; cls: string; icon: typeof Check }> = {
  OK: { label: "양호", cls: "bg-emerald-100 text-emerald-700", icon: Check },
  NOTE: { label: "특이사항", cls: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  ABSENT: { label: "자리비움", cls: "bg-gray-200 text-gray-600", icon: UserX },
};

type Target = { id: string; name: string; seat: string | null; existing?: PatrolRecordView };

export function PatrolPortal({
  token,
  initial,
  autoStart = false,
}: {
  token?: string;
  initial: PatrolPortalData;
  autoStart?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [scanning, setScanning] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [draftStatus, setDraftStatus] = useState<PatrolStatus>("OK");
  const [draftNote, setDraftNote] = useState("");
  const [pending, startTransition] = useTransition();
  // 스캔/선택한 학생 상세
  const [info, setInfo] = useState<PatrolStudentInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  // 잘못 스캔 시 학생 검색·교체
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const round = data.activeRound;
  const checkedById = useMemo(() => {
    const m = new Map<string, PatrolRecordView>();
    for (const r of data.records) m.set(r.studentId, r);
    return m;
  }, [data.records]);

  const checkedCount = data.records.length;
  const rosterCount = data.roster.length;
  const pct = rosterCount > 0 ? Math.min(100, Math.round((checkedCount / rosterCount) * 100)) : 0;
  const noteRecords = useMemo(() => data.records.filter((r) => r.status === "NOTE"), [data.records]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.allStudents.slice(0, 30);
    return data.allStudents
      .filter((s) => `${s.name} ${s.grade} ${s.seat ?? ""}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, data.allStudents]);

  function loadInfo(studentId: string) {
    setInfo(null);
    setInfoLoading(true);
    getPatrolStudentInfo(token, studentId)
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
    setSearchOpen(false);
    setQuery("");
    loadInfo(student.id);
  }

  function handleScan(raw: string) {
    const studentId = decodeStudentQr(raw);
    if (!studentId) {
      toast.error("순찰용 QR이 아니에요");
      return;
    }
    const found = data.roster.find((s) => s.id === studentId) ?? data.allStudents.find((s) => s.id === studentId);
    selectStudent(found ?? { id: studentId, name: "스캔된 학생", seat: null });
  }

  function handleStart() {
    startTransition(async () => {
      try {
        const r = await startPatrolRound(token);
        setData((prev) => ({ ...prev, activeRound: { id: r.id, label: r.label, startedAt: r.startedAt }, records: [] }));
        toast.success(r.reused ? "진행 중인 회차에 합류했어요" : "순찰 회차를 시작했어요");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "시작 실패");
      }
    });
  }

  // 앱 내 순찰 모드: 진행 중 회차가 없으면 진입 즉시 1회 자동 시작 → "바로 순찰중 모드"
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !round && !autoStarted.current) {
      autoStarted.current = true;
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, round]);

  function handleEnd() {
    if (!round) return;
    if (!confirm("이번 순찰 회차를 종료할까요?")) return;
    startTransition(async () => {
      try {
        await endPatrolRound(token, round.id);
        setData((prev) => ({ ...prev, activeRound: null, records: [] }));
        setScanning(false);
        toast.success("회차를 종료했어요");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "종료 실패");
      }
    });
  }

  function closeSheet() {
    setTarget(null);
    setInfo(null);
    setSearchOpen(false);
    setQuery("");
  }

  function handleSave() {
    if (!round || !target) return;
    startTransition(async () => {
      try {
        const rec = await recordPatrol(token, round.id, target.id, draftStatus, draftNote);
        setData((prev) => {
          const others = prev.records.filter((r) => r.studentId !== rec.studentId);
          return { ...prev, records: [rec, ...others] };
        });
        toast.success(`${rec.studentName} · ${STATUS_META[rec.status].label} 기록`);
        closeSheet();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <div className="min-h-[100svh] bg-[#f5f6fa] pb-24" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* 헤더 */}
      <header className="bg-slate-900 px-4 py-4 text-white">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">순찰 — {data.patrollerName}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-[480px] space-y-4 px-4 py-4">
        {!round ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <p className="text-[13px] text-gray-500">진행 중인 순찰 회차가 없어요.</p>
            <button
              type="button"
              onClick={handleStart}
              disabled={pending}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> 순찰 시작
            </button>
          </div>
        ) : (
          <>
            {/* 진행 상황 */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-gray-500">진행 중 회차</p>
                  <p className="text-[15px] font-bold text-gray-900">
                    점검 {checkedCount} <span className="text-gray-400">/ 재실 {rosterCount}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEnd}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600"
                >
                  <Square className="h-3.5 w-3.5" /> 종료
                </button>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* 스캐너 */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setScanning((s) => !s)}
                className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold ${scanning ? "bg-gray-100 text-gray-700" : "bg-slate-900 text-white"}`}
              >
                <ScanLine className="h-4 w-4" /> {scanning ? "스캔 중지" : "좌석 QR 스캔"}
              </button>
              {scanning && (
                <div className="mt-3">
                  <QrScanner active={scanning} onScan={handleScan} onError={(m) => toast.error(m)} />
                  <p className="mt-2 text-center text-[12px] text-gray-400">좌석 QR을 사각형 안에 비춰주세요</p>
                </div>
              )}
            </div>

            {/* 이번 회차 특이사항 */}
            {noteRecords.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
                <p className="flex items-center gap-1.5 border-b border-amber-200/70 px-4 py-2.5 text-[12px] font-semibold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> 이번 회차 특이사항 ({noteRecords.length})
                </p>
                <ul className="divide-y divide-amber-100">
                  {noteRecords.map((r) => (
                    <li key={r.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 font-mono text-[12px] text-amber-700/70">{r.seat ?? "—"}</span>
                        <span className="text-[14px] font-semibold text-gray-900">{r.studentName}</span>
                      </div>
                      {r.note && <p className="mt-0.5 pl-12 text-[13px] text-gray-700">{r.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 재실 명단 (수동 점검 / 진행 현황) */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <p className="border-b border-gray-100 px-4 py-2.5 text-[12px] font-semibold text-gray-500">
                재실 명단 ({rosterCount})
              </p>
              {rosterCount === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-gray-400">오늘 재실(체크인) 학생이 없어요</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {data.roster.map((s) => {
                    const rec = checkedById.get(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectStudent(s)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-gray-50"
                        >
                          <span className="w-12 shrink-0 font-mono text-[12px] text-gray-400">{s.seat ?? "—"}</span>
                          <span className="flex-1 text-[14px] font-medium text-gray-900">{s.name}</span>
                          <span className="text-[11px] text-gray-400">{s.grade}</span>
                          {rec && <StatusPill status={rec.status} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 명단 외 점검 기록 (스캔으로 추가된 비-재실 학생) */}
            {data.records.some((r) => !data.roster.find((s) => s.id === r.studentId)) && (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                <p className="border-b border-gray-100 px-4 py-2.5 text-[12px] font-semibold text-gray-500">명단 외 점검</p>
                <ul className="divide-y divide-gray-50">
                  {data.records
                    .filter((r) => !data.roster.find((s) => s.id === r.studentId))
                    .map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => selectStudent({ id: r.studentId, name: r.studentName, seat: r.seat })}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-gray-50"
                        >
                          <span className="w-12 shrink-0 font-mono text-[12px] text-gray-400">{r.seat ?? "—"}</span>
                          <span className="flex-1 text-[14px] font-medium text-gray-900">{r.studentName}</span>
                          <StatusPill status={r.status} />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* 점검 입력 시트 */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closeSheet}>
          <div
            className="max-h-[92svh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-gray-900">{info?.name ?? target.name}</p>
                <p className="text-[12px] text-gray-500">
                  {[info?.school, info?.grade, (info?.seat ?? target.seat) ? `좌석 ${info?.seat ?? target.seat}` : null]
                    .filter(Boolean)
                    .join(" · ") || "정보 불러오는 중…"}
                </p>
              </div>
              <button type="button" onClick={closeSheet} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 학생 개인정보 (순찰 메모) */}
            {infoLoading ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-[13px] text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 학생 정보 불러오는 중…
              </div>
            ) : info && (info.mentoringNotes || info.studentInfo || info.dailyNote) ? (
              <div className="mb-3 space-y-1.5 rounded-xl bg-gray-50 px-3 py-2.5">
                {info.dailyNote && <InfoRow label="당일 변동" value={info.dailyNote} tone="warn" />}
                {info.mentoringNotes && <InfoRow label="멘토링 주의" value={info.mentoringNotes} />}
                {info.studentInfo && <InfoRow label="학생 정보" value={info.studentInfo} />}
              </div>
            ) : null}

            {/* 다른 학생으로 교체 (QR 오스캔 대비) */}
            <div className="mb-3">
              {!searchOpen ? (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 underline underline-offset-2"
                >
                  <Search className="h-3.5 w-3.5" /> 다른 학생이에요 (검색)
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 p-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    placeholder="이름 / 학년 / 좌석 검색"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[16px] focus:border-slate-400 focus:outline-none"
                  />
                  <ul className="mt-2 max-h-52 divide-y divide-gray-50 overflow-y-auto">
                    {searchResults.map((s: PatrolRosterStudent) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectStudent(s)}
                          className="flex w-full items-center gap-2 px-1 py-2 text-left active:bg-gray-50"
                        >
                          <span className="w-12 shrink-0 font-mono text-[12px] text-gray-400">{s.seat ?? "—"}</span>
                          <span className="flex-1 text-[15px] font-medium text-gray-900">{s.name}</span>
                          <span className="text-[12px] text-gray-400">{s.grade}</span>
                        </button>
                      </li>
                    ))}
                    {searchResults.length === 0 && (
                      <li className="px-1 py-3 text-center text-[13px] text-gray-400">검색 결과 없음</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

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
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-[13px] font-semibold transition ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-gray-200 text-gray-600"}`}
                  >
                    <Icon className="h-5 w-5" />
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
                autoFocus
                placeholder="특이사항 내용 (예: 졸고 있음, 자리 이탈, 휴대폰 사용)"
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[16px] focus:border-slate-400 focus:outline-none"
              />
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {target.existing ? "수정 저장" : "점검 기록"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className={`shrink-0 font-semibold ${tone === "warn" ? "text-amber-700" : "text-gray-500"}`}>{label}</span>
      <span className="text-gray-800 whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: PatrolStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

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
  Loader2,
  Flag,
  X,
  CheckCircle2,
  SearchX,
  Users,
} from "lucide-react";
import { QrScanner } from "@/app/w/[token]/_components/qr-scanner";
import { decodeStudentQr, formatAttendanceSpan, seatRoom, PATROL_NOTE_PRESETS } from "@/lib/patrol";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  FilterChip,
  Notice,
  PageHeader,
  ProgressBar,
  SearchField,
  Section,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";

// 점검 상태 → SEED 역할색: 양호 positive · 특이사항 warning · 자리비움 neutral
const STATUS_META: Record<
  PatrolStatus,
  { label: string; icon: typeof Check; tone: Tone; selected: string }
> = {
  OK: {
    label: "양호",
    icon: Check,
    tone: "ok",
    selected: "bg-bg-positive-weak text-fg-positive shadow-[inset_0_0_0_2px_var(--seed-color-stroke-positive-solid)]",
  },
  NOTE: {
    label: "특이사항",
    icon: AlertTriangle,
    tone: "warn",
    selected: "bg-bg-warning-weak text-fg-warning shadow-[inset_0_0_0_2px_var(--seed-color-stroke-warning-solid)]",
  },
  ABSENT: {
    label: "자리비움",
    icon: UserX,
    tone: "gray",
    selected: "bg-bg-neutral-weak text-fg-neutral shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-solid)]",
  },
};

// 빈 상세 패널 안내 — 순찰 기록 순서
const STEPS = [
  "명단에서 학생을 누르거나 좌석 QR을 스캔해요",
  "양호 · 특이사항 · 자리비움 중 하나를 골라요",
  "점검 기록을 누르면 다음 학생으로 넘어가요",
];

function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
}

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
  // 표시용: 미점검만 보기 · 회차 종료 확인
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

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
  // 완료 판정은 명단(재실) 학생 기준 — 명단 외 점검은 제외
  const rosterChecked = data.roster.filter((s) => checkedById.has(s.id)).length;
  const remaining = rosterCount - rosterChecked;
  const complete = rosterCount > 0 && remaining === 0;

  // 룸 칩 필터 — 실데이터에 존재하는 그룹만, 1개 이하면 칩 숨김
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const rooms = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.roster) {
      const r = seatRoom(s.seat);
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  }, [data.roster]);

  const filteredRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.roster.filter(
      (s) =>
        (!roomFilter || seatRoom(s.seat) === roomFilter) &&
        (!onlyUnchecked || !checkedById.has(s.id)) &&
        (!q || `${s.name} ${s.grade} ${s.seat ?? ""}`.toLowerCase().includes(q)),
    );
  }, [query, roomFilter, onlyUnchecked, checkedById, data.roster]);

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

  // 진입 직후 단 한 번만 자동 시작 판단. 마운트 시 진행 중 회차가 없을 때만 시작하고,
  // 이후 사용자가 "순찰 종료"로 회차를 닫아도 (round=null) 다시 시작하지 않도록 마운트 1회로 고정.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (autoStart && !round) handleStart();
    // 마운트 시 1회만 실행 — round/handleStart 변경에 재실행 금지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 종료 — 확인 다이얼로그(아래 Dialog)를 거쳐 runEnd 에서 처리
  function handleEnd() {
    if (!round) return;
    setEndOpen(true);
  }

  function runEnd() {
    if (!round) return;
    setEndOpen(false);
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
    <div className="flex flex-col gap-x5">
      {/* 모바일 안내 */}
      <Notice tone="warn" className="md:hidden">
        순찰 모드는 데스크탑에서 사용하세요. 모바일은 매직링크 순찰 화면을 이용해 주세요.
      </Notice>

      <PageHeader
        className="mb-0 md:mb-0"
        back={{ href: "/", label: "대시보드" }}
        title="순찰"
        meta={
          round ? (
            <StatusBadge tone="ok" size="large">진행 중</StatusBadge>
          ) : (
            <StatusBadge tone="gray" size="large">대기</StatusBadge>
          )
        }
        description={
          <span className="tabular-nums">
            순찰자 {data.patrollerName}
            {round && ` · ${round.label ? `${round.label} · ` : ""}${fmtClock(round.startedAt)} 시작`}
          </span>
        }
        actions={
          <>
            {round && (
              <Button
                variant={scanning ? "soft" : "outline"}
                aria-pressed={scanning}
                onClick={() => setScanning((s) => !s)}
              >
                <ScanLine /> {scanning ? "스캔 중지" : "QR 스캔"}
              </Button>
            )}
            {round ? (
              <Button variant="outline" onClick={handleEnd} disabled={pending}>
                <Square /> 순찰 종료
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Play />} 순찰 시작
              </Button>
            )}
          </>
        }
      />

      {/* 진행률 — 진행 중 회차가 있을 때만 */}
      {round ? (
        <section aria-label="점검 진행률" className="rounded-r4 bg-bg-layer-fill px-x5 py-x4">
          <div className="flex flex-wrap items-end justify-between gap-x3">
            <div>
              <p className="t4-medium text-fg-neutral-subtle">점검 진행</p>
              <p className="mt-x1 flex items-baseline gap-x1 tabular-nums">
                <span className="t10-bold text-fg-neutral">{checkedCount}</span>
                <span className="t5-medium text-fg-neutral-subtle">/ 재실 {rosterCount}명</span>
              </p>
            </div>
            <p className="t4-medium tabular-nums text-fg-neutral-muted">
              {complete ? (
                <span className="inline-flex items-center gap-x1 text-fg-positive">
                  <CheckCircle2 className="size-4" aria-hidden /> 모두 점검했어요
                </span>
              ) : (
                <>
                  남은 학생 <span className="t5-bold text-fg-brand">{remaining}</span>명 · {pct}%
                </>
              )}
            </p>
          </div>
          <ProgressBar value={pct / 100} tone={complete ? "ok" : "brand"} className="mt-x3" />
          {complete && (
            <p className="mt-x3 t4-regular text-fg-neutral-muted">
              재실 학생 점검을 모두 마쳤어요. 이상이 없으면 순찰을 종료해 주세요.
            </p>
          )}
        </section>
      ) : (
        <Notice tone="info" title="진행 중인 순찰이 없어요">
          순찰을 시작해야 점검을 기록할 수 있어요.
        </Notice>
      )}

      {/* QR 스캐너 (선택) */}
      {round && scanning && (
        <Section className="mx-auto w-full max-w-sm" title="QR 스캔" description="좌석 QR을 사각형 안에 비춰 주세요.">
          <QrScanner active={scanning} onScan={handleScan} onError={(m) => toast.error(m)} />
        </Section>
      )}

      <div className="grid grid-cols-1 gap-x4 md:grid-cols-[1fr_360px] md:items-start">
        {/* 좌: 유의 관찰 + 명단 */}
        <div className="flex min-w-0 flex-col gap-x4">
          {/* 유의 관찰 학생 */}
          {attention.length > 0 && (
            <Section flush title="유의 관찰 학생" count={attention.length} description="먼저 살펴볼 학생이에요.">
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {attention.map((a) => {
                  const rec = checkedById.get(a.studentId);
                  const inRoster = data.roster.some((s) => s.id === a.studentId);
                  return (
                    <li key={a.studentId}>
                      <button
                        type="button"
                        onClick={() => selectStudent({ id: a.studentId, name: a.name, seat: a.seat })}
                        className={cn(
                          "flex w-full items-center gap-x2 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed",
                          target?.id === a.studentId && "bg-bg-brand-weak hover:bg-bg-brand-weak",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            a.severity === "high" ? "bg-fg-critical" : "bg-fg-warning",
                          )}
                        />
                        <span className="shrink-0 t4-bold text-fg-neutral">{a.name}</span>
                        <span className="shrink-0 t3-regular text-fg-neutral-subtle">{a.grade}</span>
                        {a.isManual && <StatusBadge tone="brand">수동</StatusBadge>}
                        {!inRoster && <span className="t3-regular text-fg-neutral-subtle">(미재실)</span>}
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-x1">
                          {a.reasons[0] && (
                            <StatusBadge tone={a.severity === "high" ? "bad" : "warn"}>{a.reasons[0].label}</StatusBadge>
                          )}
                          {rec && <StatusBadge tone={STATUS_META[rec.status].tone}>{STATUS_META[rec.status].label}</StatusBadge>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* 재실 명단 */}
          <Section flush title="재실 명단" count={rosterCount}>
            <div className="flex flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x5 py-x3">
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 · 학년 · 좌석 검색"
                aria-label="학생 검색"
                className="sm:w-64"
              />
              <FilterChip
                selected={onlyUnchecked}
                count={remaining}
                onClick={() => setOnlyUnchecked((v) => !v)}
                className="h-9 px-x3_5 t4-medium"
              >
                미점검만
              </FilterChip>
              <span className="ml-auto shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
                {filteredRoster.length} / {rosterCount}
              </span>
            </div>

            {/* 룸 칩 필터 */}
            {rooms.length > 1 && (
              <div className="flex flex-wrap gap-x1_5 px-x5 pb-x3" role="group" aria-label="룸 필터">
                {[null, ...rooms].map((room) => (
                  <FilterChip
                    key={room ?? "__all"}
                    selected={roomFilter === room}
                    onClick={() => setRoomFilter(room)}
                  >
                    {room ?? "전체"}
                  </FilterChip>
                ))}
              </div>
            )}

            {rosterCount === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="오늘 재실(체크인) 학생이 없어요"
                description="입실한 학생이 생기면 여기에 명단이 나타나요."
                className="border-t border-stroke-neutral-muted"
              />
            ) : (
              <div className="border-t border-stroke-neutral-muted">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">좌석</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead className="w-16">학년</TableHead>
                      <TableHead className="w-24 text-right">점검</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoster.map((s) => {
                      const rec = checkedById.get(s.id);
                      const isTarget = target?.id === s.id;
                      const flagged = attentionIds.has(s.id);
                      const span = formatAttendanceSpan(s.checkInAt, s.checkOutAt);
                      return (
                        <TableRow
                          key={s.id}
                          onClick={() => selectStudent(s)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectStudent(s);
                            }
                          }}
                          tabIndex={0}
                          aria-selected={isTarget}
                          className={cn(
                            "cursor-pointer outline-none focus-visible:bg-bg-layer-default-pressed",
                            isTarget && "bg-bg-brand-weak hover:bg-bg-brand-weak",
                          )}
                        >
                          <TableCell className="text-center t5-bold tabular-nums">{s.seat ?? "—"}</TableCell>
                          <TableCell>
                            <span className="inline-flex flex-wrap items-center gap-x1_5">
                              {flagged && <Flag className="size-3.5 text-fg-warning" aria-label="유의 관찰" />}
                              <span className="t4-bold text-fg-neutral">{s.name}</span>
                              {span && <span className="t3-regular tabular-nums text-fg-neutral-subtle">{span}</span>}
                            </span>
                          </TableCell>
                          <TableCell className="t3-regular text-fg-neutral-muted">{s.grade}</TableCell>
                          <TableCell className="text-right">
                            {rec ? (
                              <StatusBadge tone={STATUS_META[rec.status].tone}>{STATUS_META[rec.status].label}</StatusBadge>
                            ) : (
                              <span className="t3-regular text-fg-neutral-subtle">미점검</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredRoster.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="p-0">
                          {onlyUnchecked && !query.trim() ? (
                            <EmptyState compact icon={CheckCircle2} title="남은 학생이 없어요" description="이 조건의 재실 학생을 모두 점검했어요." />
                          ) : (
                            <EmptyState compact icon={SearchX} title="검색 결과가 없어요" />
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>

          {/* 명단 외 점검 */}
          {offRosterRecords.length > 0 && (
            <Section flush title="명단 외 점검" count={offRosterRecords.length}>
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {offRosterRecords.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectStudent({ id: r.studentId, name: r.studentName, seat: r.seat })}
                      className="flex w-full items-center gap-x3 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed"
                    >
                      <span className="w-12 shrink-0 t5-bold tabular-nums text-fg-neutral">{r.seat ?? "—"}</span>
                      <span className="flex-1 t4-bold text-fg-neutral">{r.studentName}</span>
                      <StatusBadge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* 우: 선택 학생 상세 패널 — self-stretch 로 컬럼을 행 높이만큼 늘려야 sticky 가 스크롤을 따라온다 */}
        <div className="md:self-stretch">
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 md:sticky md:top-20">
          {!target ? (
            <div className="flex flex-col gap-x5 py-x4">
              <div>
                <p className="t5-bold text-fg-neutral">학생을 선택하세요</p>
                <p className="mt-x1 t4-regular text-fg-neutral-subtle">이 순서대로 하면 빠르게 기록할 수 있어요.</p>
              </div>
              <ol className="flex flex-col gap-x3">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex items-center gap-x3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-neutral-weak t3-bold tabular-nums text-fg-neutral-muted">
                      {i + 1}
                    </span>
                    <span className="t4-regular text-fg-neutral-muted">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex flex-col gap-x4">
              <div className="flex items-start justify-between gap-x2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x2">
                    <p className="t7-bold text-fg-neutral">{info?.name ?? target.name}</p>
                    {target.existing && (
                      <StatusBadge tone={STATUS_META[target.existing.status].tone}>
                        점검함 · {STATUS_META[target.existing.status].label}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
                    {[info?.school, info?.grade, (info?.seat ?? target.seat) ? `좌석 ${info?.seat ?? target.seat}` : null]
                      .filter(Boolean)
                      .join(" · ") || "정보 불러오는 중…"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(null)}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
                  aria-label="닫기"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* 유의 관찰 배너/지정 */}
              {info && (
                info.attentionFlag ? (
                  <div className="rounded-r3 bg-bg-warning-weak px-x4 py-x3">
                    <div className="flex items-center justify-between gap-x2">
                      <span className="inline-flex items-center gap-x1_5 t4-bold text-fg-warning">
                        <Flag className="size-4" aria-hidden /> 유의 관찰 대상
                      </span>
                      <Button variant="ghost" size="xs" onClick={handleClearFlag} disabled={pending}>
                        해제
                      </Button>
                    </div>
                    {info.attentionReason && (
                      <p className="mt-x1 whitespace-pre-wrap t4-regular text-fg-neutral">{info.attentionReason}</p>
                    )}
                  </div>
                ) : flagFormOpen ? (
                  <div className="flex flex-col gap-x2 rounded-r3 bg-bg-layer-fill p-x3">
                    <Input
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      autoFocus
                      aria-label="유의 관찰 사유"
                      placeholder="유의 관찰 사유 (예: 최근 집중도 저하)"
                    />
                    <div className="flex justify-end gap-x2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setFlagFormOpen(false); setFlagReason(""); }}
                      >
                        취소
                      </Button>
                      <Button size="sm" onClick={handleFlag} disabled={pending}>
                        지정
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFlagFormOpen(true)}
                    className="w-fit text-fg-neutral-muted"
                  >
                    <Flag /> 유의 관찰로 지정
                  </Button>
                )
              )}

              {/* 학생 메모 */}
              {infoLoading ? (
                <div className="flex items-center gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3 t4-regular text-fg-neutral-subtle">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> 학생 정보 불러오는 중…
                </div>
              ) : info && (info.mentoringNotes || info.studentInfo || info.dailyNote) ? (
                <div className="flex flex-col gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
                  {info.dailyNote && <InfoRow label="당일 변동" value={info.dailyNote} tone="warn" />}
                  {info.mentoringNotes && <InfoRow label="멘토링 주의" value={info.mentoringNotes} />}
                  {info.studentInfo && <InfoRow label="학생 정보" value={info.studentInfo} />}
                </div>
              ) : null}

              {/* 상태 선택 */}
              <div className="flex flex-col gap-x2">
                <p className="t4-medium text-fg-neutral">점검 상태</p>
                <div className="grid grid-cols-3 gap-x2" role="group" aria-label="점검 상태">
                  {(Object.keys(STATUS_META) as PatrolStatus[]).map((st) => {
                    const meta = STATUS_META[st];
                    const Icon = meta.icon;
                    const selected = draftStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraftStatus(st)}
                        className={cn(
                          "flex h-x16 flex-col items-center justify-center gap-x1 rounded-r3 t4-bold transition-colors",
                          selected
                            ? meta.selected
                            : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 특이사항 프리셋 칩 — 탭하면 NOTE 상태로 전환 + note 에 append */}
              <div className="flex flex-col gap-x2">
                <p className="t3-medium text-fg-neutral-subtle">자주 쓰는 특이사항</p>
                <div className="flex flex-wrap gap-x1_5">
                  {PATROL_NOTE_PRESETS.map((p) => (
                    <FilterChip
                      key={p}
                      onClick={() => {
                        setDraftStatus("NOTE");
                        setDraftNote((prev) => (prev.trim() ? `${prev.trim()}, ${p}` : p));
                      }}
                    >
                      {p}
                    </FilterChip>
                  ))}
                </div>
              </div>

              {draftStatus === "NOTE" && (
                <Textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={3}
                  aria-label="특이사항 내용"
                  placeholder="특이사항 내용 (예: 졸고 있음, 자리 이탈, 휴대폰 사용)"
                />
              )}

              <Button size="lg" onClick={handleSave} disabled={pending || !round} className="w-full">
                {pending ? "저장 중…" : target.existing ? "수정 저장" : "점검 기록"}
              </Button>
              {!round && (
                <p className="text-center t3-regular text-fg-neutral-subtle">순찰을 시작해야 점검을 기록할 수 있어요</p>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* 회차 종료 확인 */}
      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>이번 순찰 회차를 종료할까요?</DialogTitle>
            <DialogDescription>
              {checkedCount}명을 점검했어요.
              {remaining > 0 && ` 아직 점검하지 않은 재실 학생이 ${remaining}명 있어요.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              계속 순찰
            </Button>
            <Button onClick={runEnd}>순찰 종료</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex gap-x2 t3-regular">
      <span className={cn("w-16 shrink-0 t3-bold", tone === "warn" ? "text-fg-warning" : "text-fg-neutral-subtle")}>{label}</span>
      <span className="min-w-0 whitespace-pre-wrap text-fg-neutral">{value}</span>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, Save, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getPatrolDayRoundsWithRecords, updatePatrolRecordByStaff, type PatrolRoundWithRecords } from "@/actions/patrol";
import type { PatrolStatus } from "@/generated/prisma";
import { EmptyState, Section, Segmented, StatusBadge, Toolbar, type Tone } from "@/components/backoffice/ui";

type PatrolRecordItem = PatrolRoundWithRecords["records"][number];

/** 순찰 기록 1행 — 클릭 시 인라인으로 상태/특이사항 수정 (관리자/스태프). */
function PatrolRecordRow({ rec, onSaved }: { rec: PatrolRecordItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<PatrolStatus>(rec.status);
  const [note, setNote] = useState(rec.note ?? "");
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      try {
        await updatePatrolRecordByStaff(rec.id, status, note);
        toast.success("수정되었습니다");
        setEditing(false);
        onSaved();
      } catch {
        toast.error("수정에 실패했습니다");
      }
    });
  }

  if (!editing) {
    return (
      <li className={cn("flex items-center gap-x3 px-x5 py-x3", rec.status === "NOTE" && "bg-bg-warning-weak")}>
        <span className="w-12 shrink-0 t5-bold tabular-nums text-fg-neutral">{rec.seat ?? "—"}</span>
        <span className="w-24 shrink-0 truncate t4-medium text-fg-neutral">{rec.studentName}</span>
        <StatusBadge tone={STATUS_META[rec.status].tone}>{STATUS_META[rec.status].label}</StatusBadge>
        {rec.note && <span className="min-w-0 flex-1 t4-regular text-fg-neutral-muted">{rec.note}</span>}
        <button
          type="button"
          onClick={() => { setStatus(rec.status); setNote(rec.note ?? ""); setEditing(true); }}
          aria-label={`${rec.studentName} 기록 수정`}
          title="수정"
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-r2 text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
        >
          <Pencil className="size-4" />
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x2 bg-bg-layer-fill px-x5 py-x3">
      <span className="w-12 shrink-0 t5-bold tabular-nums text-fg-neutral">{rec.seat ?? "—"}</span>
      <span className="w-24 shrink-0 truncate t4-medium text-fg-neutral">{rec.studentName}</span>
      <Segmented
        aria-label="점검 상태"
        options={(Object.keys(STATUS_META) as PatrolStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))}
        value={status}
        onChange={setStatus}
        className="w-auto"
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="특이사항"
        aria-label="특이사항"
        className="min-w-[160px] flex-1"
      />
      <Button size="sm" onClick={save} disabled={saving}>
        <Save />{saving ? "저장 중…" : "저장"}
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setEditing(false)} disabled={saving} aria-label="수정 취소">
        <X />
      </Button>
    </li>
  );
}

// 점검 상태 → SEED 역할색: 양호 positive · 특이사항 warning · 자리비움 neutral
const STATUS_META: Record<PatrolStatus, { label: string; tone: Tone }> = {
  OK: { label: "양호", tone: "ok" },
  NOTE: { label: "특이사항", tone: "warn" },
  ABSENT: { label: "자리비움", tone: "gray" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
}

// 근무자(순찰자) 단위로 회차를 묶은 형태
type PatrollerGroup = {
  key: string;
  name: string;
  rounds: PatrolRoundWithRecords[];
  roundCount: number;
  checkedCount: number;
  noteCount: number;
};

function groupByPatroller(rounds: PatrolRoundWithRecords[]): PatrollerGroup[] {
  const map = new Map<string, PatrollerGroup>();
  for (const r of rounds) {
    const key = r.patrollerId ?? r.patrollerName ?? "미지정";
    let g = map.get(key);
    if (!g) {
      g = { key, name: r.patrollerName ?? "미지정", rounds: [], roundCount: 0, checkedCount: 0, noteCount: 0 };
      map.set(key, g);
    }
    g.rounds.push(r);
    g.roundCount += 1;
    g.checkedCount += r.checkedCount;
    g.noteCount += r.noteCount;
  }
  // 특이사항 많은 순 → 점검 많은 순 → 이름순
  return Array.from(map.values()).sort(
    (a, b) => b.noteCount - a.noteCount || b.checkedCount - a.checkedCount || a.name.localeCompare(b.name, "ko"),
  );
}

export function PatrolReview({ initialDate, initialRounds }: { initialDate: string; initialRounds: PatrolRoundWithRecords[] }) {
  const [date, setDate] = useState(initialDate);
  const [rounds, setRounds] = useState(initialRounds);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => groupByPatroller(rounds), [rounds]);
  const selected = useMemo(() => groups.find((g) => g.key === selectedKey) ?? null, [groups, selectedKey]);

  function changeDate(newDate: string) {
    setDate(newDate);
    setSelectedKey(null);
    startTransition(async () => {
      try {
        setRounds(await getPatrolDayRoundsWithRecords(newDate));
      } catch {
        setRounds([]);
      }
    });
  }

  // 기록 수정 후 현재 날짜 회차를 다시 불러와 화면 동기화
  function refetch() {
    startTransition(async () => {
      try {
        setRounds(await getPatrolDayRoundsWithRecords(date));
      } catch {
        /* keep current */
      }
    });
  }

  return (
    <div className="flex flex-col gap-x4">
      <Toolbar className="mb-0">
        <Input
          type="date"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          aria-label="날짜"
          className="w-auto tabular-nums"
        />
        {pending && (
          <span className="inline-flex items-center gap-x1 t3-regular text-fg-neutral-subtle">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            불러오는 중…
          </span>
        )}
        <span className="ml-auto t4-regular tabular-nums text-fg-neutral-subtle">
          순찰자 {groups.length}명 · 회차 {rounds.length}
        </span>
      </Toolbar>

      {rounds.length === 0 ? (
        <Section>
          <EmptyState
            icon={ShieldCheck}
            title="이 날짜에는 순찰 기록이 없어요"
            description="다른 날짜를 고르거나, 순찰을 시작하면 여기에 기록이 쌓여요."
          />
        </Section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[280px_1fr]">
          {/* 좌: 근무자(순찰자) 목록 */}
          <aside className={cn(selected ? "hidden lg:block" : "block")}>
            <Section flush title="순찰자" count={groups.length}>
              <ul className="border-t border-stroke-neutral-muted pb-x2">
                {groups.map((g) => {
                  const isActive = selectedKey === g.key;
                  return (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(g.key)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-x3 px-x5 py-x3 text-left transition-colors",
                          isActive ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate t4-bold text-fg-neutral">{g.name}</p>
                          <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                            {g.roundCount}회차 · 점검 {g.checkedCount}건
                          </p>
                        </div>
                        {g.noteCount > 0 && (
                          <StatusBadge tone="warn">
                            <AlertTriangle aria-hidden />
                            특이 {g.noteCount}
                          </StatusBadge>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-fg-placeholder lg:hidden" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </aside>

          {/* 우: 선택 근무자의 회차 + 기록 */}
          <div className={cn("min-w-0", selected ? "block" : "hidden lg:block")}>
            {!selected ? (
              <Section>
                <EmptyState
                  icon={ShieldCheck}
                  title="순찰자를 선택하세요"
                  description="왼쪽 목록에서 순찰자를 누르면 회차별 점검 기록을 볼 수 있어요."
                />
              </Section>
            ) : (
              <div className="flex flex-col gap-x4">
                <div className="flex flex-wrap items-center gap-x2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedKey(null)} className="lg:hidden">
                    <ChevronLeft /> 목록
                  </Button>
                  <h3 className="t7-bold text-fg-neutral">{selected.name}</h3>
                  <span className="t4-regular tabular-nums text-fg-neutral-subtle">
                    {selected.roundCount}회차 · 점검 {selected.checkedCount} · 특이 {selected.noteCount}
                  </span>
                </div>

                {selected.rounds.map((r) => (
                  <Section
                    key={r.id}
                    flush
                    title={r.label || "순찰 회차"}
                    description={
                      <span className="inline-flex items-center gap-x1 tabular-nums">
                        <Clock className="size-3.5" aria-hidden />
                        {fmtTime(r.startedAt)}{r.endedAt ? `–${fmtTime(r.endedAt)}` : ""}
                        {!r.endedAt && <StatusBadge tone="ok" className="ml-x1">진행 중</StatusBadge>}
                      </span>
                    }
                    actions={
                      <div className="flex flex-wrap items-center gap-x1_5">
                        <StatusBadge tone="gray">점검 {r.checkedCount}</StatusBadge>
                        {r.noteCount > 0 && <StatusBadge tone="warn">특이 {r.noteCount}</StatusBadge>}
                        {r.absentCount > 0 && <StatusBadge tone="gray">자리비움 {r.absentCount}</StatusBadge>}
                      </div>
                    }
                  >
                    {r.records.length === 0 ? (
                      <EmptyState compact title="점검 기록이 없어요" className="border-t border-stroke-neutral-muted" />
                    ) : (
                      <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                        {r.records.map((rec) => (
                          <PatrolRecordRow key={rec.id} rec={rec} onSaved={refetch} />
                        ))}
                      </ul>
                    )}
                  </Section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

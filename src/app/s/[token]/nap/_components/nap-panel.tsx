"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon } from "lucide-react";
import { Fieldset } from "@seed-design/react";
import { requestNap, type NapView } from "@/actions/nap";
import { PortalTimeField } from "@/components/portal/time-field";
import {
  Badge,
  BottomCTA,
  Button,
  EmptyState,
  IconTile,
  ListRow,
  Notice,
  ProgressBar,
  Section,
  Segmented,
} from "@/components/portal/ui";
import { REQUEST_STATUS } from "@/components/portal/status";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { value: "20", label: "20분" },
  { value: "30", label: "30분" },
];

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function nowKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

function todayKSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "9월 24일 (수)" */
function fmtDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${m}월 ${d}일 (${DOW[dow]})`;
}

export function NapPanel({
  token,
  naps,
  todayCount,
  limit,
}: {
  token: string;
  naps: NapView[];
  todayCount: number;
  limit: number;
}) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(nowKST());
  const [durationMin, setDurationMin] = useState(20);
  const [pending, startTransition] = useTransition();
  const remaining = Math.max(0, limit - todayCount);
  const today = todayKSTStr();

  function submit() {
    startTransition(async () => {
      try {
        await requestNap(token, { startTime, durationMin });
        toast.success("쪽잠 신청이 접수되었어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      {/* 오늘 남은 횟수 */}
      <Section>
        <div className="flex items-start justify-between gap-x4">
          <div>
            <p className="t4-bold text-fg-neutral-muted">오늘 남은 쪽잠</p>
            <p className="mt-x1 t11-bold text-fg-neutral tabular-nums">
              {remaining}회
              <span className="ml-x1 t6-bold text-fg-placeholder">/ {limit}회</span>
            </p>
          </div>
          <IconTile icon={Moon} tone="violet" size={48} round />
        </div>

        {limit > 0 && limit <= 8 ? (
          <div className="mt-x4 flex gap-x1_5" aria-hidden>
            {Array.from({ length: limit }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-x2 flex-1 rounded-full transition-colors duration-d6",
                  i < remaining ? "bg-bg-brand-solid" : "bg-bg-neutral-weak"
                )}
              />
            ))}
          </div>
        ) : (
          <ProgressBar value={limit > 0 ? remaining / limit : 0} className="mt-x4" />
        )}
        <p className="mt-x2_5 t3-regular text-fg-neutral-subtle tabular-nums">
          하루 {limit}회까지 신청할 수 있어요 · 오늘 {todayCount}회 신청
        </p>

        {remaining === 0 && (
          <Notice tone="gray" title="오늘은 모두 신청했어요" className="mt-x4">
            쪽잠은 하루 {limit}회까지 신청할 수 있어요. 내일 다시 신청해 주세요.
          </Notice>
        )}
      </Section>

      {/* 신청 폼 */}
      {remaining > 0 && (
        <Section>
          <div className="flex flex-col gap-x6">
            <Fieldset.Root>
              <Fieldset.Header>
                <Fieldset.Label>시작 시간</Fieldset.Label>
              </Fieldset.Header>
              <PortalTimeField value={startTime} onChange={setStartTime} align="start" />
            </Fieldset.Root>
            <Fieldset.Root>
              <Fieldset.Header>
                <Fieldset.Label>쪽잠 시간</Fieldset.Label>
              </Fieldset.Header>
              <Segmented<string>
                options={DURATIONS}
                value={String(durationMin)}
                onChange={(v) => setDurationMin(Number(v))}
                aria-label="쪽잠 시간"
              />
            </Fieldset.Root>
          </div>
        </Section>
      )}

      {/* 신청 내역 (오늘 + 최근 7일) */}
      {naps.length === 0 ? (
        <Section>
          <EmptyState
            icon={Moon}
            title="아직 신청 내역이 없어요"
            description="피곤할 땐 무리하지 말고 쪽잠을 신청해 보세요."
            className="py-x8"
          />
        </Section>
      ) : (
        <Section title="최근 신청" flush>
          {naps.map((n) => {
            const status = REQUEST_STATUS[n.status];
            return (
              <ListRow
                key={n.id}
                title={
                  <span className="tabular-nums">
                    {n.startTime} · {n.durationMin}분
                  </span>
                }
                description={
                  <>
                    <span className="tabular-nums">
                      {n.date === today ? "오늘" : fmtDate(n.date)}
                    </span>
                    {n.note && (
                      <span className="mt-x1 block text-fg-neutral-muted">
                        {n.note}
                        {n.decidedByName ? ` — ${n.decidedByName}` : ""}
                      </span>
                    )}
                  </>
                }
                trailing={<Badge tone={status.tone}>{status.label}</Badge>}
              />
            );
          })}
        </Section>
      )}

      <BottomCTA
        note={remaining > 0 ? `직원 승인 후 이용할 수 있어요 · 오늘 ${remaining}회 남음` : undefined}
      >
        <Button
          variant="primary"
          size="xl"
          block
          loading={pending}
          disabled={remaining === 0}
          onClick={submit}
        >
          쪽잠 신청하기
        </Button>
      </BottomCTA>
    </div>
  );
}

"use client";

// 일시 조치 목록 — 현황 탭과 일시 조치 탭이 같이 쓴다.

import { cancelAccessOverride, type AccessOverrideState, type AccessOverrideView } from "@/actions/access-control";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import { ActionBadge, KindBadge, fmtDateTime, fmtRange, remainingText, studentText, useAccessAction } from "./shared";

const STATE_BADGE: Partial<Record<AccessOverrideState, { label: string; tone: Tone }>> = {
  SCHEDULED: { label: "예정", tone: "info" },
  ENDED: { label: "종료", tone: "gray" },
  CANCELLED: { label: "중간 종료", tone: "gray" },
};

export function OverrideList({ rows, now }: { rows: AccessOverrideView[]; now: string }) {
  const { busyKey, run } = useAccessAction();
  const { confirm, dialog } = useConfirmDialog();

  async function cancel(o: AccessOverrideView) {
    const who = o.student ? `${o.student.name} 학생` : "전체";
    const ok = await confirm({
      title: `${o.label} ${o.action === "BLOCK" ? "차단" : "허용"}을 지금 끝낼까요?`,
      description: `${who} 대상 일시 조치예요. 끝내면 바로 규칙대로 돌아가요.`,
      confirmLabel: "종료",
      destructive: true,
    });
    if (!ok) return;
    run(() => cancelAccessOverride(o.id), { key: o.id, success: "일시 조치를 끝냈어요" });
  }

  return (
    <>
      <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
        {rows.map((o) => {
          const state = STATE_BADGE[o.state];
          const open = o.state === "ACTIVE" || o.state === "SCHEDULED";
          const trail = [
            o.createdByName ? `${o.createdByName} 등록` : null,
            o.cancelledAt ? `${o.cancelledByName ? `${o.cancelledByName} ` : ""}${fmtDateTime(o.cancelledAt)} 종료` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={o.id} className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x2">
                  <ActionBadge action={o.action} />
                  <span className="t4-bold text-fg-neutral">{o.label}</span>
                  <KindBadge kind={o.targetKind} />
                  {state && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
                  {o.fromRequest && <StatusBadge tone="violet">학생 신청</StatusBadge>}
                </div>
                <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                  <span className="t3-medium text-fg-neutral-muted">{o.student ? studentText(o.student) : "전체"}</span>
                  {" · "}
                  {fmtRange(o.startAt, o.endAt)}
                  {o.state === "ACTIVE" && (
                    <span className="t3-medium text-fg-brand"> · {remainingText(o.endAt, now)}</span>
                  )}
                </p>
                {o.reason && <p className="mt-x1_5 t4-regular text-fg-neutral-muted">{o.reason}</p>}
                {trail && <p className="mt-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">{trail}</p>}
              </div>
              {open && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyKey === o.id}
                  onClick={() => cancel(o)}
                  className="shrink-0"
                >
                  종료
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {dialog}
    </>
  );
}

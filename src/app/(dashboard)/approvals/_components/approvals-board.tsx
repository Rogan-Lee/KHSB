"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon, Wifi, Check, X, type LucideIcon } from "lucide-react";
import { decideNap, type StaffNapView } from "@/actions/nap";
import { decideNetworkRequest, type StaffNetworkRequestView } from "@/actions/network-requests";
import { NETWORK_KIND_LABELS } from "@/lib/network-requests";
import type { NapStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LinkTabs, Section, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";

const STATUS_LABEL: Record<NapStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
};
const STATUS_TONE: Record<NapStatus, Tone> = {
  PENDING: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function RequestStatus({ status }: { status: NapStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}

function DecideButtons({
  pending,
  onDecide,
}: {
  pending: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  return (
    <div className="flex shrink-0 gap-x2">
      <Button size="sm" disabled={pending} onClick={() => onDecide("approve")} className="flex-1 sm:flex-none">
        <Check /> 승인
      </Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => onDecide("reject")} className="flex-1 sm:flex-none">
        <X /> 거절
      </Button>
    </div>
  );
}

/** 대기/처리 완료 두 묶음으로 나눠 보여 준다 (순서는 서버 정렬 유지) */
function Groups<T extends { id: string; status: NapStatus }>({
  rows,
  render,
  icon,
  emptyTitle,
  emptyDescription,
}: {
  rows: T[];
  render: (row: T) => React.ReactNode;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  const pendingRows = rows.filter((r) => r.status === "PENDING");
  const doneRows = rows.filter((r) => r.status !== "PENDING");
  return (
    <div className="flex flex-col gap-x6">
      <Section title="처리 대기" count={pendingRows.length} flush className="overflow-hidden">
        {pendingRows.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState compact icon={Check} title="기다리는 신청이 없어요" description="새 신청이 들어오면 여기에 먼저 보여요." />
          </div>
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {pendingRows.map(render)}
          </ul>
        )}
      </Section>
      {doneRows.length > 0 && (
        <Section title="처리 완료" count={doneRows.length} flush className="overflow-hidden">
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {doneRows.map(render)}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function ApprovalsBoard({
  tab,
  naps,
  networkRequests,
}: {
  tab: "nap" | "network";
  naps: StaffNapView[];
  networkRequests: StaffNetworkRequestView[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const napPending = naps.filter((n) => n.status === "PENDING").length;
  const netPending = networkRequests.filter((r) => r.status === "PENDING").length;

  function decide(kind: "nap" | "network", id: string, decision: "approve" | "reject") {
    setBusyId(id);
    startTransition(async () => {
      try {
        if (kind === "nap") await decideNap(id, decision, notes[id]);
        else await decideNetworkRequest(id, decision);
        toast.success(decision === "approve" ? "승인했어요" : "거절했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리에 실패했어요");
      } finally {
        setBusyId(null);
      }
    });
  }

  // 거절은 되돌릴 수 없어 한 번 더 확인한다. 승인은 바로 처리.
  async function decideWithConfirm(
    kind: "nap" | "network",
    id: string,
    decision: "approve" | "reject",
    who: string,
  ) {
    if (decision === "reject") {
      const ok = await confirm({
        title: `${who} 학생의 신청을 거절할까요?`,
        description: kind === "nap" ? "입력한 메모가 있으면 함께 남아요." : "거절하면 네트워크 정책이 적용되지 않아요.",
        confirmLabel: "거절",
        destructive: true,
      });
      if (!ok) return;
    }
    decide(kind, id, decision);
  }

  return (
    <div>
      {/* 탭 */}
      <LinkTabs
        current={tab}
        items={[
          { value: "nap", label: "쪽잠", href: "/approvals", count: napPending },
          { value: "network", label: "네트워크", href: "/approvals?tab=network", count: netPending },
        ]}
      />

      {tab === "nap" ? (
        <Groups
          rows={naps}
          icon={Moon}
          emptyTitle="오늘 쪽잠 신청이 없어요"
          emptyDescription="학생이 포털에서 쪽잠을 신청하면 여기에 모여요."
          render={(n) => (
            <li key={n.id} className="flex flex-col gap-x3 px-x5 py-x4">
              <div className="flex flex-wrap items-center gap-x2">
                <RequestStatus status={n.status} />
                <span className="t4-bold text-fg-neutral">{n.student.name}</span>
                <span className="t3-regular text-fg-neutral-subtle">{n.student.grade}</span>
                <span className="t4-medium tabular-nums text-fg-neutral">
                  {n.startTime} · {n.durationMin}분
                </span>
                <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
                  신청 {fmtDateTime(n.createdAt)}
                </span>
              </div>
              {n.status === "PENDING" ? (
                <div className="flex flex-col gap-x2 sm:flex-row sm:items-center">
                  <Input
                    value={notes[n.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [n.id]: e.target.value }))}
                    placeholder="메모 (선택)"
                    aria-label={`${n.student.name} 쪽잠 메모`}
                    maxLength={200}
                    className="h-9 min-w-0 flex-1"
                  />
                  <DecideButtons
                    pending={busyId === n.id}
                    onDecide={(d) => decideWithConfirm("nap", n.id, d, n.student.name)}
                  />
                </div>
              ) : (
                <p className="t3-regular text-fg-neutral-subtle">
                  {n.decidedByName ?? "-"} 처리{n.note ? ` · ${n.note}` : ""}
                </p>
              )}
            </li>
          )}
        />
      ) : (
        <Groups
          rows={networkRequests}
          icon={Wifi}
          emptyTitle="네트워크 사용 신청이 없어요"
          emptyDescription="학생이 포털에서 사이트·앱 사용을 신청하면 여기에 모여요."
          render={(r) => (
            <li key={r.id} className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x2">
                  <RequestStatus status={r.status} />
                  <StatusBadge tone="gray">{NETWORK_KIND_LABELS[r.kind]}</StatusBadge>
                  <span className="t4-bold text-fg-neutral">{r.student.name}</span>
                  <span className="t3-regular text-fg-neutral-subtle">{r.student.grade}</span>
                  {r.target && <span className="t4-medium text-fg-neutral">{r.target}</span>}
                </div>
                <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                  {fmtDateTime(r.startAt)} ~ {fmtDateTime(r.endAt)}
                </p>
                <p className="mt-x1_5 t4-regular text-fg-neutral-muted">{r.reason}</p>
                {r.status !== "PENDING" && (
                  <p className="mt-x1_5 t3-regular text-fg-neutral-subtle">
                    {r.decidedByName ?? "-"} 처리
                    {r.status === "APPROVED" && r.appliedAt
                      ? ` · 정책 적용 ${fmtDateTime(r.appliedAt)}`
                      : ""}
                  </p>
                )}
              </div>
              {r.status === "PENDING" && (
                <DecideButtons
                  pending={busyId === r.id}
                  onDecide={(d) => decideWithConfirm("network", r.id, d, r.student.name)}
                />
              )}
            </li>
          )}
        />
      )}
      {dialog}
    </div>
  );
}

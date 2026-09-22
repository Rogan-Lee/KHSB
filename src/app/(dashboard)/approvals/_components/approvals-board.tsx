"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon, Wifi, Check, X } from "lucide-react";
import { decideNap, type StaffNapView } from "@/actions/nap";
import { decideNetworkRequest, type StaffNetworkRequestView } from "@/actions/network-requests";
import { NETWORK_KIND_LABELS } from "@/lib/network-requests";
import type { NapStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<NapStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
};
const STATUS_TONE: Record<NapStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-700",
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

function StatusBadge({ status }: { status: NapStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function DecideButtons({
  pending,
  onDecide,
}: {
  pending: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => onDecide("approve")}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> 승인
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => onDecide("reject")}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} /> 거절
      </button>
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

  return (
    <div>
      {/* 탭 */}
      <div className="mb-4 flex gap-1.5">
        {(
          [
            { key: "nap", label: "쪽잠", icon: Moon, count: napPending },
            { key: "network", label: "네트워크", icon: Wifi, count: netPending },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={`/approvals${t.key === "nap" ? "" : "?tab=network"}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-brand text-white"
                : "border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count > 0 && (
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10.5px] font-bold ${
                  tab === t.key ? "bg-white/25 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "nap" ? (
        naps.length === 0 ? (
          <Empty icon={Moon} text="오늘 쪽잠 신청이 없어요" />
        ) : (
          <ul className="space-y-2">
            {naps.map((n) => (
              <li key={n.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={n.status} />
                  <span className="text-[14px] font-semibold">{n.student.name}</span>
                  <span className="text-[12px] text-muted-foreground">{n.student.grade}</span>
                  <span className="text-[13px] font-medium tabular-nums">
                    {n.startTime} · {n.durationMin}분
                  </span>
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                    신청 {fmtDateTime(n.createdAt)}
                  </span>
                </div>
                {n.status === "PENDING" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[n.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [n.id]: e.target.value }))}
                      placeholder="메모 (선택)"
                      maxLength={200}
                      className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                    />
                    <DecideButtons
                      pending={busyId === n.id}
                      onDecide={(d) => decide("nap", n.id, d)}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {n.decidedByName ?? "-"} 처리{n.note ? ` · ${n.note}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )
      ) : networkRequests.length === 0 ? (
        <Empty icon={Wifi} text="네트워크 사용 신청이 없어요" />
      ) : (
        <ul className="space-y-2">
          {networkRequests.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {NETWORK_KIND_LABELS[r.kind]}
                </span>
                <span className="text-[14px] font-semibold">{r.student.name}</span>
                <span className="text-[12px] text-muted-foreground">{r.student.grade}</span>
                {r.target && <span className="text-[13px] font-medium">{r.target}</span>}
                <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                  {fmtDateTime(r.startAt)} ~ {fmtDateTime(r.endAt)}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{r.reason}</p>
              {r.status === "PENDING" ? (
                <div className="mt-3">
                  <DecideButtons
                    pending={busyId === r.id}
                    onDecide={(d) => decide("network", r.id, d)}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {r.decidedByName ?? "-"} 처리
                  {r.status === "APPROVED" && r.appliedAt
                    ? ` · 정책 적용 ${fmtDateTime(r.appliedAt)}`
                    : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">{text}</p>
    </div>
  );
}

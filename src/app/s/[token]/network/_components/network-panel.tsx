"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wifi } from "lucide-react";
import { requestNetwork, type NetworkRequestView } from "@/actions/network-requests";
import { NETWORK_KIND_LABELS, NETWORK_KIND_ORDER } from "@/lib/network-requests";
import { TimePickerInput } from "@/components/ui/time-picker";
import type { NapStatus, NetworkRequestKind } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<NapStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
};
const STATUS_TONE: Record<NapStatus, string> = {
  PENDING: "bg-warn-soft text-warn-ink",
  APPROVED: "bg-ok-soft text-ok-ink",
  REJECTED: "bg-bad-soft text-bad-ink",
};

const TARGET_META: Partial<
  Record<NetworkRequestKind, { label: string; placeholder: string }>
> = {
  DOMAIN_ALLOW: { label: "사이트 주소", placeholder: "예: ebsi.co.kr" },
  APP_UNBLOCK: { label: "앱 이름", placeholder: "예: 클래스룸" },
};

function todayKSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtRange(startIso: string, endIso: string): string {
  const opt: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const start = new Date(startIso).toLocaleString("ko-KR", opt);
  const end = new Date(endIso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${start} ~ ${end}`;
}

export function NetworkPanel({
  token,
  requests,
}: {
  token: string;
  requests: NetworkRequestView[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<NetworkRequestKind>("WIFI_UNBLOCK");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState(todayKSTStr());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const targetMeta = TARGET_META[kind];

  function submit() {
    if (targetMeta && !target.trim())
      return toast.error(`${targetMeta.label}을(를) 입력해 주세요`);
    if (!date || !startTime || !endTime) return toast.error("사용 시간을 선택해 주세요");
    if (!reason.trim()) return toast.error("사용 사유를 입력해 주세요");
    startTransition(async () => {
      try {
        await requestNetwork(token, {
          kind,
          target: targetMeta ? target : undefined,
          startAt: `${date}T${startTime}`,
          endAt: `${date}T${endTime}`,
          reason,
        });
        toast.success("네트워크 사용 신청이 접수되었어요");
        setTarget("");
        setStartTime("");
        setEndTime("");
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">네트워크 사용 신청</h1>

      {/* 신청 폼 */}
      <div className="rounded-[14px] border border-line bg-panel p-4">
        <label className="mb-1 block text-[12px] font-medium text-ink-3">신청 유형</label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {NETWORK_KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-[13px] ${
                kind === k
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-panel text-ink-3 hover:bg-canvas-2"
              }`}
            >
              {NETWORK_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {targetMeta && (
          <>
            <label className="mb-1 block text-[12px] font-medium text-ink-3">
              {targetMeta.label}
            </label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={targetMeta.placeholder}
              maxLength={200}
              className="mb-3 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[16px] focus:border-brand focus:outline-none"
            />
          </>
        )}

        <label className="mb-1 block text-[12px] font-medium text-ink-3">사용 시간</label>
        <div className="mb-3 space-y-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-[14px] focus:border-brand focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <TimePickerInput value={startTime} onChange={setStartTime} className="flex-1" />
            <span className="text-[13px] text-ink-4">~</span>
            <TimePickerInput value={endTime} onChange={setEndTime} className="flex-1" />
          </div>
        </div>

        <label className="mb-1 block text-[12px] font-medium text-ink-3">사유</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="예: 인강 수강을 위해 필요해요"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[16px] focus:border-brand focus:outline-none"
        />

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-[15px] font-semibold text-white disabled:opacity-50"
        >
          <Wifi className="h-4 w-4" strokeWidth={2.5} />
          사용 신청하기
        </button>
        <p className="mt-2 text-center text-[11.5px] text-ink-4">직원 승인 후 사용할 수 있어요</p>
      </div>

      {/* 신청 내역 */}
      {requests.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-10 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
            <Wifi className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-2">아직 신청 내역이 없어요</p>
          <p className="mt-1 text-[12px] text-ink-4">
            공부에 필요한 사이트·앱 사용을 신청해 보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-[14px] border border-line bg-panel p-3.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
                <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
                  {NETWORK_KIND_LABELS[r.kind]}
                </span>
                {r.target && (
                  <span className="truncate text-[12.5px] font-medium text-ink">{r.target}</span>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] tabular-nums text-ink-2">
                {fmtRange(r.startAt, r.endAt)}
              </p>
              <p className="mt-1 line-clamp-2 text-[12px] text-ink-4">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

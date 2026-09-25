"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Smartphone, Wifi, type LucideIcon } from "lucide-react";
import { Fieldset } from "@seed-design/react";
import { Chip } from "seed-design/ui/chip";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";
import { requestNetwork, type NetworkRequestView } from "@/actions/network-requests";
import { NETWORK_KIND_LABELS, NETWORK_KIND_ORDER } from "@/lib/network-requests";
import { PortalTimeField } from "@/components/portal/time-field";
import {
  Badge,
  BottomCTA,
  Button,
  EmptyState,
  IconTile,
  ListRow,
  Section,
} from "@/components/portal/ui";
import { REQUEST_STATUS } from "@/components/portal/status";
import type { NetworkRequestKind } from "@/generated/prisma/enums";

const TARGET_META: Partial<
  Record<NetworkRequestKind, { label: string; placeholder: string }>
> = {
  DOMAIN_ALLOW: { label: "사이트 주소", placeholder: "예: ebsi.co.kr" },
  APP_UNBLOCK: { label: "앱 이름", placeholder: "예: 클래스룸" },
};

const KIND_ICON: Record<NetworkRequestKind, LucideIcon> = {
  WIFI_UNBLOCK: Wifi,
  DOMAIN_ALLOW: Globe,
  APP_UNBLOCK: Smartphone,
};

function todayKSTStr(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO → KST 월/일/시각 (서버·클라이언트 로케일 차이 없이 고정 포맷) */
function kstParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return { m: d.getUTCMonth() + 1, day: d.getUTCDate(), hm: d.toISOString().slice(11, 16) };
}

function fmtRange(startIso: string, endIso: string): string {
  const s = kstParts(startIso);
  const e = kstParts(endIso);
  return `${s.m}월 ${s.day}일 ${s.hm} ~ ${e.hm}`;
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
    <div className="flex flex-col gap-x3">
      {/* 신청 폼 */}
      <Section>
        <div className="flex flex-col gap-x6">
          <Fieldset.Root>
            <Fieldset.Header>
              <Fieldset.Label>신청 유형</Fieldset.Label>
            </Fieldset.Header>
            <Chip.RadioRoot
              value={kind}
              onValueChange={(v) => setKind(v as NetworkRequestKind)}
              aria-label="신청 유형"
              className="flex flex-wrap gap-x2"
            >
              {NETWORK_KIND_ORDER.map((k) => (
                <Chip.RadioItem key={k} value={k} variant="outlineStrong" size="medium">
                  <Chip.Label>{NETWORK_KIND_LABELS[k]}</Chip.Label>
                </Chip.RadioItem>
              ))}
            </Chip.RadioRoot>
          </Fieldset.Root>

          {targetMeta && (
            <TextField
              label={targetMeta.label}
              value={target}
              onValueChange={({ value }) => setTarget(value)}
            >
              <TextFieldInput
                placeholder={targetMeta.placeholder}
                maxLength={200}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </TextField>
          )}

          <TextField
            label="날짜"
            value={date}
            onValueChange={({ value }) => setDate(value)}
            className="tabular-nums"
          >
            <TextFieldInput
              type="date"
              className="min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left"
            />
          </TextField>

          <Fieldset.Root>
            <Fieldset.Header>
              <Fieldset.Label>사용 시간</Fieldset.Label>
            </Fieldset.Header>
            <div className="flex items-center gap-x2">
              <PortalTimeField
                value={startTime}
                onChange={setStartTime}
                placeholder="시작"
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 t5-regular text-fg-neutral-subtle">~</span>
              <PortalTimeField
                value={endTime}
                onChange={setEndTime}
                placeholder="종료"
                className="min-w-0 flex-1"
              />
            </div>
          </Fieldset.Root>

          <TextField
            label="사유"
            value={reason}
            onValueChange={({ value }) => setReason(value)}
            maxGraphemeCount={500}
          >
            <TextFieldTextarea
              maxLength={500}
              placeholder="예: 인강 수강을 위해 필요해요"
            />
          </TextField>
        </div>
      </Section>

      {/* 신청 내역 */}
      {requests.length === 0 ? (
        <Section>
          <EmptyState
            icon={Wifi}
            title="아직 신청 내역이 없어요"
            description="공부에 필요한 사이트·앱 사용을 신청해 보세요."
            className="py-x8"
          />
        </Section>
      ) : (
        <Section title="신청 내역" flush>
          {requests.map((r) => {
            const status = REQUEST_STATUS[r.status];
            return (
              <ListRow
                key={r.id}
                leading={<IconTile icon={KIND_ICON[r.kind]} tone="gray" />}
                meta={
                  r.target ? (
                    <Badge size="xs">{NETWORK_KIND_LABELS[r.kind]}</Badge>
                  ) : undefined
                }
                title={
                  <span className="block truncate">{r.target ?? NETWORK_KIND_LABELS[r.kind]}</span>
                }
                description={
                  <>
                    <span className="block tabular-nums text-fg-neutral-muted">
                      {fmtRange(r.startAt, r.endAt)}
                    </span>
                    <span className="mt-x0_5 line-clamp-2 block">{r.reason}</span>
                  </>
                }
                trailing={<Badge tone={status.tone}>{status.label}</Badge>}
              />
            );
          })}
        </Section>
      )}

      <BottomCTA note="직원 승인 후 사용할 수 있어요">
        <Button variant="primary" size="xl" block loading={pending} onClick={submit}>
          사용 신청하기
        </Button>
      </BottomCTA>
    </div>
  );
}

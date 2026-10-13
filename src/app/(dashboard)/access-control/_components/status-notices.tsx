"use client";

import Link from "next/link";
import { CircleAlert, CirclePause, Router, TriangleAlert, WifiOff } from "lucide-react";
import type { AccessOverview } from "@/actions/access-control";
import { Notice } from "@/components/backoffice/ui";
import { ACCESS_PATH, fmtDateTime } from "./shared";

/** 머리말 아래 상태 안내 — 해당하는 것만, 심각한 것부터 (오류 → 주의 → 안내) */
export function StatusNotices({ overview }: { overview: AccessOverview }) {
  const { settings, agents, unknownServices } = overview;
  const errored = agents.filter((a) => a.lastError);
  const unreachable = agents.filter((a) => a.enabled && !a.connected);

  if (
    !settings.paused &&
    agents.length > 0 &&
    errored.length === 0 &&
    unreachable.length === 0 &&
    unknownServices.length === 0
  ) {
    return null;
  }

  return (
    <div className="mb-x5 flex flex-col gap-x2">
      {errored.map((a) => (
        <Notice key={`error-${a.id}`} tone="bad" icon={CircleAlert} title={`${a.name} 장비에서 오류가 났어요`}>
          {a.lastError}
        </Notice>
      ))}

      {settings.paused && (
        <Notice tone="warn" icon={CirclePause} title="통제가 중지돼 있어요">
          {settings.pausedUntil ? `${fmtDateTime(settings.pausedUntil)}까지` : "다시 켤 때까지"} 아무것도 막지 않아요
          {settings.pausedByName ? ` (${settings.pausedByName} 님이 중지)` : ""}. 규칙과 일시 조치는 그대로 남아 있고,
          중지된 동안에만 적용되지 않아요.
        </Notice>
      )}

      {unreachable.map((a) =>
        a.lastSeenAt ? (
          <Notice key={`offline-${a.id}`} tone="warn" icon={WifiOff} title={`${a.name} 장비와 연결이 끊겼어요`}>
            마지막 접속 {fmtDateTime(a.lastSeenAt)}. 장비에 닿지 않는 동안에는 마지막으로 적용된 상태가 그대로 유지되고,
            일시 허용은 10분 뒤에 회수돼요.
          </Notice>
        ) : (
          <Notice key={`offline-${a.id}`} tone="warn" icon={WifiOff} title={`${a.name} 장비가 아직 접속하지 않았어요`}>
            장비에서 에이전트를 실행하면 연결되고, 그때부터 규칙이 이 장비에 적용돼요.
          </Notice>
        ),
      )}

      {unknownServices.length > 0 && (
        <Notice tone="warn" icon={TriangleAlert} title="적용되지 않는 서비스가 있어요">
          {unknownServices.join(", ")} — 시설 장비의 AdGuard Home 이 모르는 서비스라 적용되지 않아요. AdGuard Home 을
          업데이트하면 해결돼요.
        </Notice>
      )}

      {agents.length === 0 && (
        <Notice tone="info" icon={Router} title="시설 장비가 아직 연결되지 않았어요">
          규칙은 미리 만들어 둘 수 있고, 실제 차단은 장비를 연결한 뒤부터 적용돼요.{" "}
          <Link href={`${ACCESS_PATH}?tab=agents`} className="underline underline-offset-2">
            장비 탭으로 가기
          </Link>
        </Notice>
      )}
    </div>
  );
}

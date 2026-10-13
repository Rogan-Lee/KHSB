"use client";

import { useState } from "react";
import { CirclePause, Play, Timer } from "lucide-react";
import { setAccessPause, type AccessOverview } from "@/actions/access-control";
import { LinkTabs, PageHeader } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { AgentsTab } from "./agents-tab";
import { AutoRefresh } from "./auto-refresh";
import { DevicesTab } from "./devices-tab";
import { EventsTab } from "./events-tab";
import { OverrideDialog } from "./override-dialog";
import { OverridesTab } from "./overrides-tab";
import { OverviewTab } from "./overview-tab";
import { PauseDialog } from "./pause-dialog";
import { RulesTab } from "./rules-tab";
import { ACCESS_PATH, useAccessAction } from "./shared";
import { StatusNotices } from "./status-notices";

export type AccessTab = "status" | "rules" | "overrides" | "devices" | "agents" | "events";

export function AccessControlBoard({ tab, overview }: { tab: AccessTab; overview: AccessOverview }) {
  const { canManage, settings } = overview;
  const { pending, run } = useAccessAction();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  return (
    <>
      <AutoRefresh />

      <PageHeader
        title="사용 통제"
        description="시설 와이파이에서 앱·사이트 사용을 막고, 필요할 때 풀어 줘요."
        actions={
          <>
            {canManage &&
              (settings.paused ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => setAccessPause({ paused: false }), { success: "통제를 다시 시작했어요" })}
                >
                  <Play /> 다시 시작
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setPauseOpen(true)}>
                  <CirclePause /> 전체 중지
                </Button>
              ))}
            <Button onClick={() => setOverrideOpen(true)}>
              <Timer /> 일시 조치
            </Button>
          </>
        }
      />

      <StatusNotices overview={overview} />

      <LinkTabs
        current={tab}
        items={[
          { value: "status", label: "현황", href: ACCESS_PATH },
          { value: "rules", label: "규칙", href: `${ACCESS_PATH}?tab=rules`, count: overview.rules.length },
          {
            value: "overrides",
            label: "일시 조치",
            href: `${ACCESS_PATH}?tab=overrides`,
            count: overview.overrides.filter((o) => o.state === "ACTIVE").length,
          },
          {
            value: "devices",
            label: "기기",
            href: `${ACCESS_PATH}?tab=devices`,
            count: overview.devices.filter((d) => d.status === "UNASSIGNED").length,
          },
          { value: "agents", label: "장비", href: `${ACCESS_PATH}?tab=agents` },
          { value: "events", label: "기록", href: `${ACCESS_PATH}?tab=events` },
        ]}
      />

      {tab === "status" && <OverviewTab overview={overview} />}
      {tab === "rules" && <RulesTab overview={overview} />}
      {tab === "overrides" && <OverridesTab overview={overview} onCreate={() => setOverrideOpen(true)} />}
      {tab === "devices" && <DevicesTab overview={overview} />}
      {tab === "agents" && <AgentsTab overview={overview} />}
      {tab === "events" && <EventsTab events={overview.events} />}

      {overrideOpen && (
        <OverrideDialog
          catalog={overview.catalog}
          students={overview.students}
          onClose={() => setOverrideOpen(false)}
        />
      )}
      {pauseOpen && <PauseDialog onClose={() => setPauseOpen(false)} />}
    </>
  );
}

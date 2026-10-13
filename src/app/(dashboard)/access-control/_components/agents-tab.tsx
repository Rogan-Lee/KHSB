"use client";

import { useState } from "react";
import { Plus, Router, Trash2 } from "lucide-react";
import {
  deleteAccessAgent,
  setAccessHardening,
  type AccessAgentView,
  type AccessOverview,
} from "@/actions/access-control";
import { DescriptionList, EmptyState, Section, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import { Switch } from "seed-design/ui/switch";
import { AgentRegisterDialog } from "./agent-register-dialog";
import { fmtDateTime, useAccessAction } from "./shared";

function connection(agent: AccessAgentView): { label: string; tone: Tone } {
  if (agent.connected) return { label: "연결됨", tone: "ok" };
  if (!agent.enabled) return { label: "꺼짐", tone: "gray" };
  if (!agent.lastSeenAt) return { label: "접속 전", tone: "gray" };
  return { label: "끊김", tone: "bad" };
}

const HARDENING_KEY = "hardening";

export function AgentsTab({ overview }: { overview: AccessOverview }) {
  const { agents, settings, canManage } = overview;
  const { busyKey, run } = useAccessAction();
  const { confirm, dialog } = useConfirmDialog();
  const [registering, setRegistering] = useState(false);

  async function remove(agent: AccessAgentView) {
    const ok = await confirm({
      title: `${agent.name} 장비를 삭제할까요?`,
      description: "삭제하면 이 장비의 토큰이 바로 무효가 돼서 더는 규칙을 받아 가지 못해요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteAccessAgent(agent.id), { key: agent.id, success: "장비를 삭제했어요" });
  }

  return (
    <div className="flex flex-col gap-x6">
      {!canManage && <p className="t4-regular text-fg-neutral-subtle">장비 등록과 설정은 원장 계정만 할 수 있어요.</p>}

      <Section
        title="시설 장비"
        count={agents.length}
        description="시설에 둔 장비가 30초마다 규칙을 받아 가 와이파이에 적용해요."
        flush
        className="overflow-hidden"
        actions={
          canManage ? (
            <Button size="sm" variant="ink" onClick={() => setRegistering(true)}>
              <Plus /> 장비 등록
            </Button>
          ) : undefined
        }
      >
        {agents.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState
              compact
              icon={Router}
              title="등록된 장비가 없어요"
              description={
                canManage
                  ? "장비를 등록하고 토큰을 넣으면, 만들어 둔 규칙이 시설 와이파이에 적용돼요."
                  : "원장 계정에서 장비를 등록하면 여기에 보여요."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {agents.map((agent) => {
              const state = connection(agent);
              return (
                <li key={agent.id} className="flex flex-col gap-x3 px-x5 py-x4">
                  <div className="flex flex-wrap items-center gap-x2">
                    <span className="t4-bold text-fg-neutral">{agent.name}</span>
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    {canManage && (
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={busyKey === agent.id}
                        onClick={() => remove(agent)}
                        className="ml-auto"
                      >
                        <Trash2 /> 삭제
                      </Button>
                    )}
                  </div>
                  <DescriptionList
                    cols={3}
                    items={[
                      { label: "소프트웨어", value: agent.software ?? "—" },
                      { label: "에이전트 버전", value: agent.agentVersion ?? "—" },
                      { label: "토큰", value: <span className="font-mono">····{agent.tokenHint}</span> },
                      { label: "마지막 접속", value: agent.lastSeenAt ? fmtDateTime(agent.lastSeenAt) : "—" },
                      { label: "마지막 적용", value: agent.lastAppliedAt ? fmtDateTime(agent.lastAppliedAt) : "—" },
                    ]}
                  />
                  {agent.lastError && (
                    <p className="break-words rounded-r2 bg-bg-critical-weak px-x3 py-x2 t3-regular text-fg-critical">
                      <span className="t3-bold">마지막 오류</span> {agent.lastError}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canManage && (
        <Section title="설정">
          <div className="flex items-start justify-between gap-x4">
            <div className="min-w-0">
              <p className="t4-medium text-fg-neutral">우회 방지</p>
              <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
                암호화 DNS와 iCloud 비공개 릴레이처럼 차단을 돌아가는 길을 막아요.
              </p>
            </div>
            <Switch
              size="24"
              checked={settings.hardening}
              disabled={busyKey === HARDENING_KEY}
              onCheckedChange={() =>
                run(() => setAccessHardening(!settings.hardening), {
                  key: HARDENING_KEY,
                  success: settings.hardening ? "우회 방지를 껐어요" : "우회 방지를 켰어요",
                })
              }
              inputProps={{ "aria-label": "우회 방지" }}
            />
          </div>
        </Section>
      )}

      {registering && <AgentRegisterDialog onClose={() => setRegistering(false)} />}
      {dialog}
    </div>
  );
}

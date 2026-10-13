"use client";

import { CirclePause, ShieldCheck, Timer, TriangleAlert, Users } from "lucide-react";
import type { AccessOverview } from "@/actions/access-control";
import type { PolicySet } from "@/lib/access-control/types";
import { EmptyState, Section, StatCard, StatCards, type Tone } from "@/components/backoffice/ui";
import { OverrideList } from "./override-list";
import { ACCESS_PATH, PolicyChip, serviceNameMap, studentText } from "./shared";

const minus = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

/**
 * 학생 정책이 전체 정책과 실제로 어디가 다른지.
 * 학생만 전체 잠금이면 "열어 둔 곳"이 쓸 수 있는 전부라 모두 보여 주고, 개별 차단은 잠금에 묻히므로 뺀다.
 */
function diffPolicy(student: PolicySet, global: PolicySet) {
  const newlyLocked = student.blockAll && !global.blockAll;
  return {
    lock: student.blockAll === global.blockAll ? null : student.blockAll ? ("ON" as const) : ("OFF" as const),
    allowedServices: newlyLocked ? student.allowedServices : minus(student.allowedServices, global.allowedServices),
    allowedDomains: newlyLocked ? student.allowedDomains : minus(student.allowedDomains, global.allowedDomains),
    blockedServices: newlyLocked ? [] : minus(student.blockedServices, global.blockedServices),
    blockedDomains: newlyLocked ? [] : minus(student.blockedDomains, global.blockedDomains),
  };
}

function ChipGroup({ label, tone, items }: { label: string; tone: Tone; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-x2">
      <p className="t3-medium text-fg-neutral-subtle">
        {label} <span className="tabular-nums">{items.length}</span>
      </p>
      <div className="flex flex-wrap gap-x1_5">
        {items.map((item, i) => (
          <PolicyChip key={`${i}-${item}`} tone={tone}>
            {item}
          </PolicyChip>
        ))}
      </div>
    </div>
  );
}

export function OverviewTab({ overview }: { overview: AccessOverview }) {
  const { effective, settings, studentExceptions, devices, agents, overrides, now } = overview;
  const names = serviceNameMap(overview.catalog);
  const serviceName = (id: string) => names.get(id) ?? id;

  const blockedServices = effective.blockedServices.map(serviceName);
  const blockedCount = effective.blockedServices.length + effective.blockedDomains.length;
  const opened = [...effective.allowedServices.map(serviceName), ...effective.allowedDomains];
  const nothingApplied = !effective.blockAll && blockedCount === 0;

  const activeOverrides = overrides.filter((o) => o.state === "ACTIVE");
  const assigned = devices.filter((d) => d.status === "ASSIGNED").length;
  const unassigned = devices.filter((d) => d.status === "UNASSIGNED").length;

  const enabledAgents = agents.filter((a) => a.enabled);
  const connected = enabledAgents.filter((a) => a.connected).length;
  const agentStat: { value: string; tone: Tone; sub: string } =
    agents.length === 0
      ? { value: "미연결", tone: "gray", sub: "등록된 장비가 없어요" }
      : connected === enabledAgents.length && connected > 0
        ? { value: "정상", tone: "ok", sub: `${connected}대 연결됨` }
        : { value: "끊김", tone: "bad", sub: `${enabledAgents.length}대 중 ${connected}대 연결됨` };

  return (
    <div className="flex flex-col gap-x6">
      <StatCards cols={4}>
        {settings.paused ? (
          <StatCard label="지금 차단 중" value="중지" tone="warn" sub="아무것도 막지 않아요" />
        ) : effective.blockAll ? (
          <StatCard
            label="지금 차단 중"
            value={<span className="t7-bold">인터넷 전체 잠금</span>}
            tone="bad"
            sub={`열려 있는 곳 ${opened.length}개`}
          />
        ) : (
          <StatCard label="지금 차단 중" value={blockedCount} unit="개" sub="앱·서비스와 사이트" />
        )}
        <StatCard
          label="진행 중 일시 조치"
          value={activeOverrides.length}
          unit="건"
          tone={activeOverrides.length > 0 ? "brand" : "gray"}
          href={`${ACCESS_PATH}?tab=overrides`}
        />
        <StatCard
          label="배정된 기기"
          value={assigned}
          unit={`/ ${devices.length}대`}
          sub={unassigned > 0 ? `미배정 ${unassigned}대` : undefined}
          href={`${ACCESS_PATH}?tab=devices`}
        />
        <StatCard
          label="장비 상태"
          value={agentStat.value}
          tone={agentStat.tone}
          sub={agentStat.sub}
          href={`${ACCESS_PATH}?tab=agents`}
        />
      </StatCards>

      <Section title="지금 적용 중 (전체)" description="학생별로 따로 정한 것이 없는 기기에는 이 내용이 적용돼요.">
        {settings.paused ? (
          <EmptyState
            compact
            icon={CirclePause}
            title="통제가 중지돼 있어요"
            description="다시 시작하면 규칙과 일시 조치가 바로 적용돼요."
          />
        ) : nothingApplied ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="지금 막고 있는 곳이 없어요"
            description="규칙 탭에서 막을 앱·사이트를 정하면 여기에 보여요."
          />
        ) : (
          <div className="flex flex-col gap-x5">
            {effective.blockAll && (
              <>
                <p className="t4-regular text-fg-neutral-muted">
                  <span className="t4-bold text-fg-critical">인터넷 전체가 잠겨 있어요.</span> 아래 열려 있는 곳만 쓸 수
                  있어요.
                </p>
                {opened.length > 0 ? (
                  <ChipGroup label="열려 있는 곳" tone="ok" items={opened} />
                ) : (
                  <p className="t3-regular text-fg-neutral-subtle">따로 열어 둔 곳이 없어요.</p>
                )}
              </>
            )}
            <ChipGroup label="막힌 앱·서비스" tone="bad" items={blockedServices} />
            <ChipGroup label="막힌 사이트" tone="bad" items={effective.blockedDomains} />
          </div>
        )}
      </Section>

      <Section title="학생별로 다르게 적용 중" count={studentExceptions.length} flush className="overflow-hidden">
        {studentExceptions.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState
              compact
              icon={Users}
              title="따로 적용 중인 학생이 없어요"
              description="학생 대상 규칙이나 일시 조치가 적용되는 동안 여기에 보여요."
            />
          </div>
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {studentExceptions.map(({ student, policy, deviceCount }) => {
              const diff = diffPolicy(policy, effective);
              const allowed = [...diff.allowedServices.map(serviceName), ...diff.allowedDomains];
              const blocked = [...diff.blockedServices.map(serviceName), ...diff.blockedDomains];
              return (
                <li key={student.id} className="flex flex-col gap-x2 px-x5 py-x4">
                  <div className="flex flex-wrap items-center gap-x2">
                    <span className="t4-bold text-fg-neutral">{studentText(student)}</span>
                    <span className="t3-regular tabular-nums text-fg-neutral-subtle">기기 {deviceCount}대</span>
                  </div>
                  <div className="flex flex-wrap gap-x1_5">
                    {diff.lock === "ON" && <PolicyChip tone="bad">인터넷 전체 잠금</PolicyChip>}
                    {diff.lock === "OFF" && <PolicyChip tone="ok">인터넷 전체 잠금 해제</PolicyChip>}
                    {allowed.map((item) => (
                      <PolicyChip key={`allow-${item}`} tone="ok">
                        {item} 허용
                      </PolicyChip>
                    ))}
                    {blocked.map((item) => (
                      <PolicyChip key={`block-${item}`} tone="bad">
                        {item} 차단
                      </PolicyChip>
                    ))}
                  </div>
                  {deviceCount === 0 && (
                    <p className="flex items-start gap-x1 t3-regular text-fg-warning">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      배정된 기기가 없어서 아직 적용되지 않아요. 기기 탭에서 이 학생의 기기를 배정해 주세요.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="진행 중인 일시 조치" count={activeOverrides.length} flush className="overflow-hidden">
        {activeOverrides.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState
              compact
              icon={Timer}
              title="진행 중인 일시 조치가 없어요"
              description="잠깐 풀어 주거나 막아야 할 때 ‘일시 조치’를 눌러 주세요."
            />
          </div>
        ) : (
          <OverrideList rows={activeOverrides} now={now} />
        )}
      </Section>
    </div>
  );
}

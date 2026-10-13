"use client";

import { Plus, Timer } from "lucide-react";
import type { AccessOverview } from "@/actions/access-control";
import { EmptyState, Section } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { OverrideList } from "./override-list";

export function OverridesTab({ overview, onCreate }: { overview: AccessOverview; onCreate: () => void }) {
  const { overrides, now } = overview;
  const active = overrides.filter((o) => o.state === "ACTIVE");
  const scheduled = overrides.filter((o) => o.state === "SCHEDULED");
  const past = overrides.filter((o) => o.state === "ENDED" || o.state === "CANCELLED");

  return (
    <div className="flex flex-col gap-x6">
      <Section
        title="진행 중"
        count={active.length}
        flush
        className="overflow-hidden"
        actions={
          <Button size="sm" variant="ink" onClick={onCreate}>
            <Plus /> 일시 조치
          </Button>
        }
      >
        {active.length === 0 ? (
          <div className="border-t border-stroke-neutral-muted">
            <EmptyState
              compact
              icon={Timer}
              title="진행 중인 일시 조치가 없어요"
              description="지금부터 정한 시간 동안만 풀어 주거나 막을 수 있어요."
            />
          </div>
        ) : (
          <OverrideList rows={active} now={now} />
        )}
      </Section>

      {scheduled.length > 0 && (
        <Section title="예정" count={scheduled.length} flush className="overflow-hidden">
          <OverrideList rows={scheduled} now={now} />
        </Section>
      )}

      {past.length > 0 && (
        <Section title="지난 조치 (최근 7일)" count={past.length} flush className="overflow-hidden">
          <OverrideList rows={past} now={now} />
        </Section>
      )}
    </div>
  );
}

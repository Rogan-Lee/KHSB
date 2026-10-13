"use client";

import { History } from "lucide-react";
import type { AccessEventView } from "@/actions/access-control";
import { EmptyState, Section } from "@/components/backoffice/ui";
import { fmtDateTime } from "./shared";

export function EventsTab({ events }: { events: AccessEventView[] }) {
  if (events.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={History}
          title="아직 기록이 없어요"
          description="규칙·일시 조치·기기를 바꾸면 누가 언제 했는지 여기에 남아요."
        />
      </Section>
    );
  }

  return (
    <Section flush className="overflow-hidden">
      <ul className="divide-y divide-stroke-neutral-muted">
        {events.map((e) => {
          const who = [e.actorName, e.studentName ? `${e.studentName} 학생` : null].filter(Boolean).join(" · ");
          return (
            <li key={e.id} className="flex flex-col gap-x1 px-x5 py-x3 sm:flex-row sm:items-baseline sm:gap-x4">
              <time dateTime={e.createdAt} className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle sm:w-28">
                {fmtDateTime(e.createdAt)}
              </time>
              <p className="min-w-0 flex-1 break-words t4-regular text-fg-neutral">{e.summary}</p>
              {who && <p className="shrink-0 t3-regular text-fg-neutral-subtle">{who}</p>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

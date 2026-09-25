import { Badge, Section, StatGrid } from "@/components/portal/ui";
import { Prose } from "@/components/portal/prose";
import { cn } from "@/lib/utils";

type MeritType = "MERIT" | "DEMERIT";

export type NotesSectionMerit = {
  id: string;
  date: Date | string;
  type: MeritType;
  points: number;
  reason: string;
  category: string | null;
  visibleInReport: boolean;
};

export type NotesSectionMonthlyNote = {
  id: string;
  content: string;
  visibleInReport: boolean;
  authorName?: string | null;
  createdAt?: Date | string;
};

interface NotesSectionProps {
  studentId: string;
  year: number;
  month: number;
  monthlyNote?: NotesSectionMonthlyNote | null;
  merits: NotesSectionMerit[];
}

/**
 * 학부모 리포트 — 원생 기록(MonthlyNote) + 상벌점(MeritDemerit) 묶음 섹션.
 * `visibleInReport=true` 인 항목만 노출. 두 섹션 모두 빈 경우 아무것도 렌더하지 않음.
 * 멘토링/월간 리포트(ReportShell · SEED)에서 공통 사용.
 */
export function NotesSection({ year, month, monthlyNote, merits }: NotesSectionProps) {
  const visibleMonthlyNote =
    monthlyNote && monthlyNote.visibleInReport && monthlyNote.content?.trim() ? monthlyNote : null;
  const visibleMerits = merits.filter((m) => m.visibleInReport);

  if (!visibleMonthlyNote && visibleMerits.length === 0) return null;

  const merit = visibleMerits.filter((m) => m.type === "MERIT");
  const demerit = visibleMerits.filter((m) => m.type === "DEMERIT");
  const meritSum = merit.reduce((s, m) => s + m.points, 0);
  const demeritSum = demerit.reduce((s, m) => s + m.points, 0);

  function fmtDate(d: Date | string) {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
  }

  const period = `${year}년 ${month}월`;

  return (
    <div className="flex flex-col gap-x3">
      {visibleMonthlyNote && (
        <Section title="원생 기록" description={period}>
          <Prose source={visibleMonthlyNote.content} />
        </Section>
      )}

      {visibleMerits.length > 0 && (
        <Section title="상벌점" description={period}>
          <StatGrid
            items={[
              {
                label: "상점",
                value: `+${meritSum}점`,
                sub: `${merit.length}건`,
                tone: meritSum > 0 ? "positive" : "neutral",
              },
              {
                label: "벌점",
                value: demeritSum > 0 ? `-${demeritSum}점` : "0점",
                sub: `${demerit.length}건`,
                tone: demeritSum > 0 ? "critical" : "neutral",
              },
              { label: "전체", value: `${visibleMerits.length}건` },
            ]}
          />

          <ul className="mt-x2 divide-y divide-stroke-neutral-subtle">
            {visibleMerits.map((m) => {
              const isMerit = m.type === "MERIT";
              return (
                <li key={m.id} className="flex items-start gap-x3 py-x3_5 last:pb-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-x1">
                    <p className="t5-regular text-fg-neutral">{m.reason}</p>
                    <div className="flex flex-wrap items-center gap-x1_5">
                      <span className="t4-regular tabular-nums text-fg-neutral-subtle">{fmtDate(m.date)}</span>
                      {m.category && <Badge tone="gray">{m.category}</Badge>}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 t5-bold tabular-nums",
                      isMerit ? "text-fg-positive" : "text-fg-critical"
                    )}
                  >
                    {isMerit ? `+${m.points}` : `-${m.points}`}점
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

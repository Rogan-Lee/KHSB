// 학부모 월간 리포트(/r/monthly/[token]) 전용 표시 블록 — SEED 토큰 · 포털 프리미티브 기반.
// 데이터 조회는 페이지가 하고, 여기서는 받은 값을 그리기만 한다(서버 컴포넌트).

import { MessageCircleHeart, ShieldCheck, Trophy } from "lucide-react";
import { Badge, IconTile, ListRow, Notice, Section, StatGrid } from "@/components/portal/ui";
import { Prose } from "@/components/portal/prose";
import { cn } from "@/lib/utils";

const KST_DATE: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
};

// ─── 첫 화면 요약 ─────────────────────────────────────────────────────

export function MonthlySummary({
  mentoringCount,
  meritSum,
  demeritSum,
  meritCount,
  patrolNoteCount,
}: {
  mentoringCount: number;
  meritSum: number;
  demeritSum: number;
  /** 리포트에 보이는 상벌점 건수 (0이면 "없음") */
  meritCount: number;
  patrolNoteCount: number;
}) {
  return (
    <StatGrid
      surface="plain"
      className="rounded-r5 bg-bg-layer-default py-x5"
      items={[
        { label: "멘토링", value: `${mentoringCount}회` },
        {
          label: "상점 · 벌점",
          value:
            meritCount === 0 ? (
              <span className="text-fg-neutral-subtle">없음</span>
            ) : (
              <>
                <span className={meritSum > 0 ? "text-fg-positive" : undefined}>+{meritSum}</span>
                <span className="px-x1 t4-regular text-fg-placeholder">/</span>
                <span className={demeritSum > 0 ? "text-fg-critical" : undefined}>-{demeritSum}</span>
              </>
            ),
        },
        { label: "순찰 특이사항", value: `${patrolNoteCount}회` },
      ]}
    />
  );
}

// ─── 원장님 한마디 ───────────────────────────────────────────────────

export function DirectorNote({ studentName, source }: { studentName: string; source: string }) {
  return (
    <Section>
      <div className="flex items-center gap-x3">
        <IconTile icon={MessageCircleHeart} tone="brand" size={40} round />
        <div className="min-w-0">
          <h2 className="t6-bold text-fg-neutral">원장님 한마디</h2>
          <p className="t4-regular text-fg-neutral-subtle">{studentName} 학생 학부모님께</p>
        </div>
      </div>
      <Prose source={source} className="mt-x4" />
    </Section>
  );
}

// ─── 최근 응시한 시험 ─────────────────────────────────────────────────

export type RecentExamGroup = {
  examName: string;
  examType: string;
  examDate: Date;
  isThisMonth: boolean;
  subjects: { subject: string; grade: number | null; percentile: number | null; rawScore: number | null }[];
};

export function RecentExamGroups({
  groups,
  typeLabels,
}: {
  /** 직전 → 당월 순 */
  groups: RecentExamGroup[];
  typeLabels: Record<string, string>;
}) {
  const hasThisMonth = groups.some((g) => g.isThisMonth);
  return (
    <div className="flex flex-col gap-x2_5">
      {groups.map((g, i) => {
        const tag = g.isThisMonth ? "이번 달" : hasThisMonth ? "직전" : null;
        return (
          <article
            key={`${g.examName}-${i}`}
            className={cn("rounded-r4 p-x4", g.isThisMonth ? "bg-bg-brand-weak" : "bg-bg-layer-fill")}
          >
            <div className="flex items-center gap-x1_5">
              <Badge tone="gray">{typeLabels[g.examType] ?? g.examType}</Badge>
              {tag && (
                <Badge tone={g.isThisMonth ? "brand" : "gray"} solid={g.isThisMonth} className="ml-auto">
                  {tag}
                </Badge>
              )}
            </div>
            <h4 className="mt-x2 t5-bold text-fg-neutral">{g.examName}</h4>
            <p className="mt-x0_5 t4-regular tabular-nums text-fg-neutral-subtle">
              {g.examDate.toLocaleDateString("ko-KR", KST_DATE)}
            </p>
            <dl className="mt-x3 grid grid-cols-3 gap-x1_5 sm:grid-cols-4">
              {g.subjects.map((s, si) => (
                <div
                  key={si}
                  className="flex min-w-0 flex-col items-center gap-x0_5 rounded-r3 bg-bg-layer-default px-x1_5 py-x2_5 text-center"
                >
                  <dt className="max-w-full truncate t3-regular text-fg-neutral-subtle">{s.subject}</dt>
                  <dd className="t5-bold tabular-nums text-fg-neutral">
                    {s.grade != null ? (
                      <>
                        {s.grade}
                        <span className="ml-x0_5 t3-medium text-fg-neutral-muted">등급</span>
                      </>
                    ) : s.rawScore != null ? (
                      <>
                        {s.rawScore}
                        <span className="ml-x0_5 t3-medium text-fg-neutral-muted">점</span>
                      </>
                    ) : (
                      <span className="text-fg-placeholder">—</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

// ─── 순찰 점검 ───────────────────────────────────────────────────────

export function PatrolSection({
  noteCount,
  absentCount,
  notes,
}: {
  noteCount: number;
  absentCount: number;
  notes: { id: string; date: string; note: string }[];
}) {
  const clean = noteCount + absentCount === 0;
  return (
    <Section title="순찰 점검" description="자습 시간 순찰에서 확인한 내용이에요">
      {clean ? (
        <Notice tone="ok" icon={ShieldCheck}>
          이번 달 순찰에서 특이사항이 없었어요.
        </Notice>
      ) : (
        <>
          <StatGrid
            items={[
              { label: "특이사항", value: `${noteCount}회` },
              { label: "자리비움", value: `${absentCount}회` },
            ]}
          />
          {notes.length > 0 && (
            <>
              <h3 className="mt-x5 t4-bold text-fg-neutral-muted">특이사항 내용</h3>
              <ul className="mt-x1 divide-y divide-stroke-neutral-subtle">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-x3 py-x3 last:pb-0">
                    <span className="w-x10 shrink-0 pt-x1 t4-medium tabular-nums text-fg-neutral-subtle">
                      {n.date}
                    </span>
                    <Prose source={n.note} className="min-w-0 flex-1" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Section>
  );
}

// ─── 이달의 기록 사진 ─────────────────────────────────────────────────

export function PhotoGrid({
  month,
  photos,
}: {
  month: number;
  photos: { id: string; url: string; thumbnailUrl: string | null }[];
}) {
  return (
    <Section
      title="이달의 기록 사진"
      description="사진을 누르면 크게 볼 수 있어요"
      action={<span className="shrink-0 t4-regular tabular-nums text-fg-neutral-subtle">{photos.length}장</span>}
    >
      <div className="grid grid-cols-3 gap-x1_5">
        {photos.map((p, i) => (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="block aspect-square overflow-hidden rounded-r3 bg-bg-layer-fill transition-opacity active:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.thumbnailUrl ?? p.url}
              alt={`${month}월 기록 사진 ${i + 1}`}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </a>
        ))}
      </div>
    </Section>
  );
}

// ─── 이달의 시상 ─────────────────────────────────────────────────────

const AWARD_LABEL: Record<string, string> = {
  ATTITUDE: "학습 태도 우수자",
  MENTOR_PICK: "멘토 선정 우수자",
};

export function AwardList({
  studentId,
  awards,
}: {
  /** 이 리포트의 학생 — "우리 아이" 표시 */
  studentId: string;
  awards: { id: string; studentId: string; category: string; description: string | null; student: { name: string } }[];
}) {
  return (
    <Section title="이달의 시상" flush>
      {awards.map((a) => {
        const isMe = a.studentId === studentId;
        return (
          <ListRow
            key={a.id}
            className={isMe ? "bg-bg-brand-weak" : undefined}
            leading={<IconTile icon={Trophy} tone={isMe ? "brand" : "gray"} solid={isMe} size={40} round />}
            title={
              <span className="flex flex-wrap items-center gap-x1_5">
                {a.student.name}
                {isMe && (
                  <Badge tone="brand" solid>
                    우리 아이
                  </Badge>
                )}
              </span>
            }
            description={
              <>
                <span className="block">{AWARD_LABEL[a.category] ?? "진보상"}</span>
                {a.description && <span className="mt-x0_5 block">{a.description}</span>}
              </>
            }
          />
        );
      })}
    </Section>
  );
}

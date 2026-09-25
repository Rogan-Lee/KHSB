import { PageHeader } from "@/components/backoffice/ui";

interface PageIntroProps {
  /** @deprecated 영문 태그 줄은 더 이상 표시하지 않는다 */
  tag?: string;
  title: string;
  description?: string;
  stats?: { label: string; value: string | number }[];
  /** @deprecated */
  accent?: string;
  className?: string;
}

// 레거시 호환 — 새 코드는 @/components/backoffice/ui 의 PageHeader 를 직접 쓴다.
export function PageIntro({ title, description, stats, className }: PageIntroProps) {
  return (
    <PageHeader
      title={title}
      description={description}
      className={className}
      actions={
        stats && stats.length > 0 ? (
          <dl className="flex items-center gap-x6">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse items-end gap-x0_5">
                <dt className="t3-regular text-fg-neutral-subtle">{s.label}</dt>
                <dd className="t7-bold tabular-nums text-fg-neutral">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : undefined
      }
    />
  );
}

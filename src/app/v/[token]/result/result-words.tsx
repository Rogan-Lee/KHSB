"use client";

import { useState } from "react";
import { Check, PartyPopper, X } from "lucide-react";
import { Badge, Notice, Segmented } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

export type ResultWordItem = {
  order: number;
  /** 문항별 방향 — EN_TO_KO 가 아니면 뜻 → 영단어 */
  direction: string;
  word: string;
  meanings: string[];
  studentAnswer: string | null;
  isCorrect: boolean | null;
};

type Filter = "wrong" | "all";

/** 결과 화면 — 틀린 단어 / 전체 단어 복습 목록 */
export function ResultWords({ items }: { items: ResultWordItem[] }) {
  const wrong = items.filter((i) => !i.isCorrect);
  const allCorrect = wrong.length === 0;
  const [filter, setFilter] = useState<Filter>(allCorrect ? "all" : "wrong");
  const shown = filter === "wrong" ? wrong : items;

  return (
    <section className="mt-x10">
      <h2 className="t6-bold text-fg-neutral">단어 복습</h2>

      <Segmented<Filter>
        aria-label="복습할 단어 보기"
        className="mt-x3"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "wrong", label: <span className="tabular-nums">틀린 단어 {wrong.length}</span> },
          { value: "all", label: <span className="tabular-nums">전체 {items.length}</span> },
        ]}
      />

      {allCorrect && (
        <Notice tone="ok" icon={PartyPopper} title="모두 맞았어요! 완벽해요" className="mt-x4">
          틀린 단어 없이 {items.length}개를 전부 맞혔어요.
        </Notice>
      )}

      {shown.length > 0 && (
        <ul className="mt-x2 divide-y divide-stroke-neutral-subtle">
          {shown.map((it) => (
            <WordRow key={it.order} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WordRow({ item }: { item: ResultWordItem }) {
  const enToKo = item.direction === "EN_TO_KO";
  const question = enToKo ? item.word : item.meanings.join(" / ");
  const answer = enToKo ? item.meanings.join(", ") : item.word;
  const mine = item.studentAnswer?.trim() ?? "";
  const correct = !!item.isCorrect;

  return (
    <li className="flex items-start gap-x3 py-x4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-x1_5 gap-y-x1">
          <p className="min-w-0 break-words t5-bold text-fg-neutral">{question}</p>
          <Badge tone="gray">{enToKo ? "영→한" : "한→영"}</Badge>
        </div>
        <dl className="mt-x2 grid grid-cols-[auto_1fr] items-baseline gap-x-x3 gap-y-x1">
          <dt className="t3-regular text-fg-neutral-subtle">정답</dt>
          <dd className="min-w-0 break-words t4-medium text-fg-neutral">{answer}</dd>
          <dt className="t3-regular text-fg-neutral-subtle">내 답</dt>
          <dd
            className={cn(
              "min-w-0 break-words t4-medium",
              correct ? "text-fg-positive" : mine ? "text-fg-critical" : "text-fg-placeholder"
            )}
          >
            {mine || "입력 안 함"}
          </dd>
        </dl>
      </div>
      <span
        className={cn(
          "mt-x0_5 inline-flex size-x6 shrink-0 items-center justify-center rounded-full",
          correct ? "bg-bg-positive-weak text-fg-positive" : "bg-bg-critical-weak text-fg-critical"
        )}
        role="img"
        aria-label={correct ? "정답" : "오답"}
      >
        {correct ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        )}
      </span>
    </li>
  );
}

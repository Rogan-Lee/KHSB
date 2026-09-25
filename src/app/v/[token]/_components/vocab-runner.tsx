"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, History, Lock, PencilLine, SpellCheck, Timer, type LucideIcon } from "lucide-react";
import { startVocabAttempt, submitVocabAnswer, finalizeVocabAttempt, type RunnerItem } from "@/actions/vocab-online";
import { Badge, BottomCTA, Button, IconTile, Notice, ProgressBar } from "@/components/portal/ui";
import { cn } from "@/lib/utils";
import { VocabTopBar } from "./vocab-top-bar";

// ───────────────────────────── 진입(인트로) ─────────────────────────────

export function VocabExperience({
  token, studentName, examTitle, questionCount, perQuestionSeconds, resuming, portalHref,
}: {
  token: string;
  studentName: string;
  examTitle: string;
  questionCount: number;
  perQuestionSeconds: number;
  resuming: boolean;
  /** 학생 포털 영단어 탭 — 히스토리 없이 들어왔을 때 뒤로 가기 대상 */
  portalHref?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "loading" | "running">("intro");
  const [items, setItems] = useState<RunnerItem[]>([]);
  const [startAt, setStartAt] = useState(0);
  const [perQ, setPerQ] = useState(perQuestionSeconds);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setPhase("loading");
    setError(null);
    startVocabAttempt(token)
      .then((state) => {
        if (state.status === "submitted") {
          router.replace(`/v/${token}/result`);
          return;
        }
        setItems(state.items);
        setPerQ(state.perQuestionSeconds);
        setStartAt(Math.min(state.resumeFromOrder, state.items.length));
        if (state.items.length === 0) {
          // 문항이 없으면 바로 제출 처리
          finalizeVocabAttempt(token).finally(() => router.replace(`/v/${token}/result`));
          return;
        }
        setPhase("running");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "시험을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("intro");
      });
  };

  if (phase === "running") {
    return <VocabRunner token={token} items={items} startIndex={startAt} perQuestionSeconds={perQ} />;
  }

  const timed = perQuestionSeconds > 0;
  const loading = phase === "loading";

  return (
    <>
      <VocabTopBar leading="back" fallbackHref={portalHref} />

      <div className="mx-auto max-w-[480px] px-x5 pt-x4">
        <IconTile icon={SpellCheck} tone="brand" size={56} round />

        <p className="mt-x5 t4-regular text-fg-neutral-subtle">{studentName} 학생</p>
        <h1 className="mt-x1 break-keep t9-bold text-fg-neutral">{examTitle}</h1>

        {/* 시험 요약 */}
        <dl className="mt-x6 grid grid-cols-3 divide-x divide-stroke-neutral-subtle rounded-r4 bg-bg-layer-fill py-x4">
          <SummaryCell label="문항 수" value={`${questionCount}문항`} />
          <SummaryCell label="문항당" value={timed ? `${perQuestionSeconds}초` : "제한 없음"} />
          <SummaryCell
            label="예상 시간"
            value={timed ? `약 ${Math.ceil((questionCount * perQuestionSeconds) / 60)}분` : "—"}
          />
        </dl>

        {error && (
          <Notice tone="bad" icon={CircleAlert} className="mt-x6">
            {error}
          </Notice>
        )}

        {resuming && (
          <Notice tone="info" icon={History} title="풀던 시험이 있어요" className="mt-x6">
            마지막으로 푼 문항 다음부터 이어서 풀어요.
          </Notice>
        )}

        {/* 안내 */}
        <h2 className="mt-x8 t5-bold text-fg-neutral">시험 전에 확인해 주세요</h2>
        <ul className="mt-x4 flex flex-col gap-x3">
          {timed && (
            <RuleItem icon={Timer}>
              문항마다 {perQuestionSeconds}초가 주어져요. 시간이 지나면{" "}
              <span className="t4-medium text-fg-critical">오답</span>으로 처리되고 다음 문항으로 넘어가요.
            </RuleItem>
          )}
          <RuleItem icon={PencilLine}>뜻이 여러 개여도 하나만 적으면 돼요.</RuleItem>
          <RuleItem icon={Lock}>제출하면 다시 풀 수 없어요. 조용한 곳에서 시작해 주세요.</RuleItem>
        </ul>
      </div>

      <BottomCTA>
        <Button
          variant="primary"
          size="xl"
          block
          loading={loading}
          aria-disabled={loading || undefined}
          // SEED loading 상태는 클릭을 막지 않으므로 중복 시작 방지
          onClick={() => {
            if (!loading) begin();
          }}
        >
          {resuming ? "이어서 풀기" : "시작하기"}
        </Button>
      </BottomCTA>
    </>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-x1 px-x2 text-center">
      <dt className="t3-regular text-fg-neutral-subtle">{label}</dt>
      <dd className="t6-bold text-fg-neutral tabular-nums">{value}</dd>
    </div>
  );
}

function RuleItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-start gap-x3">
      <Icon className="mt-x0_5 size-x4 shrink-0 text-fg-neutral-subtle" strokeWidth={2.2} aria-hidden />
      <p className="min-w-0 flex-1 break-keep t4-regular text-fg-neutral-muted">{children}</p>
    </li>
  );
}

// ───────────────────────────── 응시 엔진 ─────────────────────────────

function VocabRunner({
  token, items, startIndex, perQuestionSeconds,
}: {
  token: string;
  items: RunnerItem[];
  startIndex: number;
  perQuestionSeconds: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(startIndex);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(perQuestionSeconds);
  const composingRef = useRef(false);
  const qStartRef = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const advancingRef = useRef(false);

  const total = items.length;
  const current = items[index];
  const timed = perQuestionSeconds > 0;

  const goNext = useCallback(
    async (answer: string) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      setBusy(true);
      const elapsed = Date.now() - qStartRef.current;
      const item = items[index];
      try {
        if (item) await submitVocabAnswer(token, item.id, answer, elapsed);
      } catch {
        // 네트워크 일시 오류여도 응시를 계속 — 마지막 finalize 에서 보정됨
      }
      const next = index + 1;
      if (next >= total) {
        try {
          await finalizeVocabAttempt(token);
        } finally {
          router.replace(`/v/${token}/result`);
        }
        return;
      }
      setIndex(next);
      setValue("");
      setBusy(false);
      advancingRef.current = false;
    },
    [index, items, total, token, router]
  );

  // 문항이 바뀔 때마다 타이머/포커스 리셋
  useEffect(() => {
    qStartRef.current = Date.now();
    setRemaining(perQuestionSeconds);
    inputRef.current?.focus();
    if (!timed) return;
    const id = setInterval(() => {
      const left = perQuestionSeconds - (Date.now() - qStartRef.current) / 1000;
      if (left <= 0) {
        clearInterval(id);
        setRemaining(0);
        // 타임아웃: 현재 입력값(보통 빈값)으로 제출 후 다음
        void goNext(inputRef.current?.value ?? "");
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!current) return null;

  const onSubmit = () => {
    if (busy) return;
    void goNext(value);
  };

  // 모르겠어요 — 빈 답으로 제출(시간 초과와 같은 처리)
  const skip = () => {
    if (busy) return;
    void goNext("");
  };

  // 버튼을 눌러도 입력창 포커스를 유지해 모바일 키보드가 닫히지 않게
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const pct = timed ? Math.max(0, Math.min(1, remaining / perQuestionSeconds)) : 1;
  const dangerTime = timed && remaining <= 3;
  const enToKo = current.direction === "EN_TO_KO";
  const isLast = index + 1 === total;

  return (
    <>
      <VocabTopBar leading={null}>
        <div className="flex min-w-0 flex-1 items-center px-x1">
          <span className="shrink-0" aria-label={`전체 ${total}문항 중 ${index + 1}번째`}>
            <span className="t5-bold text-fg-neutral tabular-nums">{index + 1}</span>
            <span className="t5-regular text-fg-neutral-subtle tabular-nums">/{total}</span>
          </span>
          <ProgressBar value={index / total} className="ml-x3 flex-1" />
        </div>
      </VocabTopBar>

      <div className="mx-auto max-w-[480px] px-x5 pt-x8 pb-x6">
        {/* 문제 — 문항마다 새로 페이드인. 입력창은 이 블록 밖에 둬서 리마운트(=키보드 닫힘)되지 않게 한다 */}
        <div key={index} className="portal-enter flex flex-col items-center text-center">
          {timed && <CountdownRing pct={pct} danger={dangerTime} seconds={Math.ceil(remaining)} />}
          <div className={cn("flex items-center justify-center gap-x2", timed && "mt-x5")}>
            <Badge tone={enToKo ? "brand" : "info"}>{enToKo ? "영→한" : "한→영"}</Badge>
            <p className="t5-medium text-fg-neutral-subtle">
              {enToKo ? "이 단어의 뜻은?" : "이 뜻의 영단어는?"}
            </p>
          </div>
          <p
            className={cn(
              "mt-x3 w-full break-keep break-words text-fg-neutral",
              current.prompt.length > 14 ? "t9-bold" : "t12-bold"
            )}
          >
            {current.prompt}
          </p>
        </div>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !composingRef.current && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          inputMode={current.direction === "KO_TO_EN" ? "text" : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // disabled 대신 readOnly — disabled 는 포커스를 잃어 문항 사이에 모바일 키보드가 닫힌다
          readOnly={busy}
          aria-label={enToKo ? "뜻 입력" : "영단어 입력"}
          placeholder={enToKo ? "뜻을 입력해 주세요" : "영단어를 입력해 주세요"}
          // 포커스(커서 깜빡임) 즉시 placeholder 숨김
          className="mt-x8 block h-x16 w-full rounded-r4 border border-stroke-neutral-weak bg-bg-layer-default px-x4 text-center t7-medium text-fg-neutral outline-none transition-[border-color,box-shadow] duration-color-transition placeholder:text-fg-placeholder focus:border-stroke-neutral-contrast focus:shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-contrast)] focus:placeholder:text-transparent disabled:bg-bg-disabled disabled:text-fg-disabled"
        />

        {/* 입력창 바로 아래(흐름 안) — iOS 키보드 위로 항상 보이게 */}
        <div className="mt-x3 flex gap-x2">
          <Button variant="gray" size="xl" onMouseDown={keepFocus} onClick={skip} disabled={busy}>
            모르겠어요
          </Button>
          <Button
            variant="primary"
            size="xl"
            className="flex-1"
            loading={busy}
            onMouseDown={keepFocus}
            onClick={onSubmit}
          >
            {isLast ? "제출하기" : "다음"}
          </Button>
        </div>
      </div>
    </>
  );
}

function CountdownRing({ pct, danger, seconds }: { pct: number; danger: boolean; seconds: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[72px]" role="timer" aria-label={`남은 시간 ${seconds}초`}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5" className="stroke-bg-neutral-weak" />
        <circle
          cx="36" cy="36" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
          className={cn(
            "transition-[stroke-dashoffset,stroke] duration-100 ease-linear",
            danger ? "stroke-bg-critical-solid" : "stroke-bg-brand-solid"
          )}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center t7-bold tabular-nums",
          danger ? "text-fg-critical" : "text-fg-neutral"
        )}
        aria-hidden
      >
        {seconds}
      </span>
    </div>
  );
}

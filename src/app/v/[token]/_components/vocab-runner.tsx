"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startVocabAttempt, submitVocabAnswer, finalizeVocabAttempt, type RunnerItem } from "@/actions/vocab-online";
import { ArrowRight, Loader2, Timer } from "lucide-react";

// ───────────────────────────── 진입(인트로) ─────────────────────────────

export function VocabExperience({
  token, studentName, examTitle, questionCount, perQuestionSeconds, resuming,
}: {
  token: string;
  studentName: string;
  examTitle: string;
  questionCount: number;
  perQuestionSeconds: number;
  resuming: boolean;
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
        setError(e instanceof Error ? e.message : "시험을 시작할 수 없습니다");
        setPhase("intro");
      });
  };

  if (phase === "running") {
    return <VocabRunner token={token} items={items} startIndex={startAt} perQuestionSeconds={perQ} />;
  }

  return (
    <div className="mx-auto flex min-h-[88svh] max-w-[560px] flex-col justify-center px-6 py-10">
      <p className="text-[13px] font-medium text-ink-4">{studentName} 학생</p>
      <h1 className="mt-1 text-[24px] font-bold tracking-[-0.02em] text-ink">{examTitle}</h1>

      <div className="mt-6 space-y-2.5 rounded-[16px] border border-line bg-panel p-5">
        <Rule label="문항 수" value={`${questionCount}문항`} />
        <Rule label="문항당 제한시간" value={perQuestionSeconds > 0 ? `${perQuestionSeconds}초` : "제한 없음"} />
        {perQuestionSeconds > 0 && (
          <p className="pt-1 text-[12.5px] leading-relaxed text-ink-4">
            제한시간이 지나면 그 문항은 <b className="text-bad-ink">오답</b>으로 처리되고 다음 문항으로 넘어갑니다. 답은 한 가지만 입력해도 됩니다.
          </p>
        )}
        <p className="text-[12.5px] leading-relaxed text-ink-4">
          제출 후에는 다시 풀 수 없어요. 조용한 곳에서 준비가 되면 시작하세요.
        </p>
      </div>

      {error && <p className="mt-3 text-[13px] text-bad-ink">{error}</p>}

      <button
        type="button"
        onClick={begin}
        disabled={phase === "loading"}
        className="mt-6 inline-flex h-14 items-center justify-center gap-2 rounded-[14px] bg-brand text-[16px] font-semibold text-white active:scale-[0.99] transition-transform disabled:opacity-60"
      >
        {phase === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {resuming ? "이어서 풀기" : "시작하기"}
      </button>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[14px]">
      <span className="text-ink-4">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
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

  const pct = timed ? Math.max(0, Math.min(1, remaining / perQuestionSeconds)) : 1;
  const dangerTime = timed && remaining <= 3;

  return (
    <div className="mx-auto flex min-h-[88svh] max-w-[680px] flex-col px-6 py-6 sm:py-10">
      {/* 진행 상태 */}
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold tabular-nums text-ink-3">{index + 1} / {total}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-2">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((index) / total) * 100}%` }} />
        </div>
        {timed && (
          <span className={`inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums ${dangerTime ? "text-bad-ink" : "text-ink-3"}`}>
            <Timer className="h-3.5 w-3.5" /> {Math.ceil(remaining)}s
          </span>
        )}
      </div>

      {/* 문제 */}
      <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center sm:mt-16">
        {timed && (
          <CountdownRing pct={pct} danger={dangerTime} seconds={Math.ceil(remaining)} />
        )}
        <p className="mt-6 text-[13px] font-medium uppercase tracking-wider text-ink-4">
          {current.direction === "EN_TO_KO" ? "이 단어의 뜻은?" : "이 뜻의 영단어는?"}
        </p>
        <p className="mt-2 break-keep text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[38px]">
          {current.prompt}
        </p>

        <div className="mt-8 w-full max-w-[420px]">
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
            disabled={busy}
            placeholder={current.direction === "EN_TO_KO" ? "뜻을 입력하세요" : "영단어를 입력하세요"}
            className="w-full rounded-[14px] border-2 border-line bg-panel px-4 py-4 text-center text-[20px] font-medium text-ink outline-none focus:border-brand disabled:opacity-60"
          />
        </div>
      </div>

      {/* 다음 버튼 */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="mt-6 inline-flex h-14 items-center justify-center gap-2 rounded-[14px] bg-ink text-[16px] font-semibold text-white active:scale-[0.99] transition-transform disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{index + 1 === total ? "제출하기" : "다음"}<ArrowRight className="h-5 w-5" /></>}
      </button>
    </div>
  );
}

function CountdownRing({ pct, danger, seconds }: { pct: number; danger: boolean; seconds: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[88px] w-[88px]">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-canvas-2" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke="currentColor"
          className={danger ? "text-bad-ink transition-[stroke-dashoffset] duration-100" : "text-brand transition-[stroke-dashoffset] duration-100"}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[22px] font-bold tabular-nums ${danger ? "text-bad-ink" : "text-ink"}`}>
        {seconds}
      </span>
    </div>
  );
}

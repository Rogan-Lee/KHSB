"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCheckmarkLine,
  IconExclamationmarkCircleLine,
  IconLockLine,
  IconPlusLine,
  IconTrashcanLine,
} from "@karrotmarket/react-monochrome-icon";
import { Fieldset, PrefixIcon } from "@seed-design/react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  CAREER_LEVELS,
  PERFORMANCE_METHOD_OPTIONS,
  PERFORMANCE_OUTPUT_OPTIONS,
  emptyPerformanceBook,
  emptyPerformanceSubject,
  isPerformanceComplete,
  type PerformanceAnswer,
  type PerformanceBook,
  type PerformanceSubject,
} from "@/lib/online/survey-template";
import { Button, Chip, Notice, Segmented } from "@/components/portal/ui";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

// 회색 블록(bg-layer-fill) 안의 입력칸은 흰 채움으로 띄운다 (SEED text-input 은 기본 투명)
const ON_FILL = "bg-bg-layer-default";

export function PerformanceSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: PerformanceAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<PerformanceAnswer>(initial);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(initial));

  // Auto-save on change
  useEffect(() => {
    if (isSubmitted) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await upsertSurveySection({
          studentToken,
          sectionKey,
          answer: value as unknown as Record<string, unknown>,
        });
        lastSaved.current = serialized;
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, studentToken, sectionKey, isSubmitted]);

  // 부모(wizard)에 valid 상태 전달
  useEffect(() => {
    onValidityChange?.(isPerformanceComplete(value));
  }, [value, onValidityChange]);

  // ─────────────── 과목별 탐구 ───────────────
  function updateSubject(idx: number, patch: Partial<PerformanceSubject>) {
    setValue((v) => ({
      ...v,
      subjects: v.subjects.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function toggleSubjectMethod(idx: number, method: string) {
    setValue((v) => ({
      ...v,
      subjects: v.subjects.map((s, i) => {
        if (i !== idx) return s;
        const next = s.methods.includes(method)
          ? s.methods.filter((m) => m !== method)
          : [...s.methods, method];
        return { ...s, methods: next };
      }),
    }));
  }
  function addSubject() {
    setValue((v) => ({ ...v, subjects: [...v.subjects, emptyPerformanceSubject()] }));
  }
  function removeSubject(idx: number) {
    setValue((v) => ({ ...v, subjects: v.subjects.filter((_, i) => i !== idx) }));
  }

  // ─────────────── 교과 연계 독서 ───────────────
  function updateBook(idx: number, patch: Partial<PerformanceBook>) {
    setValue((v) => ({
      ...v,
      books: v.books.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  }
  function addBook() {
    setValue((v) => ({ ...v, books: [...v.books, emptyPerformanceBook()] }));
  }
  function removeBook(idx: number) {
    setValue((v) => ({ ...v, books: v.books.filter((_, i) => i !== idx) }));
  }

  // ─────────────── 활동 결과물 ───────────────
  function toggleOutput(opt: string) {
    setValue((v) => {
      const next = v.outputs.includes(opt) ? v.outputs.filter((o) => o !== opt) : [...v.outputs, opt];
      return { ...v, outputs: next };
    });
  }

  return (
    // disabled fieldset — 제출 후에는 모든 입력이 함께 잠긴다 (SEED 컨트롤엔 disabled 도 직접 전달)
    <fieldset disabled={isSubmitted} className="-mt-3 min-w-0">
      <SaveStatus status={status} locked={isSubmitted} />

      <div className="flex flex-col gap-x10">
        {/* 레거시 답변 표시 */}
        {value.legacyText && (
          <Notice tone="warn" title="이전에 적은 답변">
            <p className="whitespace-pre-wrap">{value.legacyText}</p>
            <p className="mt-x2 t3-regular">참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.</p>
          </Notice>
        )}

        {/* 과목별 탐구 */}
        <FormSection
          title="과목별 탐구 경험"
          description="과목마다 탐구 주제와 방식, 내가 주도한 부분을 적어 주세요."
        >
          {value.subjects.map((s, i) => (
            <EntryBlock
              key={i}
              title={`과목 ${i + 1}`}
              onRemove={value.subjects.length > 1 ? () => removeSubject(i) : undefined}
              removeDisabled={isSubmitted}
            >
              <TextField
                label="과목명"
                value={s.subject}
                onValueChange={({ value: text }) => updateSubject(i, { subject: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldInput placeholder="예: 생명과학Ⅰ" />
              </TextField>
              <TextField
                label="탐구 주제"
                value={s.topic}
                onValueChange={({ value: text }) => updateSubject(i, { topic: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldInput placeholder="어떤 주제로 탐구했나요?" />
              </TextField>
              <MultiChoiceField label="탐구 방식">
                <div className="flex flex-wrap gap-x2">
                  {PERFORMANCE_METHOD_OPTIONS.map((m) => (
                    <Chip
                      key={m}
                      selected={s.methods.includes(m)}
                      onClick={() => toggleSubjectMethod(i, m)}
                      disabled={isSubmitted}
                    >
                      {m}
                    </Chip>
                  ))}
                </div>
                {s.methods.includes("기타") && (
                  <TextField
                    value={s.methodOther ?? ""}
                    onValueChange={({ value: text }) => updateSubject(i, { methodOther: text })}
                    disabled={isSubmitted}
                    className={ON_FILL}
                  >
                    <TextFieldInput placeholder="기타 방식을 적어 주세요" aria-label="기타 탐구 방식" />
                  </TextField>
                )}
              </MultiChoiceField>
              <TextField
                label="내가 주도한 부분"
                value={s.selfRole}
                onValueChange={({ value: text }) => updateSubject(i, { selfRole: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldTextarea placeholder="탐구 설계, 데이터 수집·분석, 발표 등 구체적으로 적어 주세요" />
              </TextField>
            </EntryBlock>
          ))}
          {!isSubmitted && (
            <Button variant="weak" size="md" block onClick={addSubject}>
              <PrefixIcon svg={<IconPlusLine />} />
              과목 추가
            </Button>
          )}
        </FormSection>

        {/* 교과 연계 독서 */}
        <FormSection
          title="교과 연계 독서"
          description="읽은 책과 이유, 연결 교과, 확장 탐구를 적어 주세요."
        >
          {value.books.map((b, i) => (
            <EntryBlock
              key={i}
              title={`도서 ${i + 1}`}
              onRemove={value.books.length > 1 ? () => removeBook(i) : undefined}
              removeDisabled={isSubmitted}
            >
              <TextField
                label="책 제목"
                value={b.title}
                onValueChange={({ value: text }) => updateBook(i, { title: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldInput placeholder="책 제목을 적어 주세요" />
              </TextField>
              <TextField
                label="연결 교과"
                value={b.linkedSubject}
                onValueChange={({ value: text }) => updateBook(i, { linkedSubject: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldInput placeholder="예: 생명과학Ⅰ" />
              </TextField>
              <TextField
                label="읽은 이유"
                value={b.reason}
                onValueChange={({ value: text }) => updateBook(i, { reason: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldTextarea placeholder="이 책을 고른 이유를 적어 주세요" />
              </TextField>
              <TextField
                label="인상 깊은 개념 · 확장 탐구"
                value={b.expansion}
                onValueChange={({ value: text }) => updateBook(i, { expansion: text })}
                disabled={isSubmitted}
                className={ON_FILL}
              >
                <TextFieldTextarea placeholder="책에서 발전시킨 탐구나 적용 사례를 적어 주세요" />
              </TextField>
            </EntryBlock>
          ))}
          {!isSubmitted && (
            <Button variant="weak" size="md" block onClick={addBook}>
              <PrefixIcon svg={<IconPlusLine />} />
              도서 추가
            </Button>
          )}
        </FormSection>

        {/* 진로 탐색 */}
        <FormSection title="진로 탐색 수준" description="지금 진로를 어느 정도 정했나요?">
          <Segmented<PerformanceAnswer["careerLevel"]>
            aria-label="진로 탐색 수준"
            options={[...CAREER_LEVELS]}
            value={value.careerLevel}
            onChange={(level) => setValue((v) => ({ ...v, careerLevel: level }))}
            disabled={isSubmitted}
          />
          {value.careerLevel === "specified" && (
            <div className="pt-x3">
              <TextField
                label="희망 진로 · 전공"
                value={value.careerDetail}
                onValueChange={({ value: text }) => setValue((v) => ({ ...v, careerDetail: text }))}
                disabled={isSubmitted}
              >
                <TextFieldInput placeholder="예: 약학과 — 신약 개발 연구원" />
              </TextField>
            </div>
          )}
        </FormSection>

        {/* 활동 결과물 */}
        <FormSection title="활동 결과물" description="해당하는 걸 모두 골라 주세요.">
          <div className="flex flex-wrap gap-x2">
            {PERFORMANCE_OUTPUT_OPTIONS.map((opt) => (
              <Chip
                key={opt}
                selected={value.outputs.includes(opt)}
                onClick={() => toggleOutput(opt)}
                disabled={isSubmitted}
              >
                {opt}
              </Chip>
            ))}
          </div>
          {value.outputs.includes("기타") && (
            <TextField
              value={value.outputOther ?? ""}
              onValueChange={({ value: text }) => setValue((v) => ({ ...v, outputOther: text }))}
              disabled={isSubmitted}
            >
              <TextFieldInput placeholder="기타 결과물 형태를 적어 주세요" aria-label="기타 결과물 형태" />
            </TextField>
          )}
        </FormSection>
      </div>
    </fieldset>
  );
}

// ─── 로컬 폼 조각 ─────────────────────────────────────────────────────

function SaveStatus({ status, locked }: { status: SaveState; locked: boolean }) {
  return (
    <div aria-live="polite" className="mb-x3 flex h-x5 items-center justify-end t3-medium">
      {locked ? (
        <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
          <IconLockLine size={14} aria-hidden />
          제출 후 잠김
        </span>
      ) : status === "saving" ? (
        <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
          <ProgressCircle
            size="inherit"
            tone="neutral"
            aria-hidden
            className="[--size:var(--seed-dimension-x3_5)] [--thickness:2px]"
          />
          저장 중
        </span>
      ) : status === "saved" ? (
        <span className="inline-flex items-center gap-x1 text-fg-positive">
          <IconCheckmarkLine size={14} aria-hidden />
          저장됨
        </span>
      ) : status === "error" ? (
        <span className="inline-flex items-center gap-x1 text-fg-critical">
          <IconExclamationmarkCircleLine size={14} aria-hidden />
          저장 실패
        </span>
      ) : null}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="t6-bold text-fg-neutral">{title}</h3>
      {description != null && (
        <p className="mt-x1 t4-regular text-fg-neutral-subtle">{description}</p>
      )}
      <div className="mt-x4 flex flex-col gap-x3">{children}</div>
    </section>
  );
}

/** 반복 입력 묶음 (과목·도서) — 흰 화면 위 회색(bg-layer-fill) 블록 */
function EntryBlock({
  title,
  onRemove,
  removeDisabled,
  children,
}: {
  title: ReactNode;
  onRemove?: () => void;
  removeDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-r4 bg-bg-layer-fill px-x4 pb-x5 pt-x3">
      <div className="mb-x3 flex min-h-9 items-center justify-between gap-x2">
        <p className="t5-bold text-fg-neutral">{title}</p>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={removeDisabled}
            className="-mr-2"
          >
            <PrefixIcon svg={<IconTrashcanLine />} />
            삭제
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-x5">{children}</div>
    </div>
  );
}

/** 여러 개 고르는 칩 묶음 — SEED Fieldset 라벨 + 보조 표시 */
function MultiChoiceField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Fieldset.Root>
      <Fieldset.Header>
        <Fieldset.Label>
          {label}
          <Fieldset.IndicatorText>여러 개 고를 수 있어요</Fieldset.IndicatorText>
        </Fieldset.Label>
      </Fieldset.Header>
      {children}
    </Fieldset.Root>
  );
}

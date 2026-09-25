"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lightbulb } from "lucide-react";
import {
  IconCheckmarkLine,
  IconExclamationmarkCircleLine,
  IconLockLine,
} from "@karrotmarket/react-monochrome-icon";
import { RadioGroupField } from "@seed-design/react";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import {
  ASPIRATION_LABELS,
  GOALS_TRACK_OPTIONS,
  GOALS_FIT_OPTIONS,
  GOALS_PRIORITY_AXIS_OPTIONS,
  GOALS_CAREER_ALIGNMENT_OPTIONS,
  isGoalsComplete,
  type Aspiration,
  type GoalsAnswer,
} from "@/lib/online/survey-template";
import { Notice, Segmented } from "@/components/portal/ui";
import { Chip as SeedChip } from "seed-design/ui/chip";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldInput, TextFieldTextarea } from "seed-design/ui/text-field";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

// 회색 블록(bg-layer-fill) 안의 입력칸은 흰 채움으로 띄운다 (SEED text-input 은 기본 투명)
const ON_FILL = "bg-bg-layer-default";

export function GoalsSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: GoalsAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<GoalsAnswer>(initial);
  const [status, setStatus] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(initial));

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

  useEffect(() => {
    onValidityChange?.(isGoalsComplete(value));
  }, [value, onValidityChange]);

  function updateAspiration(idx: number, patch: Partial<Aspiration>) {
    setValue((v) => ({
      ...v,
      aspirations: v.aspirations.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  return (
    // disabled fieldset — 제출 후에는 모든 입력이 함께 잠긴다 (SEED 컨트롤엔 disabled 도 직접 전달)
    <fieldset disabled={isSubmitted} className="-mt-3 min-w-0">
      <SaveStatus status={status} locked={isSubmitted} />

      <div className="flex flex-col gap-x10">
        {value.legacyText && (
          <Notice tone="warn" title="이전에 적은 답변">
            <p className="whitespace-pre-wrap">{value.legacyText}</p>
            <p className="mt-x2 t3-regular">참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.</p>
          </Notice>
        )}

        {/* 1·2·3지망 */}
        <FormSection title="희망 대학·학과" description="1지망부터 3지망까지 적어 주세요.">
          {value.aspirations.map((a, i) => (
            <div key={i} className="rounded-r4 bg-bg-layer-fill px-x4 pb-x5 pt-x4">
              <p className="mb-x4 t5-bold text-fg-neutral">{ASPIRATION_LABELS[i]}</p>
              <div className="flex flex-col gap-x5">
                <TextField
                  label="대학"
                  value={a.university}
                  onValueChange={({ value: text }) => updateAspiration(i, { university: text })}
                  disabled={isSubmitted}
                  className={ON_FILL}
                >
                  <TextFieldInput placeholder="예: 서울대학교" />
                </TextField>
                <TextField
                  label="학과"
                  value={a.department}
                  onValueChange={({ value: text }) => updateAspiration(i, { department: text })}
                  disabled={isSubmitted}
                  className={ON_FILL}
                >
                  <TextFieldInput placeholder="예: 경영학과" />
                </TextField>
                <RadioChipField<Aspiration["track"]>
                  label="지원 전형"
                  options={GOALS_TRACK_OPTIONS}
                  value={a.track}
                  onValueChange={(track) => updateAspiration(i, { track })}
                  disabled={isSubmitted}
                />
                <RadioChipField<Aspiration["fit"]>
                  label="난이도 분류"
                  options={GOALS_FIT_OPTIONS}
                  value={a.fit}
                  onValueChange={(fit) => updateAspiration(i, { fit })}
                  disabled={isSubmitted}
                />
                <TextField
                  label="고른 이유"
                  value={a.reason}
                  onValueChange={({ value: text }) => updateAspiration(i, { reason: text })}
                  disabled={isSubmitted}
                  className={ON_FILL}
                >
                  <TextFieldTextarea placeholder="이 대학·학과를 고른 이유를 1–2줄로 적어 주세요" />
                </TextField>
              </div>
            </div>
          ))}
        </FormSection>

        {/* 우선순위 축 */}
        <FormSection
          title="우선순위"
          description="대학과 학과가 부딪치면 무엇을 먼저 볼까요?"
        >
          <SeedChip.RadioRoot
            aria-label="우선순위"
            value={value.priorityAxis}
            onValueChange={(axis) =>
              setValue((v) => ({ ...v, priorityAxis: axis as GoalsAnswer["priorityAxis"] }))
            }
            disabled={isSubmitted}
            className="flex flex-wrap gap-x2"
          >
            {GOALS_PRIORITY_AXIS_OPTIONS.map((opt) => (
              <SeedChip.RadioItem key={opt.value} value={opt.value} variant="outlineStrong" size="medium">
                <SeedChip.Label>{opt.label}</SeedChip.Label>
              </SeedChip.RadioItem>
            ))}
          </SeedChip.RadioRoot>
        </FormSection>

        {/* 진로 일치 */}
        <FormSection
          title="진로 일치 여부"
          description="희망 학과가 생각하는 진로와 맞나요?"
        >
          <Segmented<GoalsAnswer["careerAlignment"]>
            aria-label="진로 일치 여부"
            options={[...GOALS_CAREER_ALIGNMENT_OPTIONS]}
            value={value.careerAlignment}
            onChange={(alignment) => setValue((v) => ({ ...v, careerAlignment: alignment }))}
            disabled={isSubmitted}
          />
          {value.careerAlignment === "undecided" && (
            <Notice tone="info" icon={Lightbulb}>
              진로가 아직 정해지지 않아도 괜찮아요. 컨설턴트가 학과 탐색부터 함께 잡아 드릴게요.
              가능하면 관심 있는 분야(이공계열, 인문사회, 예체능 등)를 위 지망 학과 칸에 적어 주세요.
            </Notice>
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

/** 하나만 고르는 칩 묶음 — SEED RadioGroupField 라벨 + Chip.RadioItem */
function RadioChipField<T extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
}: {
  label: ReactNode;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroupField.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
    >
      <RadioGroupField.Header>
        <RadioGroupField.Label>{label}</RadioGroupField.Label>
      </RadioGroupField.Header>
      <div className="flex flex-wrap gap-x2">
        {options.map((o) => (
          <SeedChip.RadioItem key={o.value} value={o.value} variant="outlineStrong" size="medium">
            <SeedChip.Label>{o.label}</SeedChip.Label>
          </SeedChip.RadioItem>
        ))}
      </div>
    </RadioGroupField.Root>
  );
}

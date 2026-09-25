"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, History, Lock } from "lucide-react";
import { IconPlusLine, IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { Fieldset, PrefixIcon } from "@seed-design/react";
import { ActionButton } from "seed-design/ui/action-button";
import { Chip } from "seed-design/ui/chip";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { TextField, TextFieldInput } from "seed-design/ui/text-field";
import { upsertSurveySection } from "@/actions/online/onboarding-survey";
import { Button, Notice } from "@/components/portal/ui";
import {
  SW_LEVEL_OPTIONS,
  SW_WEAK_AREA_OPTIONS,
  SW_HABIT_OPTIONS,
  emptySubjectStrength,
  isStrengthsWeaknessesComplete,
  type StrengthsWeaknessesAnswer,
  type SubjectStrength,
  type SwLevel,
} from "@/lib/online/survey-template";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/** 숫자 입력의 스핀 버튼 숨김 (SEED TextFieldInput 에 덧붙임) */
const NO_SPIN =
  "tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function StrengthsWeaknessesSurveyStep({
  studentToken,
  sectionKey,
  initial,
  isSubmitted,
  onValidityChange,
}: {
  studentToken: string;
  sectionKey: string;
  initial: StrengthsWeaknessesAnswer;
  isSubmitted: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [value, setValue] = useState<StrengthsWeaknessesAnswer>(initial);
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
    onValidityChange?.(isStrengthsWeaknessesComplete(value));
  }, [value, onValidityChange]);

  function updateSubject(idx: number, patch: Partial<SubjectStrength>) {
    setValue((v) => ({
      ...v,
      bySubject: v.bySubject.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function toggleWeakArea(idx: number, area: string) {
    setValue((v) => ({
      ...v,
      bySubject: v.bySubject.map((s, i) => {
        if (i !== idx) return s;
        const next = s.weakAreas.includes(area)
          ? s.weakAreas.filter((a) => a !== area)
          : [...s.weakAreas, area];
        return { ...s, weakAreas: next };
      }),
    }));
  }
  function addSubject() {
    setValue((v) => ({ ...v, bySubject: [...v.bySubject, emptySubjectStrength()] }));
  }
  function removeSubject(idx: number) {
    setValue((v) => ({ ...v, bySubject: v.bySubject.filter((_, i) => i !== idx) }));
  }
  function toggleHabit(habit: string) {
    setValue((v) => {
      const next = v.studyHabits.includes(habit)
        ? v.studyHabits.filter((h) => h !== habit)
        : [...v.studyHabits, habit];
      return { ...v, studyHabits: next };
    });
  }

  return (
    <div className="relative">
      <SaveStatus status={status} locked={isSubmitted} />

      <div className="flex flex-col gap-x10">
        {value.legacyText && (
          <Notice tone="warn" icon={History} title="이전에 적은 답변">
            <p className="whitespace-pre-wrap">{value.legacyText}</p>
            <p className="mt-x2 t3-regular">참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.</p>
          </Notice>
        )}

        {/* 1. 과목별 강·약 */}
        <Group title="과목별 강·약" description="과목마다 수준과 약한 부분을 알려 주세요.">
          <div className="flex flex-col gap-x2_5">
            {value.bySubject.map((s, i) => (
              <div key={i} className="rounded-r4 bg-bg-layer-fill p-x4">
                <div className="flex h-x9 items-center justify-between gap-x2">
                  <span className="t5-bold text-fg-neutral">과목 {i + 1}</span>
                  {value.bySubject.length > 1 && (
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="small"
                      color="fg.neutralSubtle"
                      onClick={() => removeSubject(i)}
                      disabled={isSubmitted}
                      className="-mr-2"
                      aria-label={`과목 ${i + 1} 삭제`}
                    >
                      <PrefixIcon svg={<IconTrashcanLine />} />
                      삭제
                    </ActionButton>
                  )}
                </div>

                <div className="mt-x3 flex flex-col gap-x5">
                  <TextField
                    value={s.subject}
                    onValueChange={({ value: subject }) => updateSubject(i, { subject })}
                    disabled={isSubmitted}
                    className="bg-bg-layer-default"
                  >
                    <TextFieldInput
                      placeholder="과목명 (예: 수학, 국어, 생명과학Ⅰ)"
                      aria-label={`과목 ${i + 1} 이름`}
                    />
                  </TextField>

                  <Fieldset.Root>
                    <Fieldset.Header>
                      <Fieldset.Label>강·중·약</Fieldset.Label>
                    </Fieldset.Header>
                    <Chip.RadioRoot
                      aria-label="강·중·약"
                      name={`level-${i}`}
                      value={s.level}
                      onValueChange={(level) => updateSubject(i, { level: level as SwLevel })}
                      disabled={isSubmitted}
                      className="grid grid-cols-3 gap-x2"
                    >
                      {SW_LEVEL_OPTIONS.map((opt) => (
                        <Chip.RadioItem
                          key={opt.value}
                          value={opt.value}
                          variant="outlineStrong"
                          size="large"
                          className="w-full"
                        >
                          <Chip.Label>{opt.label}</Chip.Label>
                        </Chip.RadioItem>
                      ))}
                    </Chip.RadioRoot>
                  </Fieldset.Root>

                  <div className="grid grid-cols-2 gap-x2">
                    <TextField
                      label="내신 등급"
                      value={s.internalGrade}
                      onValueChange={({ value: internalGrade }) => updateSubject(i, { internalGrade })}
                      disabled={isSubmitted}
                      className="bg-bg-layer-default"
                    >
                      <TextFieldInput
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        min={1}
                        max={9}
                        placeholder="-"
                        className={NO_SPIN}
                      />
                    </TextField>
                    <TextField
                      label="모의 등급"
                      value={s.mockGrade}
                      onValueChange={({ value: mockGrade }) => updateSubject(i, { mockGrade })}
                      disabled={isSubmitted}
                      className="bg-bg-layer-default"
                    >
                      <TextFieldInput
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={1}
                        max={9}
                        placeholder="-"
                        className={NO_SPIN}
                      />
                    </TextField>
                  </div>

                  <Fieldset.Root>
                    <Fieldset.Header>
                      <Fieldset.Label>
                        약한 영역
                        <Fieldset.IndicatorText>모두 골라 주세요</Fieldset.IndicatorText>
                      </Fieldset.Label>
                    </Fieldset.Header>
                    <div className="flex flex-wrap gap-x1_5">
                      {SW_WEAK_AREA_OPTIONS.map((area) => (
                        <Chip.Toggle
                          key={area}
                          variant="outlineStrong"
                          size="large"
                          checked={s.weakAreas.includes(area)}
                          onCheckedChange={() => toggleWeakArea(i, area)}
                          disabled={isSubmitted}
                        >
                          <Chip.Label>{area}</Chip.Label>
                        </Chip.Toggle>
                      ))}
                    </div>
                    {s.weakAreas.includes("기타") && (
                      <TextField
                        value={s.weakAreaOther ?? ""}
                        onValueChange={({ value: weakAreaOther }) => updateSubject(i, { weakAreaOther })}
                        disabled={isSubmitted}
                        className="bg-bg-layer-default"
                      >
                        <TextFieldInput
                          placeholder="기타 약한 영역을 적어 주세요"
                          aria-label="기타 약한 영역"
                        />
                      </TextField>
                    )}
                  </Fieldset.Root>

                  <TextField
                    label="이유"
                    value={s.reason}
                    onValueChange={({ value: reason }) => updateSubject(i, { reason })}
                    disabled={isSubmitted}
                    className="bg-bg-layer-default"
                  >
                    <TextFieldInput placeholder="한 줄로 (예: 개념 정리 부족, 기출 분석 안 함)" />
                  </TextField>
                </div>
              </div>
            ))}
          </div>
          {!isSubmitted && (
            <Button variant="gray" size="md" block onClick={addSubject} className="mt-x2_5">
              <PrefixIcon svg={<IconPlusLine />} />
              과목 추가
            </Button>
          )}
        </Group>

        {/* 2. 학습 습관 */}
        <Group title="학습 습관" description="해당하는 걸 모두 골라 주세요.">
          <div className="flex flex-wrap gap-x2">
            {SW_HABIT_OPTIONS.map((h) => (
              <Chip.Toggle
                key={h}
                variant="outlineStrong"
                size="large"
                checked={value.studyHabits.includes(h)}
                onCheckedChange={() => toggleHabit(h)}
                disabled={isSubmitted}
              >
                <Chip.Label>{h}</Chip.Label>
              </Chip.Toggle>
            ))}
          </div>
        </Group>

        {/* 3. 집중 가능 시간 */}
        <Group title="평균 집중 가능 시간" description="한 번 앉으면 보통 몇 분 정도 집중할 수 있나요?">
          <TextField
            suffix="분"
            value={value.focusMinutes}
            onValueChange={({ value: focusMinutes }) => setValue((v) => ({ ...v, focusMinutes }))}
            disabled={isSubmitted}
          >
            <TextFieldInput
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              step={5}
              placeholder="예: 45"
              aria-label="평균 집중 가능 시간(분)"
              className={NO_SPIN}
            />
          </TextField>
        </Group>

        {/* 4. 시험 불안도 */}
        <Group title="시험 불안도">
          <ScaleRow
            label="시험 불안도"
            value={value.testAnxiety}
            onChange={(n) => setValue((v) => ({ ...v, testAnxiety: n }))}
            disabled={isSubmitted}
            leftLabel="낮음"
            rightLabel="높음"
          />
        </Group>

        {/* 5. 자기주도 수준 */}
        <Group title="자기주도 수준">
          <ScaleRow
            label="자기주도 수준"
            value={value.selfDirection}
            onChange={(n) => setValue((v) => ({ ...v, selfDirection: n }))}
            disabled={isSubmitted}
            leftLabel="관리 필요"
            rightLabel="완전 자기주도"
          />
        </Group>
      </div>
    </div>
  );
}

// ─── Local UI ────────────────────────────────────────────────────────

/** 답변 영역 위 우측의 작은 자동저장 상태 (부모의 질문 설명 아래 여백에 겹쳐 표시) */
function SaveStatus({ status, locked }: { status: SaveState; locked: boolean }) {
  let content: ReactNode = null;
  if (locked) {
    content = (
      <span className="inline-flex items-center gap-x1 text-fg-neutral-subtle">
        <Lock className="h-3.5 w-3.5" strokeWidth={2.4} />
        제출 후 잠김
      </span>
    );
  } else if (status === "saving") {
    content = (
      <span className="inline-flex items-center gap-x1_5 text-fg-neutral-subtle">
        {/* SEED ProgressCircle — 글자 높이에 맞춰 size="inherit" + 14px */}
        <ProgressCircle
          tone="neutral"
          size="inherit"
          aria-label="저장 중"
          className="[--size:14px] [--thickness:2px]"
        />
        저장 중
      </span>
    );
  } else if (status === "saved") {
    content = (
      <span className="inline-flex items-center gap-x1 text-fg-positive">
        <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
        저장됨
      </span>
    );
  } else if (status === "error") {
    content = <span className="text-fg-critical">저장 실패</span>;
  }
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute -top-6 right-0 flex h-x5 items-center t3-bold"
    >
      {content}
    </div>
  );
}

function Group({
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
      <div className="mt-x4">{children}</div>
    </section>
  );
}

/** 1~5 척도 — SEED Chip.RadioRoot / Chip.RadioItem (0 = 미선택) */
function ScaleRow({
  label,
  value,
  onChange,
  disabled,
  leftLabel,
  rightLabel,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div>
      <Chip.RadioRoot
        aria-label={label}
        value={value ? String(value) : ""}
        onValueChange={(v) => onChange(Number(v))}
        disabled={disabled}
        className="grid grid-cols-5 gap-x2"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip.RadioItem
            key={n}
            value={String(n)}
            variant="outlineStrong"
            size="large"
            className="w-full tabular-nums"
          >
            <Chip.Label>{n}</Chip.Label>
          </Chip.RadioItem>
        ))}
      </Chip.RadioRoot>
      <div className="mt-x2 flex justify-between px-x1 t3-regular text-fg-neutral-subtle">
        <span>1 · {leftLabel}</span>
        <span>{rightLabel} · 5</span>
      </div>
    </div>
  );
}

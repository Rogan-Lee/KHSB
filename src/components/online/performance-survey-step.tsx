"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, BookOpen, Beaker, Compass, Package } from "lucide-react";
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

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

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

  const inputBase = "w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:border-line-strong";

  return (
    <div className="space-y-5">
      {/* 자동 저장 상태 */}
      <div className="text-[11px] text-ink-5 text-right h-3">
        {status === "saving" && "저장 중…"}
        {status === "saved" && "저장됨"}
        {status === "error" && <span className="text-red-600">저장 실패</span>}
      </div>

      {/* 레거시 답변 표시 */}
      {value.legacyText && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-900 mb-1">이전 자유 기술 답변</p>
          <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{value.legacyText}</p>
          <p className="text-[10.5px] text-amber-800 mt-2">
            참고용으로만 보입니다. 아래 항목별로 다시 작성해 주세요.
          </p>
        </div>
      )}

      {/* 과목별 탐구 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Beaker className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">과목별 탐구 경험</h3>
          <span className="text-[10.5px] text-ink-5">(과목명 + 탐구 주제 + 방식 + 본인 주도 부분)</span>
        </div>
        {value.subjects.map((s, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-4">과목 {i + 1}</span>
              {value.subjects.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSubject(i)}
                  disabled={isSubmitted}
                  className="text-ink-5 hover:text-red-600 disabled:opacity-40"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                value={s.subject}
                onChange={(e) => updateSubject(i, { subject: e.target.value })}
                disabled={isSubmitted}
                placeholder="과목명 (예: 생명과학Ⅰ)"
                className={inputBase}
              />
              <input
                type="text"
                value={s.topic}
                onChange={(e) => updateSubject(i, { topic: e.target.value })}
                disabled={isSubmitted}
                placeholder="탐구 주제"
                className={inputBase}
              />
            </div>
            <div>
              <p className="text-[11px] text-ink-4 mb-1.5">탐구 방식 (해당 항목 모두 체크)</p>
              <div className="flex flex-wrap gap-1.5">
                {PERFORMANCE_METHOD_OPTIONS.map((m) => {
                  const checked = s.methods.includes(m);
                  return (
                    <label
                      key={m}
                      className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                        checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                      } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSubjectMethod(i, m)}
                        disabled={isSubmitted}
                        className="sr-only"
                      />
                      {m}
                    </label>
                  );
                })}
              </div>
              {s.methods.includes("기타") && (
                <input
                  type="text"
                  value={s.methodOther ?? ""}
                  onChange={(e) => updateSubject(i, { methodOther: e.target.value })}
                  disabled={isSubmitted}
                  placeholder="기타 방식 직접 입력"
                  className={`${inputBase} mt-2`}
                />
              )}
            </div>
            <textarea
              value={s.selfRole}
              onChange={(e) => updateSubject(i, { selfRole: e.target.value })}
              disabled={isSubmitted}
              placeholder="본인이 주도한 부분 (탐구 설계, 데이터 수집·분석, 발표 등 구체적으로)"
              rows={3}
              className={`${inputBase} resize-y`}
            />
          </div>
        ))}
        {!isSubmitted && (
          <button
            type="button"
            onClick={addSubject}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-[11.5px] text-ink-3 hover:border-line-strong hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            과목 추가
          </button>
        )}
      </section>

      {/* 교과 연계 독서 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">교과 연계 독서</h3>
          <span className="text-[10.5px] text-ink-5">(책 제목 / 읽은 이유 / 연결 교과 / 확장 탐구)</span>
        </div>
        {value.books.map((b, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-4">도서 {i + 1}</span>
              {value.books.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBook(i)}
                  disabled={isSubmitted}
                  className="text-ink-5 hover:text-red-600 disabled:opacity-40"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                value={b.title}
                onChange={(e) => updateBook(i, { title: e.target.value })}
                disabled={isSubmitted}
                placeholder="책 제목"
                className={inputBase}
              />
              <input
                type="text"
                value={b.linkedSubject}
                onChange={(e) => updateBook(i, { linkedSubject: e.target.value })}
                disabled={isSubmitted}
                placeholder="연결 교과 (예: 생명과학Ⅰ)"
                className={inputBase}
              />
            </div>
            <textarea
              value={b.reason}
              onChange={(e) => updateBook(i, { reason: e.target.value })}
              disabled={isSubmitted}
              placeholder="읽은 이유 (이 책을 선택한 이유)"
              rows={2}
              className={`${inputBase} resize-y`}
            />
            <textarea
              value={b.expansion}
              onChange={(e) => updateBook(i, { expansion: e.target.value })}
              disabled={isSubmitted}
              placeholder="인상 깊은 개념 / 확장 탐구 (책에서 발전시킨 탐구나 적용 사례)"
              rows={2}
              className={`${inputBase} resize-y`}
            />
          </div>
        ))}
        {!isSubmitted && (
          <button
            type="button"
            onClick={addBook}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-[11.5px] text-ink-3 hover:border-line-strong hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            도서 추가
          </button>
        )}
      </section>

      {/* 진로 탐색 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">진로 탐색 수준</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAREER_LEVELS.map((opt) => {
            const checked = value.careerLevel === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="careerLevel"
                  checked={checked}
                  onChange={() => setValue((v) => ({ ...v, careerLevel: opt.value }))}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {value.careerLevel === "specified" && (
          <input
            type="text"
            value={value.careerDetail}
            onChange={(e) => setValue((v) => ({ ...v, careerDetail: e.target.value }))}
            disabled={isSubmitted}
            placeholder="희망 진로 / 전공 (예: 약학과 — 신약 개발 연구원)"
            className={inputBase}
          />
        )}
      </section>

      {/* 활동 결과물 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-ink-3" />
          <h3 className="text-[13px] font-semibold text-ink">활동 결과물</h3>
          <span className="text-[10.5px] text-ink-5">(해당 항목 모두 체크)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERFORMANCE_OUTPUT_OPTIONS.map((opt) => {
            const checked = value.outputs.includes(opt);
            return (
              <label
                key={opt}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] ${
                  checked ? "border-ink bg-ink text-white" : "border-line text-ink-3 hover:border-line-strong"
                } ${isSubmitted ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOutput(opt)}
                  disabled={isSubmitted}
                  className="sr-only"
                />
                {opt}
              </label>
            );
          })}
        </div>
        {value.outputs.includes("기타") && (
          <input
            type="text"
            value={value.outputOther ?? ""}
            onChange={(e) => setValue((v) => ({ ...v, outputOther: e.target.value }))}
            disabled={isSubmitted}
            placeholder="기타 결과물 형태 직접 입력"
            className={inputBase}
          />
        )}
      </section>
    </div>
  );
}

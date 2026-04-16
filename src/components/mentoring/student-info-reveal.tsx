"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  mentoringNotes?: string | null;
  internalScoreRange?: string | null;
  mockScoreRange?: string | null;
  targetUniversity?: string | null;
  studentInfo?: string | null;
  selectedSubjects?: string | null;
  admissionType?: string | null;
  onlineLectures?: string | null;
};

const DETAIL_FIELDS: { key: keyof Props; label: string }[] = [
  { key: "selectedSubjects", label: "선택과목" },
  { key: "admissionType",    label: "입시 전형" },
  { key: "onlineLectures",   label: "수강중인 인강" },
  { key: "studentInfo",      label: "학생정보 메모" },
];

export function StudentInfoReveal(props: Props) {
  const [revealed, setRevealed] = useState(false);

  const hasScores = !!(props.internalScoreRange || props.mockScoreRange || props.targetUniversity);
  const hasDetail = DETAIL_FIELDS.some(({ key }) => !!props[key]);
  const hasSensitive = hasScores || hasDetail;

  if (!props.mentoringNotes && !hasSensitive) return null;

  return (
    <div className="space-y-3">
      {/* 멘토링 주의사항 — 항상 표시 */}
      {props.mentoringNotes && (
        <p className="text-sm font-medium text-foreground">{props.mentoringNotes}</p>
      )}

      {/* 성적대 + 상세 — 처음에는 블러 */}
      {hasSensitive && (
        <div className="relative rounded-md overflow-hidden">
          {/* 내용 영역 — revealed 상태에서 클릭하면 다시 가려짐 */}
          <div
            className={cn(
              "rounded-md bg-muted/40 px-4 py-3 space-y-4 transition-all duration-200",
              !revealed && "blur-sm select-none pointer-events-none"
            )}
            onClick={() => revealed && setRevealed(false)}
            style={revealed ? { cursor: "pointer" } : undefined}
            title={revealed ? "클릭해서 숨기기" : undefined}
          >
            {/* 성적대 / 희망대학 */}
            {hasScores && (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {props.internalScoreRange && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">내신 성적대</p>
                    <p className="text-base font-semibold">{props.internalScoreRange}</p>
                  </div>
                )}
                {props.mockScoreRange && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">모의고사 성적대</p>
                    <p className="text-base font-semibold">{props.mockScoreRange}</p>
                  </div>
                )}
                {props.targetUniversity && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">희망 대학</p>
                    <p className="text-base font-semibold">{props.targetUniversity}</p>
                  </div>
                )}
              </div>
            )}

            {/* 상세 필드 */}
            {hasDetail && (
              <div className={cn("space-y-3", hasScores && "border-t border-border/60 pt-3")}>
                {DETAIL_FIELDS.filter(({ key }) => !!props[key]).map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-base text-foreground whitespace-pre-wrap leading-relaxed">{props[key]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 블러 오버레이 */}
          {!revealed && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Eye className="h-4 w-4" />
              클릭해서 학생 정보 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

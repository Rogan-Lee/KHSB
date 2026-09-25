import type { ReactNode } from "react";
import {
  FileText,
  MessageCircle,
  StickyNote,
  Target,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { IconTile, Section, type Tone } from "@/components/portal/ui";
import { Prose } from "@/components/portal/prose";
import {
  MENTORING_NOTE_SECTIONS,
  type MentoringNoteFields,
  type MentoringNoteKey,
} from "@/lib/mentoring-note";

// 학부모 리포트의 멘토링 본문 — 원본 멘토링 기록과 AI 고도화 노트(customNote)가 같은 모양으로 보인다.
// 긴 글이 대부분이라 본문은 항상 흰 카드 위 Prose(16px · 1.75)로 두고,
// 항목마다 카드를 나눠 스크롤하면서도 "지금 어느 항목인지" 바로 보이게 한다.

const SECTION_LOOK: Record<MentoringNoteKey, { icon: LucideIcon; tone: Tone }> = {
  content: { icon: FileText, tone: "gray" },
  improvements: { icon: TrendingUp, tone: "ok" },
  weaknesses: { icon: Wrench, tone: "warn" },
  nextGoals: { icon: Target, tone: "brand" },
  notes: { icon: StickyNote, tone: "gray" },
};

/** 비어 있지 않은 항목이 하나라도 있는지 (preamble 포함) */
export function hasMentoringNote(fields: MentoringNoteFields, preamble?: string | null): boolean {
  return !!preamble?.trim() || MENTORING_NOTE_SECTIONS.some((s) => !!fields[s.key]?.trim());
}

/** 카드 머리글 — 작은 원형 아이콘 + 제목 */
function CardTitle({ icon, tone, children }: { icon: LucideIcon; tone: Tone; children: ReactNode }) {
  return (
    <span className="flex items-center gap-x2_5">
      <IconTile icon={icon} tone={tone} size={32} round />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * 멘토링 항목(오늘 멘토링 내용 · 개선된 점 · 보완할 점 · 다음 멘토링 목표 · 기타 메모)을
 * 항목별 흰 카드로 쌓는다. 빈 항목은 건너뛴다. preamble(첫 항목 앞 글)은 맨 위 안내 카드로.
 * Fragment 를 돌려주므로 ReportShell 의 세로 스택(gap-x3)에 그대로 놓는다.
 */
export function MentoringNoteSections({
  fields,
  preamble,
}: {
  fields: MentoringNoteFields;
  preamble?: string | null;
}) {
  const items = MENTORING_NOTE_SECTIONS.filter((s) => !!fields[s.key]?.trim());
  if (items.length === 0 && !preamble?.trim()) return null;

  return (
    <>
      <MentorMessageSection source={preamble} />
      {items.map((s) => {
        const look = SECTION_LOOK[s.key];
        return (
          <Section
            key={s.key}
            title={
              <CardTitle icon={look.icon} tone={look.tone}>
                {s.label}
              </CardTitle>
            }
          >
            <Prose source={fields[s.key]} className="pt-x1" />
          </Section>
        );
      })}
    </>
  );
}

/** 멘토가 따로 남긴 안내 글 — 형식 없는 customNote 또는 AI 노트의 머리말 */
export function MentorMessageSection({ source }: { source: string | null | undefined }) {
  if (!source?.trim()) return null;
  return (
    <Section
      title={
        <CardTitle icon={MessageCircle} tone="info">
          멘토 안내사항
        </CardTitle>
      }
    >
      <Prose source={source} className="pt-x1" />
    </Section>
  );
}

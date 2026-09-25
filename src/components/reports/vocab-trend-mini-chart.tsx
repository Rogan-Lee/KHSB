import { prisma } from "@/lib/prisma";
import { Section, StatGrid } from "@/components/portal/ui";
import { VocabTrendMiniChartView } from "./vocab-trend-mini-chart-view";

interface Props {
  studentId: string;
  fromDate?: Date;
  toDate?: Date;
  /** 섹션 헤더 제목. 기본 "영단어 학습 추이". */
  title?: string;
}

/**
 * 학부모/멘토링 리포트에 노출하는 영단어 학습 추이 미니차트.
 *
 * - 서버 컴포넌트: 토큰/게이트 통과한 리포트 페이지에서 호출되며, 직접 Prisma 로 조회.
 *   (Sprint 1 PR 1.3 — `getStudentVocabHistory` 와 동일한 read shape)
 * - 데이터가 비어 있으면 섹션 자체를 렌더하지 않음.
 */
export async function VocabTrendMiniChart({
  studentId,
  fromDate,
  toDate,
  title = "영단어 학습 추이",
}: Props) {
  const where: { studentId: string; testDate?: { gte?: Date; lte?: Date } } = { studentId };
  if (fromDate || toDate) {
    where.testDate = {};
    if (fromDate) where.testDate.gte = fromDate;
    if (toDate) where.testDate.lte = toDate;
  }

  const scores = await prisma.vocabTestScore.findMany({
    where,
    orderBy: { testDate: "asc" },
    select: {
      id: true,
      testDate: true,
      totalWords: true,
      correctWords: true,
      score: true,
    },
  });

  if (scores.length === 0) return null;

  const total = scores.length;
  const avgScore = Math.round((scores.reduce((s, r) => s + r.score, 0) / total) * 10) / 10;

  const data = scores.map((s) => ({
    date: s.testDate.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
    isoDate: s.testDate.toISOString().slice(0, 10),
    score: Math.round(s.score * 10) / 10,
    correctWords: s.correctWords,
    totalWords: s.totalWords,
  }));

  const latest = data[data.length - 1];

  return (
    <Section title={title}>
      <StatGrid
        items={[
          { label: "응시", value: `${total}회` },
          { label: "평균", value: `${avgScore}점` },
          { label: "최근", value: `${latest.score}점`, tone: "brand" },
        ]}
      />
      <div className="mt-x5">
        <VocabTrendMiniChartView data={data} />
      </div>
      <p className="mt-x2 t3-regular text-fg-neutral-subtle">점수는 정답률(%) 기준이에요.</p>
    </Section>
  );
}

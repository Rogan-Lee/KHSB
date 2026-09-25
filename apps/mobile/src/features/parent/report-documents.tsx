import {
  CalendarDays,
  ClipboardList,
  Images,
  MessagesSquare,
  PenLine,
  UserRound,
} from 'lucide-react-native';

import { EmptyState, Markdown, Section, showImages, space, Stack } from '@/design';
import type { ParentConsultationReport, ParentStudyPlanReport } from '@/lib/api/parent-reports';

import { formatReportDateLong, monthDayOfIso } from './report-format';
import { CardTitle, InfoCard, PhotoList, ReportHero } from './report-parts';

// 공부 계획(웹 /sp/[token]) · 상담 안내(웹 /cr/[token]) — 웹은 옛 디자인이라 같은 정보를 SEED 리포트 문법으로 그린다.

/** 공부 계획 — 계획표 사진 (누르면 전체 화면) */
export function StudyPlanReportBody({ data }: { data: ParentStudyPlanReport }) {
  return (
    <Stack>
      <ReportHero
        eyebrow={`${monthDayOfIso(data.createdAt)} 공부 계획`}
        title={`${data.student.name} 학생`}
        meta={[data.student.grade, data.student.school]}>
        <InfoCard
          rows={[
            { icon: CalendarDays, label: '작성일', value: formatReportDateLong(data.createdAt) },
            data.images.length > 0 && { icon: Images, label: '계획표', value: `${data.images.length}장` },
          ]}
        />
      </ReportHero>

      <Section
        title={
          <CardTitle icon={ClipboardList} tone="ok">
            공부 계획표
          </CardTitle>
        }>
        {data.images.length > 0 ? (
          <PhotoList images={data.images} alt="공부 계획표" />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="아직 올라온 계획표가 없어요"
            description="담당 선생님이 계획표를 올리면 이곳에 보여요."
            style={{ paddingVertical: space.x8 }}
          />
        )}
      </Section>
    </Stack>
  );
}

/** 상담 안내 — 상담 뒤 원장님이 보낸 안내 글 */
export function ConsultationReportBody({ data }: { data: ParentConsultationReport }) {
  const recipient = data.recipientName?.replace(/\s*님$/, '') || null;
  return (
    <Stack>
      <ReportHero
        eyebrow={`${monthDayOfIso(data.consultedAt ?? data.createdAt)} 상담 안내`}
        title={`${data.student.name} 학생`}
        meta={[data.student.grade, data.student.school]}>
        <InfoCard
          rows={[
            data.consultedAt && {
              icon: CalendarDays,
              label: '상담일',
              value: formatReportDateLong(data.consultedAt),
            },
            { icon: PenLine, label: '작성일', value: formatReportDateLong(data.createdAt) },
            recipient && { icon: UserRound, label: '받는 분', value: `${recipient}님` },
          ]}
        />
      </ReportHero>

      <Section
        title={
          <CardTitle icon={MessagesSquare} tone="warn">
            {`${recipient ?? `${data.student.name} 학부모`}님께 드리는 안내`}
          </CardTitle>
        }>
        {data.content ? (
          <Markdown
            source={data.content}
            onImagePress={(src) => showImages([src])}
            style={{ paddingTop: space.x1 }}
          />
        ) : (
          <EmptyState icon={MessagesSquare} title="아직 작성된 내용이 없어요" style={{ paddingVertical: space.x8 }} />
        )}
      </Section>
    </Stack>
  );
}

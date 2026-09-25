import { StyleSheet, View } from 'react-native';

import { Badge, Section, space, Text } from '@/design';
import type { ParentNotice, ParentNoticesResponse } from '@/lib/api/parent-services';

import { kstDateLabel } from './notice-format';
import { NoticeProse } from './notice-prose';

/** 공지 한 건 — 종류 배지 · 날짜 · 제목 · 본문(길면 더 보기) */
export function NoticePostCard({ notice, initiallyOpen = false }: { notice: ParentNotice; initiallyOpen?: boolean }) {
  return (
    <Section>
      <View style={s.meta}>
        {notice.source === 'operations' ? (
          <Badge tone="info">독서실 공지</Badge>
        ) : (
          <Badge tone="brand">학부모 공지</Badge>
        )}
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {kstDateLabel(notice.createdAt)}
        </Text>
      </View>
      <Text variant="t6-bold" accessibilityRole="header" style={{ marginTop: space.x2, marginBottom: space.x3 }}>
        {notice.title}
      </Text>
      <NoticeProse text={notice.content} collapsedBlocks={initiallyOpen ? undefined : 4} />
    </Section>
  );
}

/** 이달의 입시 정보 — 자녀 학년 전용이면 학년 배지 */
export function AdmissionCard({ admission }: { admission: NonNullable<ParentNoticesResponse['admission']> }) {
  return (
    <Section>
      <View style={s.meta}>
        <Badge tone="violet">{admission.forGrade ? `${admission.forGrade} 대상` : '전체 학년'}</Badge>
      </View>
      <Text variant="t6-bold" accessibilityRole="header" style={{ marginTop: space.x2, marginBottom: space.x3 }}>
        {admission.month}월 입시 정보
      </Text>
      <NoticeProse text={admission.content} collapsedBlocks={5} />
    </Section>
  );
}

const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
});

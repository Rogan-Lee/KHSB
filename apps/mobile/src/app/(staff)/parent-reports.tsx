import { FileCheck2, Search, Send } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Button,
  Chip,
  ChipGroup,
  color,
  EmptyState,
  ErrorState,
  ListRow,
  Screen,
  Section,
  SegmentTabs,
  space,
  Stack,
  StatGrid,
  Text,
  TextField,
} from '@/design';
import { formatDate, formatMonthDay } from '@/features/staff-learning/format';
import { ParentReportSheet } from '@/features/staff-learning/parent-report-sheet';
import { shareMessage } from '@/features/staff-learning/share';
import { ListSkeleton, StatSkeleton } from '@/features/staff-learning/skeletons';
import {
  PARENT_REPORTS_PATH,
  type StaffParentReportItem,
  type StaffParentReportsResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Tab = 'PENDING' | 'SENT';

/** 학부모 리포트 발송 현황 — 최근 완료 멘토링별로 리포트를 보냈는지, 바로 보내기·다시 보내기 */
export default function StaffParentReportsScreen() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState('');
  // 시트가 닫히는 동안에도 대상이 남아 있도록 열림 상태를 따로 둔다
  const [target, setTarget] = useState<StaffParentReportItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const q = useMobileQuery<StaffParentReportsResponse>(PARENT_REPORTS_PATH);
  const { isTablet } = useResponsive();
  const data = q.data;

  const keyword = query.trim().toLowerCase();
  const hasMine = !!data?.items.some((i) => i.mentoring.isMine);
  const scoped = (data?.items ?? []).filter(
    (i) =>
      (!mineOnly || i.mentoring.isMine) &&
      (!keyword ||
        i.studentName.toLowerCase().includes(keyword) ||
        i.grade.toLowerCase().includes(keyword) ||
        i.mentoring.mentorName.toLowerCase().includes(keyword)),
  );
  const pending = scoped.filter((i) => i.status === 'PENDING');
  const sent = scoped.filter((i) => i.status === 'SENT');
  const list = tab === 'PENDING' ? pending : sent;

  let body: ReactNode;
  if (!data) {
    body =
      q.error && !q.isLoading ? (
        <ErrorState message={q.error} onRetry={() => void q.retry()} />
      ) : (
        <>
          <StatSkeleton cells={2} />
          <ListSkeleton rows={6} />
        </>
      );
  } else {
    body = (
      <>
        <Section>
          <StatGrid
            surface="plain"
            items={[
              {
                label: '보낼 리포트',
                value: data.summary.pending,
                tone: data.summary.pending > 0 ? 'warning' : 'neutral',
              },
              { label: '보낸 리포트', value: data.summary.sent, tone: 'positive' },
            ]}
          />
        </Section>

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="학생·멘토 이름으로 찾기"
          autoCorrect={false}
          returnKeyType="search"
          prefix={
            <View style={{ justifyContent: 'center' }}>
              <Search color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
            </View>
          }
          accessibilityLabel="학생이나 멘토 이름으로 찾기"
        />
        {hasMine ? (
          <ChipGroup>
            <Chip size="sm" selected={mineOnly} onPress={() => setMineOnly((v) => !v)}>
              내 멘토링만
            </Chip>
          </ChipGroup>
        ) : null}

        <Section flush>
          <SegmentTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'PENDING', label: '보낼 리포트', count: pending.length },
              { value: 'SENT', label: '보낸 리포트', count: sent.length },
            ]}
            style={{ marginHorizontal: space.x2 }}
          />
          {list.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title={
                keyword
                  ? '찾는 학생이 없어요'
                  : tab === 'PENDING'
                    ? '보낼 리포트가 없어요'
                    : '아직 보낸 리포트가 없어요'
              }
              description={
                keyword
                  ? undefined
                  : tab === 'PENDING'
                    ? '멘토링 기록을 마치면 여기에 떠요.'
                    : '리포트를 보내면 링크를 여기서 다시 보낼 수 있어요.'
              }
              style={{ paddingVertical: space.x10 }}
            />
          ) : (
            <View style={{ paddingTop: space.x2 }}>
              {list.map((item) => (
                <ReportRow
                  key={item.studentId}
                  item={item}
                  onSend={() => {
                    setTarget(item);
                    setSheetOpen(true);
                  }}
                  onResend={() => {
                    if (item.report) void shareMessage(item.report.shareText, `${item.studentName} 학부모 리포트`);
                  }}
                />
              ))}
            </View>
          )}
        </Section>
        {data.summary.noMentoring > 0 ? (
          <Text variant="t3-regular" color="neutralSubtle" align="center">
            {`완료한 멘토링이 없는 재원생 ${data.summary.noMentoring}명은 목록에 없어요.`}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="학부모 리포트"
      maxWidth={isTablet ? 720 : undefined}
      backFallback="/(staff)/(tabs)"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}>
      <Stack>{body}</Stack>
      {target ? (
        <ParentReportSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          mentoringId={target.mentoring.id}
          studentName={target.studentName}
          onSent={() => void q.refresh()}
        />
      ) : null}
    </Screen>
  );
}

function ReportRow({
  item,
  onSend,
  onResend,
}: {
  item: StaffParentReportItem;
  onSend: () => void;
  onResend: () => void;
}) {
  const detail = [
    item.grade,
    `${formatDate(item.mentoring.date)} 멘토링`,
    item.mentoring.isMine ? null : item.mentoring.mentorName,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      leading={<Avatar name={item.studentName} size={40} />}
      title={
        <Text variant="t5-medium" numberOfLines={1}>
          {item.studentName}
        </Text>
      }
      description={
        <View style={{ gap: space.x0_5 }}>
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
            {detail}
          </Text>
          {item.report ? (
            <Text variant="t3-regular" color="positive" numberOfLines={1}>
              {`${formatMonthDay(item.report.createdAt)}에 보냄${
                item.report.expiresAt ? ` · ${formatMonthDay(item.report.expiresAt)}까지 열려요` : ''
              }`}
            </Text>
          ) : !item.mentoring.hasNotes ? (
            <Text variant="t3-regular" color="warning" numberOfLines={1}>
              기록 내용이 비어 있어요
            </Text>
          ) : null}
        </View>
      }
      trailing={
        item.status === 'PENDING' ? (
          <Button
            variant="primary"
            size="sm"
            icon={Send}
            onPress={onSend}
            accessibilityLabel={`${item.studentName} 학부모 리포트 보내기`}>
            보내기
          </Button>
        ) : (
          <Button
            variant="weak"
            size="sm"
            onPress={onResend}
            accessibilityLabel={`${item.studentName} 학부모 리포트 다시 보내기`}>
            다시 보내기
          </Button>
        )
      }
    />
  );
}

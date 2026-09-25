import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  ClipboardList,
  Clock,
  Link2,
  MessageSquareText,
  NotebookPen,
  Phone,
  PhoneCall,
  Plus,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  color,
  confirm,
  Divider,
  EmptyState,
  ErrorState,
  IconTile,
  InfoRow,
  ListRow,
  Notice,
  radius,
  Screen,
  Section,
  SectionAction,
  SegmentTabs,
  Skeleton,
  space,
  Stack,
  StatGrid,
  Text,
  toast,
} from '@/design';
import { formatRelativeTime } from '@/lib/format';
import { useMobileQuery } from '@/lib/mobile-api';
import type { MobileOuting } from '@/lib/mobile-api';
import {
  checkCommunication,
  deleteMerit,
  studentProfilePath,
  type CommunicationItem,
  type ExamTypeCode,
  type MeritItem,
  type MeritType,
  type OpsStudentProfile,
} from '@/lib/api/staff-ops';

import { AttendanceActionButtons, OutingSheet, TimesSheet } from './attendance-controls';
import { CommunicationSheet } from './communication-sheet';
import { formatPhone, openContact } from './contact';
import { MeritSheet } from './merit-sheet';
import { QuickActionBar } from './quick-actions';
import { staffOpsRoutes } from './routes';
import { ATTENDANCE_TYPE_TONE, formatShortDateKey, STATUS_LABEL, STATUS_TONE, weekdayLabel } from './status';

export type ProfileTab = 'info' | 'attendance' | 'merits' | 'tasks' | 'scores' | 'requests';

const TAB_VALUES: ProfileTab[] = ['info', 'attendance', 'merits', 'tasks', 'scores', 'requests'];

export function isProfileTab(v: unknown): v is ProfileTab {
  return typeof v === 'string' && (TAB_VALUES as string[]).includes(v);
}

export function useStudentProfile(id: string) {
  return useMobileQuery<OpsStudentProfile>(studentProfilePath(id));
}

type ProfileQuery = ReturnType<typeof useStudentProfile>;

const EXAM_TYPE_LABEL: Record<ExamTypeCode, string> = {
  OFFICIAL_MOCK: '모의(공식)',
  PRIVATE_MOCK: '모의(사설)',
  SCHOOL_EXAM: '내신',
  DUFF: '더프',
};

const OUTING_TONE = { 외출중: 'warn', 복귀: 'ok', 예정: 'gray' } as const;

/**
 * 학생 프로필 본문 — 라우트(/(staff)/students/[id])와 입퇴실 태블릿 오른쪽 패널이 같이 쓴다.
 * 스크롤·당겨서 새로고침은 감싸는 Screen 이 맡는다.
 */
export function StudentProfileBody({
  query,
  initialTab = 'info',
  onChanged,
}: {
  query: ProfileQuery;
  initialTab?: ProfileTab;
  /** 출결·상벌점 등 바뀐 뒤 (목록 새로고침용) */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { data, error, isLoading, retry } = query;
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [sheet, setSheet] = useState<
    | { kind: 'merit'; type: MeritType }
    | { kind: 'times' }
    | { kind: 'outing'; outing: MobileOuting | null }
    | { kind: 'request' }
    | null
  >(null);
  const [undoable, setUndoable] = useState<string[]>([]);

  const changed = () => {
    void retry();
    onChanged?.();
  };

  if (isLoading && !data) return <ProfileSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void retry()} />;
  if (!data) return null;

  const { info, today } = data;
  const student = { id: info.id, name: info.name, seat: info.seat };
  const openTasks = data.assignments.filter((a) => !a.isCompleted).length;

  return (
    <Stack>
      {/* 헤더 */}
      <Section>
        <View style={s.headRow}>
          <Avatar name={info.name} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
            <View style={s.nameRow}>
              <Text variant="t8-bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {info.name}
              </Text>
              {today && (
                <Badge tone={STATUS_TONE[today.status]} size="md">
                  {STATUS_LABEL[today.status]}
                </Badge>
              )}
            </View>
            <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2}>
              {[info.grade, info.school, info.seat ? `좌석 ${info.seat}` : null].filter(Boolean).join(' · ')}
            </Text>
            {info.mentorName && (
              <Text variant="t3-regular" color="neutralSubtle">
                담당 멘토 {info.mentorName}
              </Text>
            )}
          </View>
        </View>
        <View style={{ marginTop: space.x4 }}>
          <QuickActionBar
            actions={[
              {
                key: 'parent-call',
                icon: Phone,
                label: '학부모 전화',
                tone: 'ok',
                disabled: !info.parentPhone,
                onPress: () => void openContact('tel', info.parentPhone),
              },
              {
                key: 'parent-sms',
                icon: MessageSquareText,
                label: '문자',
                tone: 'info',
                disabled: !info.parentPhone,
                accessibilityLabel: '학부모에게 문자',
                onPress: () => void openContact('sms', info.parentPhone),
              },
              {
                key: 'student-call',
                icon: PhoneCall,
                label: '학생 전화',
                disabled: !info.phone,
                onPress: () => void openContact('tel', info.phone),
              },
              {
                key: 'merit',
                icon: Award,
                label: '상벌점',
                tone: 'brand',
                onPress: () => setSheet({ kind: 'merit', type: 'MERIT' }),
              },
              {
                key: 'portal',
                icon: Link2,
                label: '포털 링크',
                tone: 'violet',
                accessibilityLabel: '포털 링크 보내기',
                onPress: () => router.push(staffOpsRoutes.portalLink(info.id)),
              },
            ]}
          />
        </View>
      </Section>

      {data.attention && (
        <Notice
          tone="warn"
          icon={AlertTriangle}
          title={data.attention.manual ? '유의 관찰 (지정)' : '유의 관찰'}>
          {data.attention.reasons.join(' · ')}
        </Notice>
      )}
      {today?.dailyNote && (
        <Notice tone="info" title="오늘 변동">
          {today.dailyNote}
        </Notice>
      )}

      {/* 오늘 출결 */}
      {today && (
        <Section
          title="오늘 출결"
          action={<SectionAction onPress={() => setSheet({ kind: 'times' })}>직접 수정</SectionAction>}>
          <Stack gap={space.x3}>
            <StatGrid
              items={[
                {
                  label: '예정',
                  value: today.scheduleStart ?? '—',
                  sub: today.scheduleEnd
                    ? `~ ${today.scheduleEnd}`
                    : today.scheduleStart
                      ? undefined
                      : '예정 없음',
                },
                {
                  label: '입실',
                  value: today.checkIn ?? '—',
                  tone: today.attendanceType === 'TARDY' ? 'warning' : 'neutral',
                  sub: today.attendanceType === 'TARDY' ? '지각' : undefined,
                },
                { label: '퇴실', value: today.checkOut ?? '—' },
              ]}
            />
            {today.isLate && (
              <Notice tone="bad" icon={Clock} title="지각">
                {`예정 입실 ${today.scheduleStart ?? ''}에서 30분 넘게 지났어요`}
              </Notice>
            )}
            {today.note && (
              <Notice tone="gray" title="비고">
                {today.note}
              </Notice>
            )}
            {today.outings.length > 0 && (
              <View style={s.bleedCard}>
                {today.outings.map((o, i) => (
                  <ListRow
                    key={o.id ?? `plan-${i}`}
                    onPress={() => setSheet({ kind: 'outing', outing: o })}
                    leading={
                      <Badge tone={OUTING_TONE[o.status]} size="md">
                        {o.planned && !o.id ? '정기' : o.status}
                      </Badge>
                    }
                    title={
                      <Text variant="t5-medium" tabular>
                        {`${o.start ?? '—'}${o.end ? ` ~ ${o.end}` : ' ~'}`}
                      </Text>
                    }
                    description={o.reason ?? (o.planned ? '정기 외출 예정' : undefined)}
                  />
                ))}
              </View>
            )}
            <AttendanceActionButtons item={today} onChanged={changed} size="md" />
            {today.status !== '미입실' && today.status !== '결석' && (
              <Button
                variant="weak"
                size="md"
                icon={Plus}
                block
                onPress={() => setSheet({ kind: 'outing', outing: null })}>
                외출 추가
              </Button>
            )}
          </Stack>
        </Section>
      )}

      <View style={s.tabsStrip}>
        <SegmentTabs
          tabs={[
            { value: 'info', label: '정보' },
            { value: 'attendance', label: '출결' },
            { value: 'merits', label: '상벌점' },
            { value: 'tasks', label: '과제', count: openTasks },
            { value: 'scores', label: '성적' },
            { value: 'requests', label: '요청', count: data.communications.unchecked },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'info' && <InfoTab data={data} />}
      {tab === 'attendance' && <AttendanceTab data={data} />}
      {tab === 'merits' && (
        <MeritsTab
          data={data}
          undoable={undoable}
          onGive={(type) => setSheet({ kind: 'merit', type })}
          onDeleted={(id) => {
            setUndoable((u) => u.filter((x) => x !== id));
            changed();
          }}
        />
      )}
      {tab === 'tasks' && <TasksTab items={data.assignments} today={data.attendance14.days[0]?.date ?? ''} />}
      {tab === 'scores' && <ScoresTab items={data.scores} />}
      {tab === 'requests' && (
        <RequestsTab
          studentId={info.id}
          items={data.communications.items}
          onAdd={() => setSheet({ kind: 'request' })}
          onChanged={changed}
        />
      )}

      <MeritSheet
        student={student}
        open={sheet?.kind === 'merit'}
        initialType={sheet?.kind === 'merit' ? sheet.type : 'MERIT'}
        onClose={() => setSheet(null)}
        onSaved={(item) => {
          setUndoable((u) => [item.id, ...u]);
          setTab('merits');
          changed();
        }}
      />
      <TimesSheet
        item={today}
        open={sheet?.kind === 'times'}
        onClose={() => setSheet(null)}
        onSaved={changed}
      />
      <OutingSheet
        item={today}
        outing={sheet?.kind === 'outing' ? sheet.outing : null}
        open={sheet?.kind === 'outing'}
        onClose={() => setSheet(null)}
        onSaved={changed}
      />
      <CommunicationSheet
        student={student}
        open={sheet?.kind === 'request'}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setTab('requests');
          changed();
        }}
      />
    </Stack>
  );
}

/** 태블릿 오른쪽 패널 — 닫기(X) 헤더 + 프로필 본문. 학생이 바뀌면 key={id} 로 새로 마운트할 것 */
export function StudentProfilePanel({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const query = useStudentProfile(id);
  return (
    <Screen
      kind="modal"
      title={query.data?.info.name ?? '학생'}
      onBack={onClose}
      maxWidth={720}
      refreshing={query.isRefreshing}
      onRefresh={() => void query.refresh()}>
      <StudentProfileBody query={query} onChanged={onChanged} />
    </Screen>
  );
}

// ─── 탭: 정보 ────────────────────────────────────────────────────────

function InfoTab({ data }: { data: OpsStudentProfile }) {
  const { info } = data;
  const admission: [string, string | null][] = [
    ['희망 대학', info.targetUniversity],
    ['입시 전형', info.admissionType],
    ['내신 성적대', info.internalScoreRange],
    ['모의 성적대', info.mockScoreRange],
    ['선택과목', info.selectedSubjects],
    ['수강 인강', info.onlineLectures],
  ];
  const notes: [string, string | null][] = [
    ['멘토링 주의사항', info.mentoringNotes],
    ['학생 메모', info.studentInfo],
    ['변동 예정', info.changeNote],
  ];
  const hasAdmission = admission.some(([, v]) => !!v);
  const filledNotes = notes.filter(([, v]) => !!v?.trim());

  return (
    <Stack>
      <Section title="기본 정보">
        <InfoRow label="학교">{info.school || '—'}</InfoRow>
        <InfoRow label="학년">{info.grade || '—'}</InfoRow>
        <InfoRow label="반">{info.classGroup || '—'}</InfoRow>
        <InfoRow label="좌석">{info.seat ? `${info.seat}번` : '—'}</InfoRow>
        <InfoRow label="등록일">{info.startDate ?? '—'}</InfoRow>
      </Section>

      <Section title="연락처" flush>
        <ContactRow label="학부모" phone={info.parentPhone} />
        <ContactRow label="학생" phone={info.phone} />
        {info.parentEmail && <ListRow title="학부모 이메일" trailing={info.parentEmail} />}
      </Section>

      {hasAdmission && (
        <Section title="입시">
          {admission.map(([k, v]) => (
            <InfoRow key={k} label={k}>
              {v || '—'}
            </InfoRow>
          ))}
        </Section>
      )}

      {filledNotes.length > 0 && (
        <Section title="메모">
          <Stack gap={space.x4}>
            {filledNotes.map(([k, v]) => (
              <View key={k} style={{ gap: space.x1 }}>
                <Text variant="t4-bold" color="neutralMuted">
                  {k}
                </Text>
                <Text variant="t5-regular">{v}</Text>
              </View>
            ))}
          </Stack>
        </Section>
      )}

      <Section title="최근 멘토링" flush>
        {data.mentorings.length === 0 ? (
          <EmptyState icon={NotebookPen} title="멘토링 기록이 없어요" style={{ paddingVertical: space.x8 }} />
        ) : (
          data.mentorings.map((m) => (
            <ListRow
              key={m.id}
              align="start"
              meta={
                <Badge tone={m.status === 'COMPLETED' ? 'ok' : m.status === 'CANCELLED' ? 'gray' : 'info'}>
                  {m.statusLabel}
                </Badge>
              }
              title={`${formatMonthDay(m.scheduledAt)} · ${m.mentorName}`}
              description={
                m.summary ? (
                  <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2}>
                    {m.summary}
                  </Text>
                ) : undefined
              }
            />
          ))
        )}
      </Section>
    </Stack>
  );
}

function ContactRow({ label, phone }: { label: string; phone: string | null }) {
  if (!phone) {
    return <ListRow title={label} trailing="등록된 번호 없음" muted />;
  }
  return (
    <ListRow
      title={label}
      description={
        <Text variant="t4-regular" color="neutralSubtle" tabular>
          {formatPhone(phone)}
        </Text>
      }
      chevron={false}
      trailing={
        <View style={{ flexDirection: 'row', gap: space.x2 }}>
          <Button
            variant="weak"
            size="sm"
            icon={MessageSquareText}
            accessibilityLabel={`${label}에게 문자`}
            onPress={() => void openContact('sms', phone)}
          />
          <Button
            variant="weak"
            size="sm"
            icon={Phone}
            accessibilityLabel={`${label}에게 전화`}
            onPress={() => void openContact('tel', phone)}
          />
        </View>
      }
    />
  );
}

// ─── 탭: 출결 14일 ───────────────────────────────────────────────────

function AttendanceTab({ data }: { data: OpsStudentProfile }) {
  const { days, summary } = data.attendance14;
  return (
    <Stack>
      <Section title="최근 14일">
        <StatGrid
          items={[
            { label: '정상', value: summary.normal, tone: 'positive' },
            { label: '지각', value: summary.tardy, tone: summary.tardy ? 'warning' : 'neutral' },
            { label: '결석', value: summary.absent, tone: summary.absent ? 'critical' : 'neutral' },
            { label: '공결', value: summary.excused },
          ]}
        />
      </Section>
      <Section flush>
        {days.map((d, i) => (
          <View key={d.date}>
            {i > 0 && <Divider inset={space.x5} />}
            <ListRow
              leading={
                <View style={s.dateBox}>
                  <Text variant="t4-bold" tabular color={d.isToday ? 'brand' : 'neutral'}>
                    {formatShortDateKey(d.date)}
                  </Text>
                  <Text
                    variant="t2-regular"
                    color={d.weekday === 0 ? 'critical' : d.weekday === 6 ? 'informative' : 'neutralSubtle'}>
                    {d.isToday ? '오늘' : weekdayLabel(d.weekday)}
                  </Text>
                </View>
              }
              title={
                d.record ? (
                  <Text variant="t5-medium" tabular>
                    {d.record.checkIn || d.record.checkOut
                      ? `${d.record.checkIn ?? '—'} – ${d.record.checkOut ?? '—'}`
                      : d.record.typeLabel}
                  </Text>
                ) : (
                  <Text variant="t5-regular" color="neutralSubtle">
                    {d.scheduled ? '기록 없음' : '등원일 아님'}
                  </Text>
                )
              }
              description={
                d.record?.notes ? (
                  <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2}>
                    {d.record.notes}
                  </Text>
                ) : d.scheduled && d.scheduleStart ? (
                  <Text variant="t4-regular" color="neutralSubtle" tabular>
                    {`예정 ${d.scheduleStart}${d.scheduleEnd ? `–${d.scheduleEnd}` : ''}`}
                  </Text>
                ) : undefined
              }
              trailing={
                d.record ? (
                  <Badge tone={ATTENDANCE_TYPE_TONE[d.record.type]} size="md">
                    {d.record.typeLabel}
                  </Badge>
                ) : undefined
              }
            />
          </View>
        ))}
      </Section>
    </Stack>
  );
}

// ─── 탭: 상벌점 ──────────────────────────────────────────────────────

function MeritsTab({
  data,
  undoable,
  onGive,
  onDeleted,
}: {
  data: OpsStudentProfile;
  undoable: string[];
  onGive: (type: MeritType) => void;
  onDeleted: (id: string) => void;
}) {
  const { month, total, recent } = data.merits;
  const [busy, setBusy] = useState<string | null>(null);
  const net = month.merit - month.demerit;

  const remove = async (m: MeritItem, isUndo: boolean) => {
    if (busy) return;
    if (!isUndo) {
      const ok = await confirm({
        title: '이 기록을 지울까요?',
        message: `${m.type === 'MERIT' ? '상점' : '벌점'} ${m.points}점 · ${m.reason}`,
        confirmText: '삭제',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(m.id);
    try {
      await deleteMerit(m.id);
      toast(isUndo ? '되돌렸어요' : '기록을 지웠어요', 'success');
      onDeleted(m.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제하지 못했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack>
      <Section title="이번 달" description={`누적 상점 ${total.merit}점 · 벌점 ${total.demerit}점`}>
        <Stack gap={space.x4}>
          <StatGrid
            items={[
              { label: '상점', value: `+${month.merit}`, tone: 'positive' },
              { label: '벌점', value: `−${month.demerit}`, tone: month.demerit ? 'critical' : 'neutral' },
              {
                label: '순점수',
                value: net > 0 ? `+${net}` : net < 0 ? `−${Math.abs(net)}` : '0',
                tone: net > 0 ? 'positive' : net < 0 ? 'critical' : 'neutral',
              },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: space.x2 }}>
            <View style={{ flex: 1 }}>
              <Button variant="weak" size="md" block icon={ThumbsUp} onPress={() => onGive('MERIT')}>
                상점 주기
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="weak" size="md" block icon={ThumbsDown} onPress={() => onGive('DEMERIT')}>
                벌점 주기
              </Button>
            </View>
          </View>
        </Stack>
      </Section>

      <Section title="기록" description={recent.length ? '기록을 누르면 지울 수 있어요' : undefined} flush>
        {recent.length === 0 ? (
          <EmptyState icon={Award} title="상벌점 기록이 없어요" style={{ paddingVertical: space.x8 }} />
        ) : (
          recent.map((m) => {
            const isNew = undoable.includes(m.id);
            return (
              <ListRow
                key={m.id}
                onPress={() => void remove(m, false)}
                chevron={false}
                leading={
                  <IconTile
                    icon={m.type === 'MERIT' ? ThumbsUp : ThumbsDown}
                    tone={m.type === 'MERIT' ? 'ok' : 'bad'}
                    size={40}
                    round
                  />
                }
                title={
                  <Text variant="t5-medium" numberOfLines={2}>
                    {m.reason}
                  </Text>
                }
                description={[
                  formatShortDateKey(m.date),
                  m.category,
                  m.createdByName,
                  m.visibleInReport ? null : '리포트 숨김',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  isNew ? (
                    <Button
                      variant="weak"
                      size="xs"
                      loading={busy === m.id}
                      onPress={() => void remove(m, true)}>
                      되돌리기
                    </Button>
                  ) : (
                    <Text variant="t5-bold" tabular color={m.type === 'MERIT' ? 'positive' : 'critical'}>
                      {m.type === 'MERIT' ? `+${m.points}` : `−${m.points}`}
                    </Text>
                  )
                }
              />
            );
          })
        )}
      </Section>
    </Stack>
  );
}

// ─── 탭: 과제 · 성적 ─────────────────────────────────────────────────

function TasksTab({ items, today }: { items: OpsStudentProfile['assignments']; today: string }) {
  if (items.length === 0) {
    return (
      <Section>
        <EmptyState icon={ClipboardList} title="등록된 과제가 없어요" />
      </Section>
    );
  }
  return (
    <Section flush>
      {items.map((a) => {
        const overdue = !a.isCompleted && !!a.dueDate && a.dueDate < today;
        return (
          <ListRow
            key={a.id}
            align="start"
            meta={
              <Badge tone={a.isCompleted ? 'ok' : overdue ? 'bad' : 'warn'}>
                {a.isCompleted ? '완료' : overdue ? '기한 지남' : '진행'}
              </Badge>
            }
            title={a.title}
            description={
              [a.subject, a.dueDate ? `~${formatShortDateKey(a.dueDate)}` : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        );
      })}
    </Section>
  );
}

function ScoresTab({ items }: { items: OpsStudentProfile['scores'] }) {
  if (items.length === 0) {
    return (
      <Section>
        <EmptyState icon={TrendingUp} title="등록된 성적이 없어요" />
      </Section>
    );
  }
  return (
    <Section flush>
      {items.map((sc) => (
        <ListRow
          key={sc.id}
          title={`${sc.subject} · ${sc.examName}`}
          description={[EXAM_TYPE_LABEL[sc.examType] ?? sc.examType, sc.examDate].filter(Boolean).join(' · ')}
          trailing={
            <View style={{ alignItems: 'flex-end' }}>
              {sc.grade != null && (
                <Text variant="t5-bold" tabular>
                  {sc.grade}등급
                </Text>
              )}
              <Text variant="t3-regular" color="neutralSubtle" tabular>
                {[
                  sc.rawScore != null ? `${sc.rawScore}점` : null,
                  sc.percentile != null ? `${sc.percentile}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </Text>
            </View>
          }
        />
      ))}
    </Section>
  );
}

// ─── 탭: 요청 (학부모 요청 · 운영진 전달) ─────────────────────────────

function RequestsTab({
  studentId,
  items,
  onAdd,
  onChanged,
}: {
  studentId: string;
  items: CommunicationItem[];
  onAdd: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllChecked, setShowAllChecked] = useState(false);
  const open = items.filter((c) => !c.isChecked);
  const checked = items.filter((c) => c.isChecked);
  const visibleChecked = showAllChecked ? checked : checked.slice(0, 5);

  const check = async (c: CommunicationItem) => {
    if (busy) return;
    setBusy(c.id);
    try {
      await checkCommunication(studentId, c.id);
      toast('확인했어요', 'success');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '처리하지 못했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack>
      <Section
        title="확인할 요청"
        description="학부모 요청과 운영진 전달사항이에요"
        action={<SectionAction onPress={onAdd}>남기기</SectionAction>}
        flush>
        {open.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            tone="ok"
            title="확인할 요청이 없어요"
            style={{ paddingVertical: space.x8 }}
            action={
              <Button variant="weak" size="sm" icon={Plus} onPress={onAdd}>
                요청·전달사항 남기기
              </Button>
            }
          />
        ) : (
          open.map((c) => (
            <CommunicationRow key={c.id} item={c}>
              <Button variant="weak" size="xs" loading={busy === c.id} onPress={() => void check(c)}>
                확인
              </Button>
            </CommunicationRow>
          ))
        )}
      </Section>

      {checked.length > 0 && (
        <Section title="확인한 요청" flush>
          {visibleChecked.map((c) => (
            <CommunicationRow key={c.id} item={c} muted />
          ))}
          {checked.length > visibleChecked.length && (
            <View style={{ paddingHorizontal: space.x5, paddingTop: space.x1 }}>
              <Button variant="ghost" size="sm" block onPress={() => setShowAllChecked(true)}>
                {`${checked.length - visibleChecked.length}건 더 보기`}
              </Button>
            </View>
          )}
        </Section>
      )}
    </Stack>
  );
}

function CommunicationRow({
  item,
  muted = false,
  children,
}: {
  item: CommunicationItem;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <ListRow
      align="start"
      meta={
        <Badge tone={muted ? 'gray' : item.type === 'PARENT_REQUEST' ? 'brand' : 'info'}>
          {item.typeLabel}
        </Badge>
      }
      title={
        <Text variant="t5-regular" color={muted ? 'neutralSubtle' : 'neutral'}>
          {item.content}
        </Text>
      }
      description={[
        item.createdByName,
        formatRelativeTime(item.createdAt),
        item.isChecked && item.checkedAt ? `확인 ${formatMonthDay(item.checkedAt)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      trailing={children}
    />
  );
}

// ─── 기타 ────────────────────────────────────────────────────────────

function formatMonthDay(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

function ProfileSkeleton() {
  return (
    <Stack>
      <View style={s.skelCard}>
        <View style={{ flexDirection: 'row', gap: space.x4, alignItems: 'center' }}>
          <Skeleton style={{ width: 56, height: 56, borderRadius: 28 }} />
          <View style={{ flex: 1, gap: space.x2 }}>
            <Skeleton style={{ width: '45%', height: 24 }} />
            <Skeleton style={{ width: '70%', height: 16 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.x2, marginTop: space.x5 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: space.x1_5 }}>
              <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
              <Skeleton style={{ width: 40, height: 12 }} />
            </View>
          ))}
        </View>
      </View>
      <View style={s.skelCard}>
        <Skeleton style={{ width: 90, height: 20 }} />
        <Skeleton style={{ height: 72, marginTop: space.x4, borderRadius: radius.r4 }} />
        <View style={{ flexDirection: 'row', gap: space.x2, marginTop: space.x3 }}>
          <Skeleton style={{ flex: 1, height: 40 }} />
          <Skeleton style={{ flex: 1, height: 40 }} />
        </View>
      </View>
      <View style={s.skelCard}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 18, marginTop: i ? space.x4 : 0, width: `${80 - i * 10}%` }} />
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.x4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  tabsStrip: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    paddingHorizontal: space.x2,
    paddingTop: space.x1,
  },
  bleedCard: { marginHorizontal: -space.x5 },
  dateBox: { width: 44, alignItems: 'center' },
  skelCard: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
});

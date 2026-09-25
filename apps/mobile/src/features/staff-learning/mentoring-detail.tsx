import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Flag,
  Send,
  TriangleAlert,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AttachmentPicker } from '@/components/attachment-picker';
import {
  Avatar,
  Badge,
  Button,
  color,
  ErrorState,
  ImageViewer,
  InfoRow,
  Notice,
  Press,
  radius,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import {
  mentoringDetailPath,
  saveMentoringRecord,
  type MentoringDetailResponse,
  type MentoringRecordInput,
} from '@/lib/api/staff-learning';
import { refreshBadges } from '@/lib/badges';
import { uploadMobileMedia, useMobileQuery } from '@/lib/mobile-api';

import { DetailFrame } from './detail-frame';
import { formatDate, formatDateKeyLong } from './format';
import { ParentReportSheet, useSendParentReport } from './parent-report-sheet';
import { DetailSkeleton } from './skeletons';
import { MENTORING_STATE } from './status';

const FIELDS: {
  key: keyof MentoringRecordInput;
  label: string;
  placeholder: string;
  maxLength: number;
  minHeight: number;
  required?: boolean;
  description?: string;
}[] = [
  {
    key: 'content',
    label: '오늘 멘토링 내용',
    placeholder: '오늘 멘토링에서 다룬 내용을 적어 주세요',
    maxLength: 8000,
    minHeight: 140,
    required: true,
  },
  { key: 'improvements', label: '개선된 점', placeholder: '지난번보다 나아진 점', maxLength: 4000, minHeight: 96 },
  { key: 'weaknesses', label: '보완할 점', placeholder: '앞으로 보완이 필요한 부분', maxLength: 4000, minHeight: 96 },
  {
    key: 'nextGoals',
    label: '다음 멘토링 목표',
    placeholder: '다음 멘토링까지 이룰 목표',
    maxLength: 4000,
    minHeight: 96,
  },
  {
    key: 'notes',
    label: '기타 메모',
    placeholder: '운영진·학부모님께 전할 메모',
    maxLength: 4000,
    minHeight: 96,
    description: '학부모 리포트에 따로 적지 않으면 이 메모가 들어가요.',
  },
];

/** 멘토링 상세 + 기록 작성. 라우트 화면과 태블릿 오른쪽 패널(inline)이 같이 쓴다. */
export function MentoringDetailView({
  id,
  inline = false,
  onClose,
  onChanged,
}: {
  id: string;
  inline?: boolean;
  onClose?: () => void;
  /** 저장·리포트 발송 뒤 목록 갱신 */
  onChanged?: () => void;
}) {
  const q = useMobileQuery<MentoringDetailResponse>(mentoringDetailPath(id));
  const data = q.data && q.data.id === id ? q.data : null;

  if (!data) {
    return (
      <DetailFrame inline={inline} title="멘토링" onClose={onClose}>
        {q.error && !q.isLoading ? (
          <ErrorState message={q.error} onRetry={() => void q.retry()} />
        ) : (
          <DetailSkeleton />
        )}
      </DetailFrame>
    );
  }

  return (
    <MentoringDetailBody
      key={data.id}
      data={data}
      inline={inline}
      onClose={onClose}
      refreshing={q.isRefreshing}
      onRefresh={async () => {
        await q.refresh();
      }}
      onChanged={onChanged}
    />
  );
}

function MentoringDetailBody({
  data,
  inline,
  onClose,
  refreshing,
  onRefresh,
  onChanged,
}: {
  data: MentoringDetailResponse;
  inline: boolean;
  onClose?: () => void;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onChanged?: () => void;
}) {
  const editable = !data.cancelled && data.state === 'NEEDS_RECORD';
  const [form, setForm] = useState<MentoringRecordInput>({
    content: data.content ?? '',
    improvements: data.improvements ?? '',
    weaknesses: data.weaknesses ?? '',
    nextGoals: data.nextGoals ?? '',
    notes: data.notes ?? '',
  });
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const savingRef = useRef(false);

  const report = useSendParentReport(() => {
    void onRefresh();
    onChanged?.();
  });

  const state = MENTORING_STATE[data.state];
  const studentMeta = [data.student.grade, data.student.school].filter(Boolean).join(' · ');
  const timeRange = data.timeLabel
    ? `${data.timeLabel}${data.endTimeLabel ? `–${data.endTimeLabel}` : ''}`
    : '시간 미정';

  async function save() {
    if (savingRef.current) return;
    if (!form.content.trim()) {
      setContentError('오늘 멘토링 내용을 적어 주세요');
      return;
    }
    setContentError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      // 한 장씩 올리고 성공한 사진은 목록에서 빼서, 실패 후 다시 저장해도 중복 업로드되지 않게
      for (const asset of assets) {
        await uploadMobileMedia(asset, { context: 'mentoring', mentoringId: data.id, tag: 'FREE' });
        setAssets((prev) => prev.filter((a) => a !== asset));
      }
      await saveMentoringRecord(data.id, form);
      toast('멘토링 기록을 저장했어요', 'success');
      refreshBadges();
      onChanged?.();
      await onRefresh();
      setReportOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : '기록을 저장하지 못했어요', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const reportActive = !!data.parentReport?.active;
  const footer = editable ? (
    <Button variant="primary" size="lg" block loading={saving} onPress={() => void save()}>
      기록 저장
    </Button>
  ) : data.state === 'COMPLETED' && !data.cancelled ? (
    <Button
      variant={reportActive ? 'weak' : 'primary'}
      size="lg"
      block
      icon={Send}
      loading={report.busy}
      onPress={() => {
        if (reportActive) {
          void report.send({ mentoringId: data.id, studentName: data.student.name });
        } else {
          setReportOpen(true);
        }
      }}>
      {reportActive ? '리포트 다시 보내기' : '학부모 리포트 보내기'}
    </Button>
  ) : undefined;

  return (
    <DetailFrame
      inline={inline}
      title={data.student.name}
      onClose={onClose}
      footer={footer}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}>
      <Stack gap={space.x5}>
        {/* 학생 머리 */}
        <View style={s.head}>
          <Avatar name={data.student.name} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t7-bold" numberOfLines={1}>
              {data.student.name}
            </Text>
            {studentMeta ? (
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                {studentMeta}
              </Text>
            ) : null}
          </View>
          {data.cancelled ? (
            <Badge tone="gray" size="md">
              취소됨
            </Badge>
          ) : (
            <Badge tone={state.tone} size="md">
              {state.label}
            </Badge>
          )}
        </View>

        <View style={s.infoBox}>
          <InfoRow label="일시">
            <Text variant="t5-medium" align="right" tabular>
              {`${formatDateKeyLong(data.dateKey)} · ${timeRange}`}
            </Text>
          </InfoRow>
          <InfoRow label="담당">{`${data.mentorName} 멘토${data.isMine ? ' (나)' : ''}`}</InfoRow>
          {data.state === 'COMPLETED' && data.actualDate ? (
            <InfoRow label="진행">
              <Text variant="t5-medium" align="right" tabular>
                {`${formatDate(data.actualDate)}${
                  data.actualStartTime
                    ? ` · ${data.actualStartTime}${data.actualEndTime ? `–${data.actualEndTime}` : ''}`
                    : ''
                }`}
              </Text>
            </InfoRow>
          ) : null}
        </View>

        {data.cancelled ? (
          <Notice tone="bad" icon={CircleAlert}>
            취소된 멘토링이라 기록할 수 없어요.
          </Notice>
        ) : data.state === 'SCHEDULED' ? (
          <Notice tone="info" icon={CalendarClock}>
            예정 시간이 지나면 기록을 쓸 수 있어요.
          </Notice>
        ) : null}

        {data.student.mentoringNotes ? (
          <Notice tone="warn" icon={TriangleAlert} title="멘토링 주의사항">
            {data.student.mentoringNotes}
          </Notice>
        ) : null}

        {data.previous?.nextGoals && data.state !== 'COMPLETED' ? (
          <Notice tone="gray" icon={Flag} title={`지난 목표 · ${formatDate(data.previous.date)}`}>
            {data.previous.nextGoals}
          </Notice>
        ) : null}

        {editable ? (
          <>
            <Notice tone="info">작성한 내용은 학부모 리포트에 그대로 보여요.</Notice>
            {FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                indicator={f.required ? undefined : '선택'}
                value={form[f.key]}
                onChangeText={(v) => {
                  setForm((prev) => ({ ...prev, [f.key]: v }));
                  if (f.key === 'content' && contentError && v.trim()) setContentError(null);
                }}
                placeholder={f.placeholder}
                multiline
                minHeight={f.minHeight}
                maxLength={f.maxLength}
                description={f.description}
                errorMessage={f.key === 'content' ? contentError : null}
                editable={!saving}
              />
            ))}
          </>
        ) : data.state === 'COMPLETED' ? (
          <RecordView data={data} />
        ) : null}

        {data.photos.length > 0 || editable ? (
          <View style={{ gap: space.x3 }}>
            {data.photos.length > 0 ? (
              <>
                <Text variant="t5-medium">
                  첨부한 사진{' '}
                  <Text variant="t5-medium" color="neutralSubtle" tabular>
                    {data.photos.length}
                  </Text>
                </Text>
                <View style={s.photos}>
                  {data.photos.map((p, i) => (
                    <Press
                      key={p.id}
                      onPress={() => setPhotoIndex(i)}
                      accessibilityLabel={`${p.name} 크게 보기`}
                      style={s.photo}>
                      <Image
                        source={{ uri: p.thumbnailUrl ?? p.url }}
                        contentFit="cover"
                        style={StyleSheet.absoluteFill}
                      />
                    </Press>
                  ))}
                </View>
              </>
            ) : null}
            {editable ? (
              <AttachmentPicker assets={assets} onChange={setAssets} max={5} />
            ) : null}
          </View>
        ) : null}

        {data.state === 'COMPLETED' && !data.cancelled ? (
          reportActive && data.parentReport ? (
            <Notice tone="ok" icon={CircleCheck}>
              {`${formatDate(data.parentReport.createdAt)}에 학부모 리포트를 만들었어요.`}
            </Notice>
          ) : (
            <Notice tone="warn" icon={Send}>
              아직 학부모님께 리포트를 보내지 않았어요.
            </Notice>
          )
        ) : null}
      </Stack>

      <ImageViewer
        images={data.photos.map((p) => p.url)}
        index={photoIndex}
        onIndexChange={setPhotoIndex}
        onClose={() => setPhotoIndex(null)}
      />
      <ParentReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        mentoringId={data.id}
        studentName={data.student.name}
        onSent={() => {
          void onRefresh();
          onChanged?.();
        }}
      />
    </DetailFrame>
  );
}

function RecordView({ data }: { data: MentoringDetailResponse }) {
  const rows = FIELDS.map((f) => ({ label: f.label, value: (data[f.key] ?? '').trim() })).filter(
    (r) => r.value,
  );
  if (rows.length === 0) {
    return (
      <Text variant="t5-regular" color="neutralSubtle">
        기록된 내용이 없어요.
      </Text>
    );
  }
  return (
    <View style={{ gap: space.x5 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: space.x2 }}>
          <Text variant="t4-bold" color="neutralMuted">
            {r.label}
          </Text>
          <Text variant="t5-regular" selectable>
            {r.value}
          </Text>
        </View>
      ))}
      <Text variant="t3-regular" color="neutralSubtle">
        완료된 기록은 웹에서 고칠 수 있어요.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  infoBox: {
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r4,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 },
  photo: {
    width: 76,
    height: 76,
    borderRadius: radius.r3,
    overflow: 'hidden',
    backgroundColor: color.bg.neutralWeak,
  },
});

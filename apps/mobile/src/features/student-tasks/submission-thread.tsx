import { Download, FileText, ImageIcon, MessageSquare } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, color, IconTile, Press, radius, Section, space, Stack, Text } from '@/design';
import { openTaskFile } from '@/components/task-file-picker';
import type { MobileTaskFile, MobileTaskSubmission } from '@/lib/api/student-learning';

import { FEEDBACK_STATUS, formatDateTimeKST, formatFileSize, isImageMime } from './status';

/**
 * 제출 기록 — 웹 포털 TaskSubmissionsThread(variant="portal")와 같은 구성.
 * 버전별 흰 카드: "v2 제출 · 최신" / 제출 시각 / 피드백 수 → 첨부 파일 → 내가 남긴 말 → 받은 피드백.
 */
export function SubmissionThread({ submissions }: { submissions: MobileTaskSubmission[] }) {
  const latestVersion = submissions[0]?.version ?? 1;
  return (
    <Stack>
      {submissions.map((sub) => {
        const isLatest = sub.version === latestVersion;
        return (
          <Section
            key={sub.id}
            flush
            title={
              <View style={s.titleRow}>
                <Text variant="t6-bold" tabular>
                  v{sub.version} 제출
                </Text>
                {isLatest && (
                  <Badge tone="brand" style={{ alignSelf: 'center' }}>
                    최신
                  </Badge>
                )}
              </View>
            }
            description={
              <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
                {formatDateTimeKST(sub.submittedAt)}
              </Text>
            }
            action={
              sub.feedbacks.length > 0 ? (
                <View
                  style={s.feedbackCount}
                  accessible
                  accessibilityLabel={`피드백 ${sub.feedbacks.length}개`}>
                  <MessageSquare color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
                  <Text variant="t3-medium" color="neutralSubtle" tabular>
                    {sub.feedbacks.length}
                  </Text>
                </View>
              ) : undefined
            }>
            {/* 첨부 파일 */}
            <Text variant="t4-bold" color="neutralMuted" style={s.label}>
              첨부 파일 <Text variant="t4-bold" color="neutralMuted" tabular>{sub.files.length}</Text>
            </Text>
            {sub.files.map((file, i) => (
              <FileRow key={`${file.url}-${i}`} file={file} />
            ))}

            {/* 내가 남긴 말 */}
            {sub.note ? (
              <View style={{ paddingHorizontal: space.x5, paddingTop: space.x4 }}>
                <Text variant="t4-bold" color="neutralMuted">
                  내가 남긴 말
                </Text>
                <View style={s.note}>
                  <Text variant="t5-regular" color="neutralMuted" selectable>
                    {sub.note}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 받은 피드백 */}
            {sub.feedbacks.length > 0 && (
              <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5 }}>
                <Text variant="t4-bold" color="neutralMuted">
                  받은 피드백 <Text variant="t4-bold" color="neutralMuted" tabular>{sub.feedbacks.length}</Text>
                </Text>
                <View style={{ marginTop: space.x3, gap: space.x5 }}>
                  {sub.feedbacks.map((fb) => {
                    const st = FEEDBACK_STATUS[fb.status] ?? FEEDBACK_STATUS.COMMENT;
                    return (
                      <View key={fb.id} style={s.feedback}>
                        <Avatar name={fb.authorName || '선생님'} size={32} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={s.feedbackHead}>
                            <Text variant="t5-bold">{fb.authorName}</Text>
                            <Badge tone={st.tone} style={{ alignSelf: 'center' }}>
                              {st.label}
                            </Badge>
                            <Text variant="t3-regular" color="neutralSubtle" tabular>
                              {formatDateTimeKST(fb.createdAt)}
                            </Text>
                          </View>
                          <Text
                            variant="t5-regular"
                            color="neutralMuted"
                            selectable
                            style={{ marginTop: space.x1_5 }}>
                            {fb.content}
                          </Text>
                          {fb.files.length > 0 && (
                            <View style={{ marginTop: space.x2_5, gap: space.x1_5 }}>
                              {fb.files.map((file, i) => (
                                <FeedbackAttachment key={`${file.url}-${i}`} file={file} />
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={{ height: space.x3 }} />
          </Section>
        );
      })}
    </Stack>
  );
}

/** 제출 파일 행 — 누르면 열기/내려받기 */
function FileRow({ file }: { file: MobileTaskFile }) {
  return (
    <Press
      onPress={() => void openTaskFile(file.url, file.mimeType)}
      scale={0}
      pressedBg
      accessibilityRole="link"
      accessibilityLabel={`${file.name} 열기`}
      style={s.fileRow}>
      <IconTile icon={isImageMime(file.mimeType) ? ImageIcon : FileText} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="t5-medium" numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
          {formatFileSize(file.sizeBytes)}
        </Text>
      </View>
      <View style={s.download}>
        <Download color={color.fg.neutralMuted} size={18} strokeWidth={2.2} />
      </View>
    </Press>
  );
}

/** 피드백에 붙은 첨부 — 말풍선 아래 작은 행 */
function FeedbackAttachment({ file }: { file: MobileTaskFile }) {
  const Icon = isImageMime(file.mimeType) ? ImageIcon : FileText;
  return (
    <Press
      onPress={() => void openTaskFile(file.url, file.mimeType)}
      accessibilityRole="link"
      accessibilityLabel={`${file.name} 열기`}
      style={s.attachment}>
      <Icon color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
      <Text variant="t4-medium" color="neutralMuted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {file.name}
      </Text>
      <Text variant="t3-regular" color="neutralSubtle" tabular>
        {formatFileSize(file.sizeBytes)}
      </Text>
      <Download color={color.fg.neutralMuted} size={16} strokeWidth={2.2} />
    </Press>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  feedbackCount: { flexDirection: 'row', alignItems: 'center', gap: space.x1 },
  label: { paddingHorizontal: space.x5, paddingTop: space.x3, paddingBottom: space.x1 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3_5,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  download: {
    width: space.x9,
    height: space.x9,
    borderRadius: space.x9 / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.neutralWeak,
  },
  note: {
    marginTop: space.x2,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  feedback: { flexDirection: 'row', gap: space.x3 },
  feedbackHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.x1_5,
    rowGap: space.x1,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    minHeight: 44,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
  },
});

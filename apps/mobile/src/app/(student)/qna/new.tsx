import { useNavigation, useRouter, type Href } from 'expo-router';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AttachmentPicker } from '@/components/attachment-picker';
import { DocAttachField } from '@/components/doc-attach-field';
import { Button, Chip, ChipGroup, Screen, Text, TextField, confirm, space, toast } from '@/design';
import { markCreatedQuestion } from '@/features/student-comm/selection';
import {
  QUESTION_CONTENT_MAX,
  QUESTION_MAX_ATTACHMENTS,
  QUESTION_SUBJECTS,
  QUESTION_TITLE_MAX,
  createStudentQuestion,
  localFromAsset,
  uploadQuestionAttachments,
} from '@/lib/api/student-comm';
import type { MobileAttachment } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

/**
 * 질문 작성 — 웹 학생 포털 qna/new (QuestionForm) 와 같은 순서·문구.
 * 문제 사진(촬영·앨범·영상) + 파일 → 제목 → 과목(선택) → 설명 → 하단 "질문 등록하기".
 * 사진은 등록 버튼을 누른 뒤(검증 통과 후) 업로드하고, 올린 파일은 기억해 두어 재시도해도 다시 올리지 않는다.
 */
export default function NewStudentQuestionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isTablet } = useResponsive();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<ImagePickerAsset[]>([]);
  const [docs, setDocs] = useState<MobileAttachment[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const uploads = useRef(new Map<string, MobileAttachment>());
  const done = useRef(false);

  const attachCount = photos.length + docs.length;
  const dirty = title.trim().length > 0 || content.trim().length > 0 || attachCount > 0;
  const canSubmit =
    title.trim().length > 0 &&
    (content.trim().length > 0 || attachCount > 0) &&
    attachCount <= QUESTION_MAX_ATTACHMENTS &&
    !docUploading &&
    !submitting;

  // 작성 중에 나가려 하면 한 번 묻는다 (뒤로가기 버튼·스와이프·안드로이드 뒤로 모두)
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (done.current || !dirtyRef.current) return;
      e.preventDefault();
      void confirm({
        title: '작성 중인 질문이 있어요',
        message: '나가면 입력한 내용이 사라져요.',
        confirmText: '나가기',
        cancelText: '계속 쓰기',
        destructive: true,
      }).then((ok) => {
        if (ok) {
          done.current = true;
          navigation.dispatch(e.data.action);
        }
      });
    });
    return unsubscribe;
  }, [navigation]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const photoAttachments = await uploadQuestionAttachments(
        photos.map((p, i) => localFromAsset(p, i)),
        uploads.current
      );
      const { id } = await createStudentQuestion({
        title: title.trim(),
        subject: subject || null,
        content: content.trim(),
        attachments: [...photoAttachments, ...docs],
      });
      done.current = true;
      toast('질문을 등록했어요', 'success');
      if (isTablet) {
        markCreatedQuestion(id);
        router.back();
      } else {
        router.replace(`/(student)/qna/${id}` as Href);
      }
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : '등록하지 못했어요. 다시 시도해 주세요', 'error');
      setSubmitting(false);
    }
  };

  return (
    <Screen
      kind="push"
      title=""
      surface="panel"
      footer={
        <View style={{ gap: space.x2_5 }}>
          <Text variant="t3-regular" color="neutralSubtle" align="center">
            등록하면 당일 근무 멘토가 풀이를 답해드려요
          </Text>
          <Button variant="primary" size="xl" block loading={submitting} disabled={!canSubmit} onPress={() => void submit()}>
            질문 등록하기
          </Button>
        </View>
      }>
      <View style={{ paddingTop: space.x2, marginBottom: space.x8 }}>
        <Text variant="t9-bold" accessibilityRole="header">
          어떤 문제가 궁금한가요?
        </Text>
        <Text variant="t5-regular" color="neutralSubtle" style={{ marginTop: space.x2 }}>
          사진 한 장이면 충분해요. 멘토가 풀이를 차근차근 알려드릴게요.
        </Text>
      </View>

      <View style={{ gap: space.x7 }}>
        <View style={{ gap: space.x3 }}>
          <AttachmentPicker
            label="문제 사진"
            assets={photos}
            onChange={setPhotos}
            max={Math.max(photos.length, QUESTION_MAX_ATTACHMENTS - docs.length)}
            allowVideo
            disabled={submitting}
          />
          <DocAttachField
            label={null}
            value={docs}
            onChange={setDocs}
            max={Math.max(docs.length, QUESTION_MAX_ATTACHMENTS - photos.length)}
            disabled={submitting}
            onUploadingChange={setDocUploading}
            description="카메라로 찍거나 앨범에서 골라주세요. 영상·PDF 같은 파일도 올릴 수 있어요."
          />
        </View>

        <TextField
          label="제목"
          value={title}
          onChangeText={setTitle}
          maxLength={QUESTION_TITLE_MAX}
          showCount
          placeholder="예) 미적분 28번 모르겠어요"
          returnKeyType="next"
          editable={!submitting}
        />

        <View style={{ gap: space.x3 }}>
          <Text variant="t5-medium">
            과목
            <Text variant="t4-regular" color="neutralSubtle">
              {'  '}선택
            </Text>
          </Text>
          <ChipGroup>
            {QUESTION_SUBJECTS.map((s) => (
              <Chip
                key={s}
                selected={subject === s}
                disabled={submitting}
                // 선택된 과목을 다시 누르면 해제 (과목은 선택 항목)
                onPress={() => setSubject((cur) => (cur === s ? '' : s))}>
                {s}
              </Chip>
            ))}
          </ChipGroup>
        </View>

        <TextField
          label="설명"
          description="사진이나 설명 중 하나는 꼭 있어야 해요."
          value={content}
          onChangeText={setContent}
          multiline
          minHeight={138}
          maxLength={QUESTION_CONTENT_MAX}
          placeholder="어디까지 풀었는지, 어느 부분에서 막혔는지 적어주면 더 정확하게 답해드릴 수 있어요"
          editable={!submitting}
        />
      </View>
    </Screen>
  );
}

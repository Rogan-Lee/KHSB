import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Archive, Camera, FileText, Images } from 'lucide-react-native';
import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageThread } from '@/components/workflow-ui';
import {
  Badge,
  ErrorState,
  InTabsContext,
  Notice,
  Skeleton,
  Text,
  color,
  radius,
  space,
  toast,
} from '@/design';
import {
  QUESTION_CONTENT_MAX,
  QUESTION_MAX_ATTACHMENTS,
  QUESTION_STATUS,
  STUDENT_QUESTIONS_PATH,
  localFromAsset,
  localFromDocument,
  replyStudentQuestion,
  uploadQuestionAttachments,
  type LocalAttachment,
  type StudentQuestionThread,
} from '@/lib/api/student-comm';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery, type MobileAttachment } from '@/lib/mobile-api';

import { formatAsked } from './format';
import { useLiveRefresh } from './live-refresh';
import { MessageComposer, type ComposerAction } from './message-parts';

/**
 * 질문 상세 — 웹 학생 포털 qna/[questionId] 와 같은 구성.
 * 머리(과목·상태 배지, 제목, 등록 시각) → 말풍선 스레드 → 하단 고정 답글 작성창(보관된 질문이면 숨김).
 * 라우트 화면(폰)과 태블릿 오른쪽 패널(inline)이 같이 쓴다. 키보드 회피는 바깥 Screen 이 한다.
 */
export function QuestionThreadView({
  questionId,
  onChanged,
}: {
  questionId: string;
  /** 답글을 보냈거나 새 답변을 읽었을 때 (목록 새로고침) */
  onChanged?: () => void;
}) {
  const path = `${STUDENT_QUESTIONS_PATH}/${questionId}`;
  const { data, error, retry } = useMobileQuery<StudentQuestionThread>(path);
  const insets = useSafeAreaInsets();
  const inTabs = useContext(InTabsContext);

  const [draft, setDraft] = useState('');
  const [local, setLocal] = useState<LocalAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const uploads = useRef(new Map<string, MobileAttachment>());
  const scrollRef = useRef<ScrollView>(null);
  const stickToEnd = useRef(false);
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  // 새 답변을 이번 조회로 읽었으면 탭 배지·목록 갱신
  useEffect(() => {
    if (data?.hasUnread) {
      refreshBadges();
      onChangedRef.current?.();
    }
  }, [data]);

  // 보고 있는 동안 새 답변 확인 (15초, 앱 복귀 시 즉시)
  useLiveRefresh(retry, 15_000);

  const room = QUESTION_MAX_ATTACHMENTS - local.length;

  const addLocal = (items: LocalAttachment[]) => {
    if (items.length === 0) return;
    if (room <= 0) {
      toast(`첨부는 ${QUESTION_MAX_ATTACHMENTS}개까지 올릴 수 있어요`, 'error');
      return;
    }
    const picked = items.slice(0, room);
    if (picked.length < items.length) {
      toast(`첨부는 ${QUESTION_MAX_ATTACHMENTS}개까지라 ${picked.length}개만 넣었어요`);
    }
    setLocal((prev) => {
      const keys = new Set(prev.map((a) => a.key));
      return [...prev, ...picked.filter((a) => !keys.has(a.key))];
    });
  };

  const actions: ComposerAction[] = [
    {
      key: 'album',
      label: '앨범',
      icon: Images,
      onPress: async () => {
        try {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
            selectionLimit: Math.max(1, room),
            quality: 0.6,
          });
          if (!res.canceled) addLocal(res.assets.map((a, i) => localFromAsset(a, i)));
        } catch {
          toast('사진을 불러오지 못했어요', 'error');
        }
      },
    },
    {
      key: 'camera',
      label: '카메라',
      icon: Camera,
      onPress: async () => {
        try {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            toast('카메라 권한을 허용하면 바로 찍어서 올릴 수 있어요', 'error');
            return;
          }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
          if (!res.canceled && res.assets[0]) addLocal([localFromAsset(res.assets[0])]);
        } catch {
          toast('카메라를 열지 못했어요', 'error');
        }
      },
    },
    {
      key: 'file',
      label: '파일',
      icon: FileText,
      onPress: async () => {
        try {
          const res = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
            type: '*/*',
          });
          if (!res.canceled) addLocal(res.assets.map(localFromDocument));
        } catch {
          toast('파일을 불러오지 못했어요', 'error');
        }
      },
    },
  ];

  const send = async () => {
    const content = draft.trim();
    if ((!content && local.length === 0) || sending) return;
    setSending(true);
    try {
      // 검증(내용 또는 첨부) 뒤에만 업로드. 이미 올린 파일은 캐시에서 재사용 → 재시도해도 중복 업로드 없음
      const attachments = await uploadQuestionAttachments(local, uploads.current);
      await replyStudentQuestion(questionId, { content, attachments });
      setDraft((cur) => (cur.trim() === content ? '' : cur));
      setLocal([]);
      uploads.current = new Map();
      stickToEnd.current = true;
      await retry();
      onChangedRef.current?.();
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : '보내지 못했어요. 다시 시도해 주세요', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!data) {
    return (
      <View style={s.root}>
        {error ? <ErrorState message={error} onRetry={() => void retry()} /> : <ThreadSkeleton />}
      </View>
    );
  }

  const { question, messages } = data;
  const status = QUESTION_STATUS[question.status];
  const archived = question.status === 'ARCHIVED';

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onContentSizeChange={() => {
          if (stickToEnd.current) {
            stickToEnd.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}>
        <View style={s.column}>
          <View style={s.header}>
            <View style={s.badges}>
              {question.subject ? <Badge>{question.subject}</Badge> : null}
              <Badge tone={status.tone}>{status.label}</Badge>
            </View>
            <Text variant="t8-bold" accessibilityRole="header" style={{ marginTop: space.x2_5 }}>
              {question.title}
            </Text>
            <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x1_5 }}>
              {formatAsked(question.createdAt)} 질문
            </Text>
          </View>

          <MessageThread
            messages={messages}
            viewer="STUDENT"
            surface="canvas"
            emptyHint="첫 메시지를 작성해 보세요."
          />

          {archived && (
            <Notice tone="gray" icon={Archive}>
              보관된 질문이라 답글을 남길 수 없어요. 새로 궁금한 점은 새 질문으로 올려 주세요.
            </Notice>
          )}
        </View>
      </ScrollView>

      {!archived && (
        <MessageComposer
          value={draft}
          onChangeText={setDraft}
          onSend={() => void send()}
          sending={sending}
          placeholder="더 궁금한 점을 남겨보세요"
          maxLength={QUESTION_CONTENT_MAX}
          attachments={local.map((a) => ({ key: a.key, name: a.name, mimeType: a.mimeType, uri: a.uri }))}
          onRemoveAttachment={(key) => setLocal((prev) => prev.filter((a) => a.key !== key))}
          actions={actions}
          bottomInset={inTabs ? 0 : insets.bottom}
        />
      )}
    </View>
  );
}

function ThreadSkeleton() {
  return (
    <View style={[s.scroll, s.column]} accessibilityLabel="질문을 불러오는 중">
      <View style={[s.header, { gap: space.x2_5 }]}>
        <View style={s.badges}>
          <Skeleton style={{ width: 40, height: 20, borderRadius: radius.r1 }} />
          <Skeleton style={{ width: 56, height: 20, borderRadius: radius.r1 }} />
        </View>
        <Skeleton style={{ width: '80%', height: 26 }} />
        <Skeleton style={{ width: 120, height: 14 }} />
      </View>
      <Skeleton style={{ alignSelf: 'flex-end', width: 232, height: 180, borderRadius: radius.r4 }} />
      <Skeleton style={{ alignSelf: 'flex-end', width: 200, height: 44, borderRadius: radius.r5 }} />
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 240, height: 88, borderRadius: radius.r5 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg.layerBasement },
  scroll: { paddingHorizontal: space.x4, paddingBottom: space.x8 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.x6 },
  header: { paddingHorizontal: space.x1, paddingTop: space.x3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1 },
});

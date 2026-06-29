import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronLeft,
  FileText,
  ImagePlus,
  Paperclip,
  Send,
  X,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar, ErrorState, LoadingState } from '@/components/mobile-ui';
import { colors, palette, radius, spacing, type } from '@/constants/theme';
import {
  ChatThreadResponse,
  MobileAttachment,
  mutateMobileApi,
  uploadMobileChatFile,
  useMobileQuery,
} from '@/lib/mobile-api';

function isImage(att: { mimeType: string; name: string }) {
  return (
    att.mimeType.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(att.name)
  );
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 학생·직원 공용 채팅 스레드. 사진·문서(PDF/HWP/DOC/PPT/XLSX 등) 첨부 송수신.
 * basePath 예: '/api/mobile/v1/student/chats' | '/api/mobile/v1/staff/chats'
 */
export function ChatThread({
  basePath,
  chatId,
  accentColor = palette.blue50,
  onBack,
}: {
  basePath: string;
  chatId: string;
  accentColor?: string;
  onBack?: () => void;
}) {
  const path = `${basePath}/${chatId}`;
  const { data, error, isLoading, refresh, retry } =
    useMobileQuery<ChatThreadResponse>(path);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<MobileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachError, setAttachError] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  async function uploadAll(
    files: {
      uri: string;
      name: string;
      mimeType?: string;
      width?: number;
      file?: File | Blob;
    }[],
  ) {
    if (files.length === 0) return;
    setAttachError('');
    setUploading(true);
    try {
      // 여러 파일 병렬 업로드 (순차 대비 체감 속도 개선)
      const uploaded = await Promise.all(
        files.map((f) => uploadMobileChatFile(f, chatId)),
      );
      setPending((prev) => [...prev, ...uploaded]);
    } catch (caught) {
      setAttachError(
        caught instanceof Error ? caught.message : '파일을 첨부하지 못했습니다.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setAttachError('사진 접근 권한이 필요합니다.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.6, // HEIC 원본을 JPEG 로 재인코딩·압축 → 업로드 용량/시간 대폭 감소
    });
    if (res.canceled) return;
    await uploadAll(
      res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${i + 1}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
        width: a.width,
        file: a.file,
      })),
    );
  }

  async function pickDocuments() {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (res.canceled) return;
    await uploadAll(
      res.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? undefined,
        file: a.file,
      })),
    );
  }

  async function send() {
    const content = draft.trim();
    if ((!content && pending.length === 0) || sending) return;
    setSending(true);
    setDraft('');
    const attachments = pending;
    setPending([]);
    try {
      await mutateMobileApi(path, 'POST', { content, attachments });
      await refresh();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setDraft(content); // 실패 시 복구
      setPending(attachments);
    } finally {
      setSending(false);
    }
  }

  if (isLoading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void retry()} />;
  if (!data) return null;

  const canSend = (draft.trim().length > 0 || pending.length > 0) && !sending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
      style={styles.flex}>
      <View style={styles.partnerBar}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
            <ChevronLeft color={colors.textNormal} size={26} />
          </Pressable>
        ) : null}
        <Avatar
          label={data.partner.name.slice(0, 2)}
          size={38}
          tone={{ background: palette.blue5, foreground: accentColor }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.partnerName}>{data.partner.name}</Text>
          <Text style={styles.partnerRole}>{data.partner.roleLabel}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {data.messages.length === 0 ? (
          <Text style={styles.hint}>첫 메시지를 보내 대화를 시작하세요.</Text>
        ) : (
          data.messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleOther]}>
              {m.content ? (
                <Text style={[styles.bubbleText, m.mine && styles.bubbleTextMine]}>
                  {m.content}
                </Text>
              ) : null}
              {m.attachments.map((att, i) => (
                <Attachment att={att} key={`${m.id}-${i}`} mine={m.mine} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {pending.length > 0 || uploading || attachError ? (
        <View style={styles.pendingBar}>
          {attachError ? <Text style={styles.attachError}>{attachError}</Text> : null}
          {uploading ? <Text style={styles.uploadingText}>업로드 중…</Text> : null}
          <View style={styles.pendingRow}>
            {pending.map((att, i) => (
              <View key={`p-${i}`} style={styles.pendingChip}>
                {isImage(att) ? (
                  <Image source={{ uri: att.url }} style={styles.pendingThumb} />
                ) : (
                  <FileText color={palette.blue50} size={16} />
                )}
                <Text numberOfLines={1} style={styles.pendingName}>
                  {att.name}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setPending((prev) => prev.filter((_, j) => j !== i))}>
                  <X color={colors.textAssistive} size={14} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <Pressable
          disabled={uploading || sending}
          hitSlop={6}
          onPress={() => void pickImages()}
          style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.6 }]}>
          <ImagePlus color={colors.textAlternative} size={22} />
        </Pressable>
        <Pressable
          disabled={uploading || sending}
          hitSlop={6}
          onPress={() => void pickDocuments()}
          style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.6 }]}>
          <Paperclip color={colors.textAlternative} size={21} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="메시지 입력"
          placeholderTextColor={colors.textAssistive}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!sending}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: accentColor },
            (pressed || !canSend) && { opacity: 0.5 },
          ]}>
          <Send color={colors.textOncolor} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Attachment({ att, mine }: { att: MobileAttachment; mine: boolean }) {
  const open = () => void Linking.openURL(att.url);
  if (isImage(att)) {
    return (
      <Pressable onPress={open} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <Image
          contentFit="cover"
          source={{ uri: att.url }}
          style={styles.attachImage}
        />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.fileChip,
        mine ? styles.fileChipMine : styles.fileChipOther,
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.fileIcon}>
        <FileText color={mine ? colors.textOncolor : palette.blue50} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[styles.fileName, mine && { color: colors.textOncolor }]}>
          {att.name}
        </Text>
        <Text
          style={[
            styles.fileMeta,
            mine && { color: colors.textOncolor, opacity: 0.8 },
          ]}>
          {formatSize(att.sizeBytes)} · 탭하여 열기
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  partnerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineNeutral,
    backgroundColor: colors.surface,
  },
  back: { padding: 2 },
  partnerName: { ...type.label1, color: colors.textNormal },
  partnerRole: { ...type.caption2, color: colors.textAssistive, marginTop: 1 },

  body: { backgroundColor: colors.bgAlternative, flexGrow: 1, padding: spacing.lg, gap: 10 },
  hint: { ...type.body3, color: colors.textAssistive, textAlign: 'center', marginTop: spacing.xl },

  bubble: { maxWidth: '80%', paddingHorizontal: 13, paddingVertical: 10, gap: 8 },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: palette.blue50,
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleText: { ...type.body3, color: colors.textNormal },
  bubbleTextMine: { color: colors.textOncolor },

  attachImage: { width: 200, height: 200, borderRadius: 12, backgroundColor: colors.fillAlt },
  fileChip: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    minWidth: 200,
    padding: 10,
  },
  fileChipOther: { backgroundColor: palette.blue5 },
  fileChipMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  fileIcon: { alignItems: 'center', justifyContent: 'center' },
  fileName: { ...type.caption1, color: colors.textNormal, fontWeight: '700' },
  fileMeta: { ...type.caption2, color: colors.textAssistive, marginTop: 1 },

  pendingBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.lineNeutral,
    borderTopWidth: 1,
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  attachError: { ...type.caption1, color: palette.red50 },
  uploadingText: { ...type.caption1, color: colors.textAssistive },
  pendingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pendingChip: {
    alignItems: 'center',
    backgroundColor: colors.fillAlt,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingThumb: { width: 20, height: 20, borderRadius: 4 },
  pendingName: { ...type.caption2, color: colors.textNormal, flexShrink: 1 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineNeutral,
  },
  attachBtn: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 32,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    paddingHorizontal: 15,
    paddingVertical: 10,
    ...type.body3,
    color: colors.textNormal,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// 대화 UI 공용 조각 — 채팅(ChatThread)·질문 스레드(MessageThread)·질문 답글 작성이 함께 쓴다.
// 웹 src/components/online/chat/{chat-bubble,chat-composer}.tsx, questions/question-thread.tsx 의
// portal(SEED) 변형과 같은 모양.

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowUp,
  Download,
  ExternalLink,
  FileText,
  Play,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconTile, Press, Text, color, radius, space, text, toast } from '@/design';

import { formatBytes } from './format';
import { isWebUrl } from '@/lib/safe-url';

type AttachmentLike = { url: string; name: string; mimeType: string; sizeBytes?: number };

// ─── 첨부 판별·열기 ──────────────────────────────────────────────────

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

export function attachmentKind(att: { mimeType?: string | null; name: string }): 'image' | 'video' | 'file' {
  const type = att.mimeType ?? '';
  if (type.startsWith('image/') || IMAGE_EXT.test(att.name)) return 'image';
  if (type.startsWith('video/') || VIDEO_EXT.test(att.name)) return 'video';
  return 'file';
}

/** 첨부 열기 — 앱 안 브라우저(사진·PDF·영상 미리보기), 웹은 새 탭 */
export async function openAttachment(url: string) {
  if (!isWebUrl(url)) {
    toast('파일을 열지 못했어요', 'error');
    return;
  }
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      toast('파일을 열지 못했어요', 'error');
    }
  }
}

// ─── 사진 크게 보기 ──────────────────────────────────────────────────

function ImageViewer({ uri, name, onClose }: { uri: string | null; name?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal
      visible={uri != null}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}>
      <View style={s.viewer}>
        {uri != null && (
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <Image
              source={{ uri }}
              contentFit="contain"
              style={{ width, height: height - insets.top - insets.bottom }}
              accessibilityLabel={name ?? '첨부 사진'}
            />
          </ScrollView>
        )}
        <View style={[s.viewerBar, { paddingTop: insets.top + space.x2 }]}>
          <Press onPress={onClose} scale={0} style={s.viewerBtn} accessibilityLabel="닫기" hitSlop={8}>
            <X color={color.palette.staticWhite} size={24} strokeWidth={2.2} />
          </Press>
          {uri != null && (
            <Press
              onPress={() => void openAttachment(uri)}
              scale={0}
              style={s.viewerBtn}
              accessibilityLabel="원본 열기"
              hitSlop={8}>
              <ExternalLink color={color.palette.staticWhite} size={22} strokeWidth={2.2} />
            </Press>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── 말풍선 첨부 ─────────────────────────────────────────────────────

/** 말풍선 사진 — 원본 비율(최대 높이 320), 누르면 크게 보기 */
export function BubbleImage({
  att,
  width = 232,
  square = false,
}: {
  att: AttachmentLike;
  width?: number;
  /** 2열 그리드용 정사각형 */
  square?: boolean;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  if (broken) return <BubbleFile att={att} />;
  const h = square ? width : Math.min(320, Math.round(width / Math.min(Math.max(ratio ?? 1, 0.5), 2.2)));
  return (
    <>
      <Press
        onPress={() => setOpen(true)}
        scale={0.98}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${att.name} 사진 크게 보기`}
        style={[s.bubbleImage, { width, height: h }]}>
        <Image
          source={{ uri: att.url }}
          contentFit="cover"
          transition={120}
          style={StyleSheet.absoluteFill}
          onLoad={(e) => {
            if (e.source.width && e.source.height) setRatio(e.source.width / e.source.height);
          }}
          onError={() => setBroken(true)}
        />
      </Press>
      <ImageViewer uri={open ? att.url : null} name={att.name} onClose={() => setOpen(false)} />
    </>
  );
}

/** 말풍선 영상 — 재생 표시 타일, 누르면 앱 안 브라우저에서 재생 */
export function BubbleVideo({ att, width = 232 }: { att: AttachmentLike; width?: number }) {
  return (
    <Press
      onPress={() => void openAttachment(att.url)}
      accessibilityLabel={`${att.name} 영상 재생`}
      style={[s.bubbleVideo, { width }]}>
      <View style={s.playCircle}>
        <Play color={color.palette.staticWhite} size={20} strokeWidth={2.4} fill={color.palette.staticWhite} />
      </View>
      <Text variant="t2-medium" color="staticWhite" numberOfLines={1} style={s.videoName}>
        {att.name}
      </Text>
    </Press>
  );
}

/** 말풍선 파일 — 아이콘 원 + 이름 + 크기 (내 파일은 브랜드색) */
export function BubbleFile({
  att,
  mine = false,
  onCanvas = true,
}: {
  att: AttachmentLike;
  mine?: boolean;
  /** 회색 캔버스 위면 흰 카드, 흰 패널 위면 회색 카드 */
  onCanvas?: boolean;
}) {
  const size = formatBytes(att.sizeBytes ?? 0);
  const fg = mine ? color.palette.staticWhite : color.fg.neutral;
  return (
    <Press
      onPress={() => void openAttachment(att.url)}
      accessibilityLabel={`${att.name} 파일 열기`}
      style={[
        s.bubbleFile,
        { backgroundColor: mine ? color.bg.brandSolid : onCanvas ? color.bg.layerDefault : color.bg.neutralWeak },
      ]}>
      <View
        style={[
          s.fileIcon,
          {
            backgroundColor: mine
              ? color.palette.staticWhiteAlpha300
              : onCanvas
                ? color.bg.neutralWeak
                : color.bg.layerDefault,
          },
        ]}>
        <FileText color={mine ? fg : color.fg.neutralMuted} size={18} strokeWidth={2} />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text variant="t4-bold" color={fg} numberOfLines={1}>
          {att.name}
        </Text>
        {size ? (
          <Text
            variant="t2-regular"
            color={mine ? color.palette.staticWhiteAlpha800 : 'neutralSubtle'}
            tabular>
            {size}
          </Text>
        ) : null}
      </View>
      <Download color={mine ? color.palette.staticWhiteAlpha800 : color.fg.neutralSubtle} size={16} strokeWidth={2} />
    </Press>
  );
}

/** 말풍선 안 첨부 묶음 — 사진은 1장이면 크게, 여러 장이면 2열 그리드 */
export function BubbleAttachments({
  attachments,
  mine,
  onCanvas = true,
  width = 232,
}: {
  attachments: AttachmentLike[];
  mine: boolean;
  onCanvas?: boolean;
  width?: number;
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => attachmentKind(a) === 'image');
  const videos = attachments.filter((a) => attachmentKind(a) === 'video');
  const files = attachments.filter((a) => attachmentKind(a) === 'file');
  const cell = Math.floor((width + 16 - space.x1) / 2);
  return (
    <>
      {images.length === 1 && <BubbleImage att={images[0]} width={width} />}
      {images.length > 1 && (
        <View style={[s.grid, { width: cell * 2 + space.x1 }]}>
          {images.map((a, i) => (
            <BubbleImage key={`${a.url}-${i}`} att={a} width={cell} square />
          ))}
        </View>
      )}
      {videos.map((a, i) => (
        <BubbleVideo key={`${a.url}-${i}`} att={a} width={width} />
      ))}
      {files.map((a, i) => (
        <BubbleFile key={`${a.url}-${i}`} att={a} mine={mine} onCanvas={onCanvas} />
      ))}
    </>
  );
}

/** 날짜 구분선 — "오늘", "어제", "3월 5일" */
export function DaySeparator({ label }: { label: string }) {
  return (
    <View style={s.day} accessibilityRole="header">
      <View style={s.dayPill}>
        <Text variant="t2-medium" color="neutralSubtle">
          {label}
        </Text>
      </View>
    </View>
  );
}

// ─── 키보드 ─────────────────────────────────────────────────────────

/** 키보드가 떠 있는지 — 하단 safe-area 여백을 키보드 위에서 빼기 위해 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true)
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// ─── 작성창 (SEED: [+] [입력] [↑]) ──────────────────────────────────

export type ComposerAttachment = {
  key: string;
  name: string;
  mimeType: string;
  /** 미리보기 주소 (기기 파일 uri 또는 업로드된 url) */
  uri: string;
};

export type ComposerAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
};

/**
 * 하단 고정 메시지 작성창. [+] 를 누르면 첨부 메뉴(앨범·카메라·파일)가 입력창 아래에 펼쳐진다.
 * 전송 중이면 보내기 버튼이 로딩, 실패 시 호출부가 draft 를 되돌린다.
 */
export function MessageComposer({
  value,
  onChangeText,
  onSend,
  sending = false,
  uploading = false,
  disabled = false,
  placeholder = '메시지 보내기',
  attachments = [],
  onRemoveAttachment,
  actions = [],
  maxLength = 4000,
  bottomInset = 0,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  sending?: boolean;
  /** 첨부 업로드 중 (보내기 잠금 + 진행 타일) */
  uploading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  attachments?: ComposerAttachment[];
  onRemoveAttachment?: (key: string) => void;
  actions?: ComposerAction[];
  maxLength?: number;
  /** 키보드가 없을 때 아래 여백 (홈 인디케이터) */
  bottomInset?: number;
}) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const keyboard = useKeyboardVisible();
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !sending && !uploading && !disabled;
  // 보내는 중에도 입력은 열어 둔다 (편집 불가로 바꾸면 키보드가 내려감)
  const busy = sending || disabled;

  const submit = () => {
    if (canSend) onSend();
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web') return;
    // 웹: Enter 전송, Shift+Enter 줄바꿈 (한글 조합 중에는 무시)
    const ev = e as unknown as {
      key?: string;
      shiftKey?: boolean;
      nativeEvent: { isComposing?: boolean; keyCode?: number };
      preventDefault: () => void;
    };
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing && ev.nativeEvent.keyCode !== 229) {
      ev.preventDefault();
      submit();
    }
  };

  const onPlus = () => {
    if (actions.length === 1) {
      actions[0].onPress();
      return;
    }
    if (!trayOpen) Keyboard.dismiss();
    setTrayOpen((v) => !v);
  };

  return (
    <View style={[s.composer, { paddingBottom: keyboard ? 0 : bottomInset }]}>
      {(attachments.length > 0 || uploading) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.pendingRow}>
          {attachments.map((a) => (
            <PendingTile key={a.key} att={a} disabled={busy} onRemove={() => onRemoveAttachment?.(a.key)} />
          ))}
          {uploading && (
            <View style={[s.pendingTile, s.center]} accessibilityLabel="업로드 중">
              <ActivityIndicator color={color.fg.neutralSubtle} />
            </View>
          )}
        </ScrollView>
      )}

      <View style={s.inputRow}>
        {actions.length > 0 && (
          <Button
            variant="weak"
            size="md"
            icon={trayOpen ? X : Plus}
            onPress={onPlus}
            disabled={busy || uploading}
            accessibilityLabel={trayOpen ? '첨부 메뉴 닫기' : '파일 첨부'}
          />
        )}
        <View
          style={[
            s.inputBox,
            {
              borderColor: focused ? color.stroke.neutralContrast : color.stroke.neutralWeak,
              borderWidth: focused ? 2 : 1,
              paddingHorizontal: space.x3_5 - (focused ? 1 : 0),
            },
          ]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.fg.placeholder}
            selectionColor={color.fg.brand}
            maxFontSizeMultiplier={1.5}
            multiline
            maxLength={maxLength}
            editable={!disabled}
            onKeyPress={onKeyPress}
            onFocus={() => {
              setFocused(true);
              setTrayOpen(false);
            }}
            onBlur={() => setFocused(false)}
            accessibilityLabel="메시지"
            style={[
              text('t5-regular'),
              s.input,
              // 테두리 1→2px 로 바뀌어도 높이(40)가 그대로이도록 보정
              {
                paddingVertical: focused ? space.x2 - 1 : space.x2,
                minHeight: focused ? 36 : 38,
                color: color.fg.neutral,
              },
            ]}
          />
        </View>
        <Button
          variant="primary"
          size="md"
          icon={ArrowUp}
          onPress={submit}
          loading={sending}
          disabled={!canSend}
          accessibilityLabel="보내기"
        />
      </View>

      {trayOpen && actions.length > 1 && (
        <View style={s.tray}>
          {actions.map((a) => (
            <Press
              key={a.key}
              onPress={() => {
                setTrayOpen(false);
                a.onPress();
              }}
              accessibilityLabel={a.label}
              style={s.trayItem}>
              <IconTile icon={a.icon} tone="gray" size={48} round />
              <Text variant="t3-medium" color="neutralMuted">
                {a.label}
              </Text>
            </Press>
          ))}
        </View>
      )}
    </View>
  );
}

function PendingTile({
  att,
  onRemove,
  disabled,
}: {
  att: ComposerAttachment;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const kind = attachmentKind(att);
  return (
    <View style={[s.pendingTile, kind === 'file' && s.pendingFile]}>
      {kind === 'image' ? (
        <Image source={{ uri: att.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : kind === 'video' ? (
        <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: color.bg.neutralSolid }]}>
          <Play color={color.palette.staticWhite} size={18} fill={color.palette.staticWhite} />
        </View>
      ) : (
        <View style={s.pendingFileBody}>
          <FileText color={color.fg.neutralSubtle} size={16} strokeWidth={2} />
          <Text variant="t3-regular" color="neutralMuted" numberOfLines={2} style={{ flexShrink: 1 }}>
            {att.name}
          </Text>
        </View>
      )}
      {!disabled && (
        <Press onPress={onRemove} scale={0} hitSlop={8} accessibilityLabel={`${att.name} 첨부 빼기`} style={s.remove}>
          <X color={color.palette.staticWhite} size={12} strokeWidth={3} />
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: color.palette.staticBlack },
  viewerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.x2,
  },
  viewerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.palette.staticBlackAlpha500,
  },
  bubbleImage: {
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: radius.r4,
    backgroundColor: color.bg.neutralWeak,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x1, maxWidth: '100%' },
  bubbleVideo: {
    maxWidth: '100%',
    height: 140,
    borderRadius: radius.r4,
    backgroundColor: color.bg.neutralSolid,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    paddingLeft: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.overlay,
  },
  videoName: { position: 'absolute', left: space.x3, right: space.x3, bottom: space.x2 },
  bubbleFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    maxWidth: 260,
    minHeight: 56,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  fileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  day: { alignItems: 'center', paddingTop: space.x5, paddingBottom: space.x3 },
  dayPill: {
    paddingHorizontal: space.x3,
    paddingVertical: space.x1,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralWeakAlpha,
  },
  composer: {
    backgroundColor: color.bg.layerDefault,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  pendingRow: { gap: space.x2, paddingHorizontal: space.x3, paddingTop: space.x3 },
  pendingTile: {
    width: 64,
    height: 64,
    borderRadius: radius.r3,
    overflow: 'hidden',
    backgroundColor: color.bg.neutralWeak,
  },
  pendingFile: { width: 148 },
  pendingFileBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    paddingLeft: space.x3,
    paddingRight: space.x7,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.overlay,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  inputBox: { flex: 1, minWidth: 0, borderRadius: radius.r3, backgroundColor: color.bg.layerDefault },
  input: {
    maxHeight: 128,
    padding: 0,
    margin: 0,
    textAlignVertical: 'top',
  },
  tray: {
    flexDirection: 'row',
    gap: space.x2,
    paddingHorizontal: space.x3,
    paddingTop: space.x1,
    paddingBottom: space.x3,
  },
  trayItem: { width: 72, alignItems: 'center', gap: space.x1_5, paddingVertical: space.x2 },
});

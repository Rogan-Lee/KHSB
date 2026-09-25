import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { FileText, FolderOpen, ImageIcon, Images, Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, color, IconTile, ListRow, Press, showImages, space, Text } from '@/design';
import type { MobileTaskFile } from '@/lib/mobile-api';

/** 파일당 최대 크기 — 서버(src/app/api/mobile/v1/media) 문서 한도와 같다 */
export const TASK_FILE_MAX_BYTES = 50 * 1024 * 1024;

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/*',
  'application/msword',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-hwp',
  'application/x-hwpx',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

const defaultDescription = (max: number) =>
  `최대 ${max}개, 파일당 50MB까지 올릴 수 있어요. PDF · 이미지 · 워드 · 한글 · ZIP`;

function formatSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '크기 확인 중';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/');

/** 올린 파일 열기 — 사진은 앱 안 사진 보기, 그 밖(PDF 등)은 앱 안 브라우저, 실패하면 기본 브라우저 */
export async function openTaskFile(url: string, mimeType?: string | null) {
  if (isImage(mimeType)) {
    showImages([url]);
    return;
  }
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}

/** 사진 보관함 선택 결과를 문서 선택 결과 모양으로 맞춘다 (업로드 함수가 하나로 처리) */
function photoToAsset(photo: ImagePicker.ImagePickerAsset, i: number): DocumentPicker.DocumentPickerAsset {
  const mimeType = photo.mimeType ?? 'image/jpeg';
  let name = photo.fileName || `photo-${Date.now()}-${i + 1}.jpg`;
  // iOS 는 HEIC 원본 이름을 주면서 JPEG 로 변환해 넘겨준다 — 확장자를 실제 형식에 맞춘다
  if (mimeType === 'image/jpeg' && !/\.jpe?g$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.jpg';
  return {
    uri: photo.uri,
    name,
    mimeType,
    size: photo.fileSize,
    lastModified: Date.now(),
    file: photo.file,
  };
}

/**
 * 수행평가·피드백 첨부 파일 고르기 (SEED Fieldset 모양 — 웹 포털 TaskSubmissionForm 과 같은 구성).
 *  · assets: 새로 고른(아직 올리지 않은) 파일 — 제출할 때 업로드한다
 *  · uploaded: 이미 올린 파일(이전 제출물) — 다시 제출할 때 그대로 유지하거나 뺄 수 있다
 * 파일당 50MB, 합계 max 개.
 */
export function TaskFilePicker({
  assets,
  max = 5,
  onChange,
  uploaded,
  onChangeUploaded,
  label = '첨부 파일',
  description,
  disabled = false,
}: {
  assets: DocumentPicker.DocumentPickerAsset[];
  max?: number;
  onChange: (assets: DocumentPicker.DocumentPickerAsset[]) => void;
  /** 이미 업로드된 파일 (선택) */
  uploaded?: MobileTaskFile[];
  onChangeUploaded?: (files: MobileTaskFile[]) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const picking = useRef(false);
  const kept = uploaded ?? [];
  const total = kept.length + assets.length;
  const remaining = Math.max(0, max - total);

  function add(picked: DocumentPicker.DocumentPickerAsset[]) {
    const tooBig = picked.filter((a) => (a.size ?? 0) > TASK_FILE_MAX_BYTES);
    const fresh = picked
      .filter((a) => (a.size ?? 0) <= TASK_FILE_MAX_BYTES)
      .filter((a) => !assets.some((b) => b.uri === a.uri && b.name === a.name));
    const accepted = fresh.slice(0, remaining);
    const messages: string[] = [];
    if (tooBig.length === 1) messages.push(`${tooBig[0].name} 파일은 50MB가 넘어서 올릴 수 없어요.`);
    else if (tooBig.length > 1) messages.push(`50MB가 넘는 파일 ${tooBig.length}개는 뺐어요.`);
    if (fresh.length > accepted.length) messages.push(`파일은 최대 ${max}개까지 첨부할 수 있어요.`);
    setError(messages.join(' '));
    if (accepted.length > 0) onChange([...assets, ...accepted]);
  }

  async function run(pick: () => Promise<void>) {
    if (picking.current) return;
    picking.current = true;
    setError('');
    try {
      await pick();
    } catch {
      setError('파일을 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      picking.current = false;
    }
  }

  const pickDocuments = () =>
    run(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: ACCEPTED_TYPES,
      });
      if (!result.canceled) add(result.assets);
    });

  const pickPhotos = () =>
    run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        quality: 0.8,
        selectionLimit: Math.max(1, remaining),
      });
      if (!result.canceled) add(result.assets.map(photoToAsset));
    });

  const onAdd = () => {
    if (disabled || remaining <= 0) return;
    // 웹은 브라우저 파일 선택창이 사진·파일을 모두 보여준다. 네이티브는 사진 보관함/파일 앱 중 고르게 한다.
    if (Platform.OS === 'web') void pickDocuments();
    else setSheetOpen(true);
  };

  const choose = (fn: () => Promise<void>) => {
    setSheetOpen(false);
    // 시트가 닫힌 뒤 시스템 선택창을 띄워야 iOS 에서 모달이 겹치지 않는다
    setTimeout(() => void fn(), 350);
  };

  return (
    <View style={{ gap: space.x2 }}>
      <View style={s.labelRow}>
        <Text variant="t5-medium">{label}</Text>
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {total}/{max}
        </Text>
      </View>

      {total > 0 && (
        <View style={{ gap: space.x1 }}>
          {kept.map((file, i) => (
            <FileRow
              key={`up-${file.url}-${i}`}
              name={file.name}
              size={file.sizeBytes}
              mime={file.mimeType}
              onOpen={() => void openTaskFile(file.url)}
              onRemove={
                onChangeUploaded && !disabled
                  ? () => onChangeUploaded(kept.filter((_, j) => j !== i))
                  : undefined
              }
            />
          ))}
          {assets.map((asset) => (
            <FileRow
              key={`new-${asset.uri}-${asset.name}`}
              name={asset.name}
              size={asset.size}
              mime={asset.mimeType}
              onRemove={disabled ? undefined : () => onChange(assets.filter((item) => item !== asset))}
            />
          ))}
        </View>
      )}

      {remaining > 0 && (
        <Button
          variant="weak"
          size="lg"
          block
          icon={Plus}
          disabled={disabled}
          onPress={onAdd}
          accessibilityLabel="파일 첨부하기">
          파일 첨부하기
        </Button>
      )}

      {error ? (
        <Text variant="t3-regular" color="critical">
          {error}
        </Text>
      ) : (
        <Text variant="t3-regular" color="neutralSubtle">
          {description ?? defaultDescription(max)}
        </Text>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="파일 첨부하기">
        <View style={{ marginHorizontal: -space.x5 }}>
          <ListRow
            leading={<IconTile icon={Images} tone="brand" size={40} />}
            title="사진 보관함에서 고르기"
            description="찍어 둔 과제 사진을 올려요"
            onPress={() => choose(pickPhotos)}
          />
          <ListRow
            leading={<IconTile icon={FolderOpen} tone="info" size={40} />}
            title="파일에서 고르기"
            description="PDF · 워드 · 한글 · ZIP"
            onPress={() => choose(pickDocuments)}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function FileRow({
  name,
  size,
  mime,
  onOpen,
  onRemove,
}: {
  name: string;
  size?: number | null;
  mime?: string | null;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const body = (
    <>
      <IconTile icon={isImage(mime) ? ImageIcon : FileText} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="t5-medium" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
          {formatSize(size)}
        </Text>
      </View>
    </>
  );
  return (
    <View style={s.fileRow}>
      {onOpen ? (
        <Press
          onPress={onOpen}
          scale={0}
          style={s.fileMain}
          accessibilityRole="link"
          accessibilityLabel={`${name} 열기`}>
          {body}
        </Press>
      ) : (
        <View style={s.fileMain}>{body}</View>
      )}
      {onRemove && (
        <Press
          onPress={onRemove}
          scale={0}
          pressedBg
          hitSlop={4}
          accessibilityLabel={`${name} 첨부 취소`}
          style={s.remove}>
          <X color={color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.x1, paddingVertical: space.x1 },
  fileMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.x2_5,
  },
});

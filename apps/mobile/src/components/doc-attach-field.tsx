import * as DocumentPicker from 'expo-document-picker';
import { FileText, Paperclip, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconTile, Press, Text, color, radius, space, toast } from '@/design';
import { formatBytes } from '@/features/student-comm/format';
import { MobileAttachment, uploadMobileQuestionFile } from '@/lib/mobile-api';

/**
 * 문서 첨부(PDF·HWP·DOC·PPT·XLSX 등) — 고르는 즉시 업로드해 MobileAttachment 로 보관한다.
 * SEED: 파일 행(아이콘·이름·크기·×) 목록 + [파일 추가] 버튼. 업로드 중엔 버튼이 로딩.
 */
export function DocAttachField({
  value,
  onChange,
  max = 5,
  label = '파일 첨부',
  indicator,
  description,
  disabled = false,
  onUploadingChange,
}: {
  value: MobileAttachment[];
  onChange: (next: MobileAttachment[]) => void;
  max?: number;
  /** 위 라벨 (null 이면 숨김) */
  label?: string | null;
  /** 라벨 옆 보조 표시 (예: "선택") */
  indicator?: string;
  description?: string;
  disabled?: boolean;
  /** 업로드 중 여부 — 호출부가 제출 버튼을 잠글 때 */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const full = value.length >= max;

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };

  async function pick() {
    if (full) {
      toast(`파일은 ${max}개까지 첨부할 수 있어요`);
      return;
    }
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: '*/*',
      });
    } catch {
      toast('파일을 불러오지 못했어요', 'error');
      return;
    }
    if (res.canceled) return;
    const room = max - value.length;
    const picked = res.assets.slice(0, room);
    if (picked.length < res.assets.length) toast(`파일은 ${max}개까지라 ${picked.length}개만 넣었어요`);

    setBusy(true);
    const results = await Promise.allSettled(
      picked.map((a) =>
        uploadMobileQuestionFile({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType ?? undefined,
          file: a.file,
        })
      )
    );
    setBusy(false);
    const uploaded = results
      .filter((r): r is PromiseFulfilledResult<MobileAttachment> => r.status === 'fulfilled')
      .map(({ value: up }) => ({ mimeType: up.mimeType, name: up.name, sizeBytes: up.sizeBytes, url: up.url }));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      toast(
        failed.reason instanceof Error && failed.reason.message
          ? failed.reason.message
          : '파일을 첨부하지 못했어요',
        'error'
      );
    }
    if (uploaded.length > 0) onChange([...value, ...uploaded].slice(0, max));
  }

  return (
    <View style={{ gap: space.x2 }}>
      {label != null && (
        <View style={s.labelRow}>
          <Text variant="t5-medium" style={{ flex: 1 }}>
            {label}
            {indicator != null && (
              <Text variant="t4-regular" color="neutralSubtle">
                {'  '}
                {indicator}
              </Text>
            )}
          </Text>
          {value.length > 0 && (
            <Text variant="t3-regular" color="neutralSubtle" tabular>
              {value.length}/{max}
            </Text>
          )}
        </View>
      )}

      {value.map((att, i) => (
        <View key={`${att.url}-${i}`} style={s.file}>
          <IconTile icon={FileText} tone="gray" size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t4-medium" numberOfLines={1}>
              {att.name}
            </Text>
            {att.sizeBytes ? (
              <Text variant="t3-regular" color="neutralSubtle" tabular>
                {formatBytes(att.sizeBytes)}
              </Text>
            ) : null}
          </View>
          {!disabled && (
            <Press
              onPress={() => onChange(value.filter((_, j) => j !== i))}
              scale={0}
              pressedBg
              hitSlop={4}
              accessibilityLabel={`${att.name} 빼기`}
              style={s.remove}>
              <X color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
            </Press>
          )}
        </View>
      ))}

      <Button
        variant="weak"
        size="md"
        icon={Paperclip}
        loading={uploading}
        disabled={disabled || full}
        onPress={() => void pick()}
        accessibilityLabel="파일 추가"
        style={{ alignSelf: 'flex-start' }}>
        파일 추가
      </Button>

      {description != null && (
        <Text variant="t3-regular" color="neutralSubtle">
          {description}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingLeft: space.x3,
    paddingRight: space.x1,
    paddingVertical: space.x2_5,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
  },
  remove: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

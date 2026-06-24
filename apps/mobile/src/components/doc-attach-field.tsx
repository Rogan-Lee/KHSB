import * as DocumentPicker from 'expo-document-picker';
import { FileText, Paperclip, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, palette, radius, spacing, type } from '@/constants/theme';
import { MobileAttachment, uploadMobileQuestionFile } from '@/lib/mobile-api';

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 문서 첨부(PDF/HWP/DOC/PPT/XLSX 등) — 선택 즉시 업로드하고 MobileAttachment 로 보관. */
export function DocAttachField({
  value,
  onChange,
  max = 5,
}: {
  value: MobileAttachment[];
  onChange: (next: MobileAttachment[]) => void;
  max?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (res.canceled) return;
    setError('');
    setUploading(true);
    try {
      const uploaded: MobileAttachment[] = [];
      for (const a of res.assets) {
        uploaded.push(
          await uploadMobileQuestionFile({
            uri: a.uri,
            name: a.name,
            mimeType: a.mimeType ?? undefined,
            file: a.file,
          }),
        );
      }
      onChange([...value, ...uploaded].slice(0, max));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '파일을 첨부하지 못했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>파일 첨부</Text>
        <Text style={styles.count}>
          {value.length}/{max}
        </Text>
      </View>
      <Pressable
        disabled={uploading || value.length >= max}
        onPress={() => void pick()}
        style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.7 }]}>
        <Paperclip color={palette.blue50} size={16} />
        <Text style={styles.pickText}>
          {uploading ? '업로드 중…' : 'PDF·HWP·PPT·XLSX 등 첨부'}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {value.map((att, i) => (
        <View key={`${att.url}-${i}`} style={styles.chip}>
          <FileText color={palette.blue50} size={16} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.name}>
              {att.name}
            </Text>
            <Text style={styles.meta}>{formatSize(att.sizeBytes)}</Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => onChange(value.filter((_, j) => j !== i))}>
            <X color={colors.textAssistive} size={15} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...type.label2, color: colors.textNormal },
  count: { ...type.caption2, color: colors.textAssistive },
  pickBtn: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  pickText: { ...type.label2, color: palette.blue50 },
  error: { ...type.caption1, color: palette.red50 },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.blue5,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  name: { ...type.caption1, color: colors.textNormal, fontWeight: '700' },
  meta: { ...type.caption2, color: colors.textAssistive, marginTop: 1 },
});

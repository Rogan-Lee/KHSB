import * as DocumentPicker from 'expo-document-picker';
import { File, FilePlus2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

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

export function TaskFilePicker({
  assets,
  max = 5,
  onChange,
}: {
  assets: DocumentPicker.DocumentPickerAsset[];
  max?: number;
  onChange: (assets: DocumentPicker.DocumentPickerAsset[]) => void;
}) {
  const [error, setError] = useState('');

  async function pickFiles() {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ACCEPTED_TYPES,
    });
    if (result.canceled) return;
    const next = [...assets, ...result.assets].slice(0, max);
    if (next.some((asset) => (asset.size ?? 0) > 50 * 1024 * 1024)) {
      setError('파일은 개당 50MB 이하여야 합니다.');
      return;
    }
    onChange(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>제출 파일</Text>
        <Text style={styles.count}>
          {assets.length}/{max}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void pickFiles()}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
        <FilePlus2 color={colors.primary} size={19} />
        <Text style={styles.addButtonText}>파일 선택</Text>
      </Pressable>
      <Text style={styles.hint}>PDF, 이미지, DOCX, HWP, ZIP · 파일당 최대 50MB</Text>
      {assets.map((asset) => (
        <View key={`${asset.uri}-${asset.name}`} style={styles.fileRow}>
          <File color={colors.blue} size={18} />
          <View style={styles.fileText}>
            <Text numberOfLines={1} style={styles.fileName}>
              {asset.name}
            </Text>
            <Text style={styles.fileSize}>
              {asset.size ? `${(asset.size / 1024 / 1024).toFixed(1)}MB` : '크기 확인 중'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`${asset.name} 삭제`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChange(assets.filter((item) => item !== asset))}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
            <Trash2 color={colors.red} size={17} />
          </Pressable>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  count: {
    color: colors.muted,
    fontSize: 11,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  hint: {
    color: colors.muted,
    fontSize: 11,
  },
  fileRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  fileText: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  fileSize: {
    color: colors.muted,
    fontSize: 10,
  },
  remove: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  error: {
    color: colors.red,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

export function AttachmentPicker({
  assets,
  max = 5,
  onChange,
}: {
  assets: ImagePicker.ImagePickerAsset[];
  max?: number;
  onChange: (assets: ImagePicker.ImagePickerAsset[]) => void;
}) {
  const [error, setError] = useState('');

  async function pickFromLibrary() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.85,
      selectionLimit: Math.max(1, max - assets.length),
    });
    if (!result.canceled) {
      onChange([...assets, ...result.assets].slice(0, max));
    }
  }

  async function takePhoto() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('카메라 권한을 허용해야 사진을 촬영할 수 있습니다.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled) {
      onChange([...assets, result.assets[0]].slice(0, max));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>사진 첨부</Text>
        <Text style={styles.count}>
          {assets.length}/{max}
        </Text>
      </View>
      <View style={styles.actions}>
        <PickerButton icon={Camera} label="촬영" onPress={() => void takePhoto()} />
        <PickerButton
          icon={Images}
          label="사진 선택"
          onPress={() => void pickFromLibrary()}
        />
      </View>
      {assets.length > 0 ? (
        <View style={styles.previews}>
          {assets.map((asset) => (
            <View key={`${asset.assetId ?? asset.uri}-${asset.fileName ?? ''}`} style={styles.preview}>
              <Image contentFit="cover" source={{ uri: asset.uri }} style={styles.image} />
              <Pressable
                accessibilityLabel="첨부 사진 삭제"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onChange(assets.filter((item) => item !== asset))}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                <Trash2 color={colors.surface} size={14} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function PickerButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Camera;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pickerButton, pressed && styles.pressed]}>
      <Icon color={colors.primary} size={18} />
      <Text style={styles.pickerButtonText}>{label}</Text>
    </Pressable>
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pickerButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  pickerButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  previews: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preview: {
    borderRadius: 8,
    height: 76,
    overflow: 'hidden',
    position: 'relative',
    width: 76,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  remove: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 29, 0.82)',
    borderRadius: 8,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 26,
  },
  error: {
    color: colors.red,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});

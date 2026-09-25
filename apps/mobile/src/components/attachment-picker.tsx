import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, Play, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Press, Text, color, radius, space, toast } from '@/design';

const TILE = 76;

function assetKey(asset: ImagePicker.ImagePickerAsset) {
  return `${asset.assetId ?? asset.uri}-${asset.fileName ?? ''}`;
}

function formatDuration(ms?: number | null) {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/**
 * 사진(·영상) 첨부 — 웹 학생 포털 PhotoUploader(portal) 와 같은 SEED 썸네일 줄.
 * [촬영] [앨범 n/max] + 고른 사진 썸네일(× 로 빼기). 기기에서 고르기만 하고 업로드는 호출부가 한다
 * (전송 버튼을 누른 뒤 검증 → 업로드).
 */
export function AttachmentPicker({
  assets,
  max = 5,
  onChange,
  label = '사진 첨부',
  indicator,
  description,
  allowVideo = false,
  disabled = false,
}: {
  assets: ImagePicker.ImagePickerAsset[];
  max?: number;
  onChange: (assets: ImagePicker.ImagePickerAsset[]) => void;
  /** 위 라벨 (null 이면 숨김) */
  label?: string | null;
  /** 라벨 옆 보조 표시 (예: "선택") */
  indicator?: string;
  /** 아래 설명 */
  description?: string;
  /** 영상도 고를 수 있게 (질문 등 document 컨텍스트 전용 — 멘토링 사진엔 쓰지 말 것) */
  allowVideo?: boolean;
  disabled?: boolean;
}) {
  const full = assets.length >= max;
  const mediaTypes: ImagePicker.MediaType[] = allowVideo ? ['images', 'videos'] : ['images'];

  async function pickFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes,
        quality: 0.6,
        selectionLimit: Math.max(1, max - assets.length),
      });
      if (result.canceled) return;
      const merged = [...assets, ...result.assets];
      if (merged.length > max) toast(`최대 ${max}개까지 첨부할 수 있어요`);
      onChange(merged.slice(0, max));
    } catch {
      toast('사진을 불러오지 못했어요', 'error');
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toast('카메라 권한을 허용하면 바로 찍어서 올릴 수 있어요', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.6 });
      if (result.canceled || !result.assets[0]) return;
      onChange([...assets, result.assets[0]].slice(0, max));
    } catch {
      toast('카메라를 열지 못했어요', 'error');
    }
  }

  const addDisabled = disabled || full;

  return (
    <View style={{ gap: space.x2 }}>
      {label != null && (
        <Text variant="t5-medium">
          {label}
          {indicator != null && (
            <Text variant="t4-regular" color="neutralSubtle">
              {'  '}
              {indicator}
            </Text>
          )}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={s.scroller}
        contentContainerStyle={s.row}>
        <AddTile
          icon={Camera}
          label="촬영"
          onPress={() => void takePhoto()}
          disabled={addDisabled}
          a11y={allowVideo ? '카메라로 찍기' : '사진 찍기'}
        />
        <AddTile
          icon={ImagePlus}
          label={
            <Text variant="t3-medium" color="neutralSubtle" tabular>
              <Text variant="t3-bold" color={assets.length > 0 ? 'brand' : 'neutralSubtle'}>
                {assets.length}
              </Text>
              /{max}
            </Text>
          }
          onPress={() => void pickFromLibrary()}
          disabled={addDisabled}
          a11y={`앨범에서 고르기, ${assets.length}/${max}`}
        />
        {assets.map((asset) => {
          const video = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
          return (
            <View key={assetKey(asset)} style={s.tile}>
              {video ? (
                <View style={[StyleSheet.absoluteFill, s.video]}>
                  <Play color={color.palette.staticWhite} size={20} fill={color.palette.staticWhite} />
                  {asset.duration ? (
                    <Text variant="t1-medium" color="staticWhite" tabular style={s.duration}>
                      {formatDuration(asset.duration)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Image contentFit="cover" source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} />
              )}
              {!disabled && (
                <Press
                  accessibilityLabel={video ? '첨부 영상 빼기' : '첨부 사진 빼기'}
                  hitSlop={8}
                  scale={0}
                  onPress={() => onChange(assets.filter((item) => item !== asset))}
                  style={s.remove}>
                  <X color={color.palette.staticWhite} size={12} strokeWidth={3} />
                </Press>
              )}
            </View>
          );
        })}
      </ScrollView>
      {description != null && (
        <Text variant="t3-regular" color="neutralSubtle">
          {description}
        </Text>
      )}
    </View>
  );
}

function AddTile({
  icon: Icon,
  label,
  onPress,
  disabled,
  a11y,
}: {
  icon: typeof Camera;
  label: ReactNode;
  onPress: () => void;
  disabled: boolean;
  a11y: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scale={0.96}
      pressedBg={color.bg.neutralWeakPressed}
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={[s.tile, s.add, disabled && { opacity: 0.5 }]}>
      <Icon color={color.fg.neutralMuted} size={24} strokeWidth={2} />
      {typeof label === 'string' ? (
        <Text variant="t3-medium" color="neutralSubtle">
          {label}
        </Text>
      ) : (
        label
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  // 카드 패딩 밖까지 가로 스크롤 되도록 (웹 -mx-4 px-x4)
  scroller: { marginHorizontal: -space.x4 },
  row: { gap: space.x2, paddingHorizontal: space.x4, paddingVertical: space.x0_5 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.r3_5,
    overflow: 'hidden',
    backgroundColor: color.bg.neutralWeak,
  },
  add: { alignItems: 'center', justifyContent: 'center', gap: space.x1 },
  video: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.neutralSolid },
  duration: { position: 'absolute', left: space.x1_5, bottom: space.x1 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.overlay,
  },
});

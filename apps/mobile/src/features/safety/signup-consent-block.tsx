// 초대 가입 화면의 동의 — 전체 동의 + 항목별 체크, "보기"로 요약(BottomSheet)과 전문 링크.
// 항목·문구는 ./signup-consent (웹 src/lib/privacy/signup-consent.ts 복사본).

import { Check, ExternalLink } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheet, Button, Press, Text, color, radius, space } from '@/design';
import { openHelpPage } from '@/lib/support';

import {
  signupConsentItems,
  type SignupAudience,
  type SignupConsentItem,
  type SignupConsentKey,
} from './signup-consent';

export function SignupConsentBlock({
  audience,
  under14,
  checked,
  onChange,
  disabled,
}: {
  audience: SignupAudience;
  under14: boolean;
  checked: ReadonlySet<SignupConsentKey>;
  onChange: (next: Set<SignupConsentKey>) => void;
  disabled?: boolean;
}) {
  const items = signupConsentItems(audience, { under14 });
  const allChecked = items.every((item) => checked.has(item.key));
  // 닫히는 동안에도 내용이 남아 있게 열림과 항목을 따로 둔다
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewing, setViewing] = useState<SignupConsentItem | null>(null);
  const doc = viewing?.doc;

  const toggle = (key: SignupConsentKey) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <View>
      {/* 눌림 배경이 회색 바탕을 덮지 않게 바탕은 바깥 View 에 */}
      <View style={s.allRow}>
        <CheckRow
          checked={allChecked}
          disabled={disabled}
          onPress={() => onChange(allChecked ? new Set() : new Set(items.map((item) => item.key)))}
          accessibilityLabel="전체 동의">
          <Text variant="t5-bold" style={{ flex: 1 }}>
            전체 동의
          </Text>
        </CheckRow>
      </View>
      {items.map((item) => {
        const tag = item.required ? '필수' : '선택';
        return (
          <View key={item.key} style={s.itemRow}>
            <CheckRow
              checked={checked.has(item.key)}
              disabled={disabled}
              onPress={() => toggle(item.key)}
              accessibilityLabel={`${tag}, ${item.label}`}
              style={{ flex: 1 }}>
              <Text variant="t4-regular" style={{ flex: 1 }}>
                <Text variant="t4-medium" color={item.required ? 'brand' : 'neutralSubtle'}>
                  {`[${tag}]`}
                </Text>{' '}
                {item.label}
              </Text>
            </CheckRow>
            <Press
              onPress={() => {
                setViewing(item);
                setSheetOpen(true);
              }}
              scale={0}
              pressedBg
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 내용 보기`}
              style={s.view}>
              <Text variant="t4-medium" color="neutralSubtle" style={{ textDecorationLine: 'underline' }}>
                보기
              </Text>
            </Press>
          </View>
        );
      })}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={viewing?.label}
        footer={
          <>
            {doc && (
              <Button
                variant="gray"
                size="xl"
                iconRight={ExternalLink}
                style={{ flex: 1 }}
                accessibilityLabel={doc.label}
                onPress={() => void openHelpPage(doc.url)}>
                전문 보기
              </Button>
            )}
            <Button variant="primary" size="xl" style={{ flex: 1 }} onPress={() => setSheetOpen(false)}>
              닫기
            </Button>
          </>
        }>
        <View style={{ gap: space.x4 }}>
          {viewing?.rows.map((row) => (
            <View key={row.label} style={{ gap: space.x1 }}>
              <Text variant="t4-medium" color="neutralSubtle">
                {row.label}
              </Text>
              {/* strong: 보유 기간 등 눈에 띄게 알려야 하는 내용 (굵게 + 밑줄) */}
              <Text
                variant={row.strong ? 't5-bold' : 't5-regular'}
                style={row.strong ? { textDecorationLine: 'underline' } : undefined}>
                {row.text}
              </Text>
            </View>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

/** 행 전체를 누르는 체크박스 (높이 44 이상) */
function CheckRow({
  checked,
  disabled,
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scale={0}
      pressedBg
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      style={[s.check, style]}>
      <View style={[s.box, checked && s.boxOn]}>
        {checked && <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />}
      </View>
      {children}
    </Press>
  );
}

const s = StyleSheet.create({
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 44,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    borderRadius: radius.r2,
  },
  allRow: { backgroundColor: color.bg.layerFill, borderRadius: radius.r3, marginBottom: space.x1 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  view: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x2,
    borderRadius: radius.r2,
  },
  // safety-menu 신고 시트의 체크박스와 같은 모양
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.r1_5,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
});

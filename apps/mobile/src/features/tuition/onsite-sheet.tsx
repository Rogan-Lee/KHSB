import { ChevronRight, CreditCard, WalletCards, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, color, IconTile, Markdown, Press, radius, space, Text, type Tone } from '@/design';
import type { OnsiteRequestMethod } from '@/lib/api/parent-tuition';

const OPTIONS: { method: OnsiteRequestMethod; label: string; description: string; icon: LucideIcon; tone: Tone }[] = [
  {
    method: 'LOCAL_CURRENCY',
    label: '지역화폐',
    description: '지역화폐 카드·앱으로 독서실에서 결제',
    icon: WalletCards,
    tone: 'ok',
  },
  {
    method: 'ONSITE_CARD',
    label: '현장 카드',
    description: '독서실 단말기에서 카드로 결제',
    icon: CreditCard,
    tone: 'info',
  },
];

/**
 * 현장 결제 신청 시트 — 운영진이 적어 둔 현장 결제 안내 + 결제 수단 고르기.
 * 고르면 부모(useTuitionActions.requestOnsite)가 확인 대화상자를 띄우고 신청한다.
 */
export function OnsiteSheet({
  open,
  onClose,
  guideText,
  busy,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  guideText: string | null | undefined;
  /** 신청 요청이 진행 중 */
  busy: boolean;
  onChoose: (method: OnsiteRequestMethod) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={() => !busy && onClose()}
      title="현장 결제 신청"
      description="독서실에서 결제하실 방법을 골라 주세요. 신청해 두면 결제하신 뒤 운영진이 확인해 드려요."
      footer={
        <View style={{ flex: 1 }}>
          <Button variant="gray" size="xl" block disabled={busy} onPress={onClose}>
            닫기
          </Button>
        </View>
      }>
      {guideText?.trim() ? (
        <View style={s.guide}>
          <Markdown source={guideText} size="sm" />
        </View>
      ) : null}
      <View style={{ marginHorizontal: -space.x3 }}>
        {OPTIONS.map((o) => (
          <Press
            key={o.method}
            scale={0}
            pressedBg
            disabled={busy}
            onPress={() => onChoose(o.method)}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}로 신청, ${o.description}`}
            accessibilityState={{ disabled: busy }}
            style={[s.row, busy && { opacity: 0.5 }]}>
            <IconTile icon={o.icon} tone={o.tone} size={44} round />
            <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
              <Text variant="t5-bold">{o.label}</Text>
              <Text variant="t4-regular" color="neutralSubtle">
                {o.description}
              </Text>
            </View>
            <ChevronRight color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
          </Press>
        ))}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  guide: { backgroundColor: color.bg.layerFill, borderRadius: radius.r4, padding: space.x4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 64,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    borderRadius: radius.r4,
  },
});

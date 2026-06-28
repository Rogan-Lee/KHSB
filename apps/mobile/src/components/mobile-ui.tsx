import { CircleAlert, ChevronRight, Inbox, LucideIcon } from 'lucide-react-native';
import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, shadow, spacing, Tone, tones, type } from '@/constants/theme';

// ──────────────────────────────────────────────────────────
// Section title
// ──────────────────────────────────────────────────────────
export function SectionTitle({ action, children }: PropsWithChildren<{ action?: ReactNode }>) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

// ──────────────────────────────────────────────────────────
// Card — white, hairline border, soft elevation, radius 16
// ──────────────────────────────────────────────────────────
export function Card({
  children,
  padded = true,
  style,
}: PropsWithChildren<{ padded?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

// ──────────────────────────────────────────────────────────
// Badge — status-tinted pill
// ──────────────────────────────────────────────────────────
export function Badge({ children, tone = 'primary' }: PropsWithChildren<{ tone?: Tone }>) {
  return (
    <View style={[styles.badge, { backgroundColor: tones[tone].background }]}>
      <Text style={[styles.badgeText, { color: tones[tone].foreground }]}>{children}</Text>
    </View>
  );
}

// status dot
export function Dot({ color = colors.primary, size = 7 }: { color?: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// ──────────────────────────────────────────────────────────
// Avatar — initials circle, optional online indicator
// ──────────────────────────────────────────────────────────
export function Avatar({
  label,
  size = 34,
  online,
  tone,
}: {
  label: string;
  size?: number;
  online?: boolean;
  tone?: { background: string; foreground: string };
}) {
  const bg = tone?.background ?? colors.fillStrong;
  const fg = tone?.foreground ?? colors.textAlternative;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ]}>
        <Text style={{ color: fg, fontWeight: '600', fontSize: size * 0.38 }}>{label}</Text>
      </View>
      {online ? <View style={styles.avatarOnline} /> : null}
    </View>
  );
}

// ──────────────────────────────────────────────────────────
// StatTile — metric tile. variant: plain (bordered white) | tint
// ──────────────────────────────────────────────────────────
export function StatTile({
  caption,
  value,
  valueColor,
  delta,
  tone,
  variant = 'plain',
}: {
  caption: string;
  value: string;
  valueColor?: string;
  delta?: string;
  tone?: Tone;
  variant?: 'plain' | 'tint';
}) {
  const tint = tone ? tones[tone] : undefined;
  const bg = variant === 'tint' ? tint?.background ?? colors.bgSunken : colors.surface;
  const vColor = valueColor ?? tint?.foreground ?? colors.textNormal;
  return (
    <View style={[styles.statTile, variant === 'plain' ? styles.statTilePlain : { backgroundColor: bg }]}>
      <Text style={[styles.statCaption, variant === 'tint' && tint ? { color: tint.foreground, opacity: 0.75 } : null]}>
        {caption}
      </Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: vColor }]}>{value}</Text>
        {delta ? <Text style={styles.statDelta}>{delta}</Text> : null}
      </View>
    </View>
  );
}

// legacy alias — kept for existing screens
export function StatCard({ caption, tone, value }: { caption: string; tone: Tone; value: string }) {
  return <StatTile caption={caption} value={value} tone={tone} variant="tint" />;
}

// ──────────────────────────────────────────────────────────
// Banner — icon + text + trailing value (magic-link / alert strips)
// ──────────────────────────────────────────────────────────
export function Banner({
  icon: Icon,
  text,
  right,
  tone = 'primary',
  onPress,
}: {
  icon?: LucideIcon;
  text: string;
  right?: ReactNode;
  tone?: Tone;
  onPress?: PressableProps['onPress'];
}) {
  const t = tones[tone];
  const body = (
    <>
      {Icon ? <Icon color={t.foreground} size={18} strokeWidth={2.2} /> : null}
      <Text style={[styles.bannerText, { color: t.foreground }]} numberOfLines={1}>
        {text}
      </Text>
      {typeof right === 'string' ? (
        <Text style={[styles.bannerRight, { color: t.foreground }]}>{right}</Text>
      ) : (
        right
      )}
    </>
  );
  if (!onPress) return <View style={[styles.banner, { backgroundColor: t.background }]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, { backgroundColor: t.background }, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────
// Segmented — filter chip row
// ──────────────────────────────────────────────────────────
export function Segmented({
  options,
  value,
  onChange,
  accentColor,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        const activeBg = accentColor ?? colors.inkCard;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.chip,
              active ? { backgroundColor: activeBg, borderColor: activeBg } : styles.chipIdle,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ──────────────────────────────────────────────────────────
// ListRow — leading node + title/caption + trailing
// ──────────────────────────────────────────────────────────
export function ListRow({
  leading,
  title,
  caption,
  right,
  onPress,
  style,
}: {
  leading?: ReactNode;
  title: ReactNode;
  caption?: ReactNode;
  right?: ReactNode;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      {leading}
      <View style={styles.listText}>
        {typeof title === 'string' ? <Text style={styles.listTitle}>{title}</Text> : title}
        {typeof caption === 'string' ? (
          <Text style={styles.listCaption}>{caption}</Text>
        ) : (
          caption
        )}
      </View>
      {typeof right === 'string' ? <Text style={styles.listRight}>{right}</Text> : right}
      {onPress && !right ? <ChevronRight color={colors.textAssistive} size={18} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.listRow, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────
// HubGrid / HubTile — 홈을 기능 허브로: 아이콘 타일 격자
// ──────────────────────────────────────────────────────────
export function HubGrid({ children }: PropsWithChildren) {
  return <View style={styles.hubGrid}>{children}</View>;
}

export function HubTile({
  icon: Icon,
  label,
  badge,
  tone = 'primary',
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string | number;
  tone?: Tone;
  onPress?: PressableProps['onPress'];
}) {
  const t = tones[tone];
  const showBadge = badge !== undefined && badge !== 0 && badge !== '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.hubTile, pressed && styles.pressed]}>
      <View style={[styles.hubIcon, { backgroundColor: t.background }]}>
        <Icon color={t.foreground} size={22} strokeWidth={2.2} />
        {showBadge ? (
          <View style={styles.hubBadge}>
            <Text style={styles.hubBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hubLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────
// ActionRow — icon-led navigation row (kept; restyled)
// ──────────────────────────────────────────────────────────
export function ActionRow({
  caption,
  icon: Icon,
  onPress,
  right,
  title,
  tone = 'primary',
}: {
  caption?: string;
  icon: LucideIcon;
  onPress?: PressableProps['onPress'];
  right?: ReactNode;
  title: string;
  tone?: Tone;
}) {
  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: tones[tone].background }]}>
        <Icon color={tones[tone].foreground} size={20} strokeWidth={2.2} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        {caption ? <Text style={styles.actionCaption}>{caption}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight color={colors.textAssistive} size={18} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.actionRow}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────
// Buttons
// ──────────────────────────────────────────────────────────
export function PrimaryButton({
  children,
  disabled,
  onPress,
  variant = 'primary',
  size = 'lg',
  accentColor,
}: PropsWithChildren<{
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'md' | 'lg';
  accentColor?: string;
}>) {
  const accent = accentColor ?? colors.primary;
  const bg =
    variant === 'primary'
      ? accent
      : variant === 'danger'
        ? colors.negative
        : variant === 'secondary'
          ? colors.primarySurface
          : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger'
      ? colors.textOncolor
      : variant === 'secondary'
        ? accent
        : accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && styles.buttonMd,
        { backgroundColor: bg },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.lineStrong },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────
// States
// ──────────────────────────────────────────────────────────
export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.state}>
      <CircleAlert color={colors.negative} size={24} />
      <Text style={styles.stateTitle}>데이터를 불러오지 못했습니다</Text>
      <Text style={styles.stateText}>{message}</Text>
      <PrimaryButton onPress={onRetry} variant="secondary" size="md">
        다시 시도
      </PrimaryButton>
    </View>
  );
}

export function EmptyState({
  message,
  title = '표시할 내용이 없습니다',
}: {
  message?: string;
  title?: string;
}) {
  return (
    <View style={styles.state}>
      <Inbox color={colors.textAssistive} size={24} />
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateText}>{message}</Text> : null}
    </View>
  );
}

const asText = (t: (typeof type)[keyof typeof type]): TextStyle => t as TextStyle;

const styles = StyleSheet.create({
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...asText(type.heading2), color: colors.textNormal },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.lineNeutral,
    borderRadius: radius.xxl,
    borderWidth: 1,
    ...shadow.card,
  },
  cardPadded: { padding: 15 },
  divider: { height: 1, backgroundColor: colors.lineAlt, marginVertical: spacing.md },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.md2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { ...asText(type.caption2), fontWeight: '700' },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarOnline: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.positive,
    borderWidth: 2,
    borderColor: colors.surface,
  },

  statTile: {
    flex: 1,
    borderRadius: radius.xl,
    padding: 14,
    gap: 6,
    justifyContent: 'center',
  },
  statTilePlain: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
  },
  statCaption: { ...asText(type.caption1), color: colors.textAssistive },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statDelta: { ...asText(type.caption1), color: colors.positive, fontWeight: '700' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: radius.xl,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  bannerText: { ...asText(type.body3), fontWeight: '500', flex: 1 },
  bannerRight: { ...asText(type.label2), fontWeight: '700' },

  segmented: { flexDirection: 'row', gap: 7 },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.lineNeutral },
  chipText: { ...asText(type.caption1), fontWeight: '600' },
  chipTextActive: { color: colors.textOncolor },
  chipTextIdle: { color: colors.textAlternative },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  listText: { flex: 1, gap: 3 },
  listTitle: { ...asText(type.label1), color: colors.textNormal },
  listCaption: { ...asText(type.caption1), color: colors.textAssistive },
  listRight: { ...asText(type.label2), color: colors.textAlternative },

  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.lg,
    columnGap: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    borderRadius: radius.xxl,
    paddingVertical: spacing.lg,
    ...shadow.card,
  },
  hubTile: {
    width: '25%',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  hubIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.negative,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubBadgeText: { color: colors.textOncolor, fontSize: 10, fontWeight: '800' },
  hubLabel: { ...type.caption1, color: colors.textNormal, fontWeight: '500' },

  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { ...asText(type.label1), color: colors.textNormal },
  actionCaption: { ...asText(type.caption1), color: colors.textAssistive },

  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  buttonMd: { minHeight: 44 },
  buttonText: { ...asText(type.label1), fontWeight: '700', color: colors.textOncolor },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },

  state: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineNeutral,
    borderRadius: radius.xxl,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  stateTitle: { ...asText(type.label1), color: colors.textNormal, textAlign: 'center' },
  stateText: { ...asText(type.caption1), color: colors.textAssistive, textAlign: 'center' },
});

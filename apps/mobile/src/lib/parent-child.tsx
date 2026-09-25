import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, UserPlus } from 'lucide-react-native';
import { Fragment, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Avatar,
  BottomSheet,
  Divider,
  IconTile,
  Press,
  Text,
  color,
  radius,
  space,
} from '@/design';
import { useSession, type ParentChild } from '@/lib/session';

/**
 * 학부모 — 선택된 자녀(전역).
 *
 * Provider 없이 동작하는 모듈 단위 스토어(useSyncExternalStore) + SecureStore(웹은 localStorage) 영속.
 *   const { children, selected, select } = useParentChild();
 * 저장된 자녀가 목록에 없으면(연결 해제·다른 계정) 첫째 자녀로 폴백한다.
 * 화면 헤더에는 <ChildSwitcher /> (알약 → 자녀 선택 시트), 본문 안 칩 전환은 <ChildChips />.
 */

const STORAGE_KEY = 'studyroom.parent.selectedChild';

function readStored(): string | null {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return SecureStore.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, id);
      return;
    }
    void SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => undefined);
  } catch {
    // 저장 실패해도 이번 실행 동안은 메모리 값으로 동작
  }
}

// undefined = 아직 저장소를 읽지 않음
let selectedId: string | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): string | null {
  if (selectedId === undefined) selectedId = readStored();
  return selectedId;
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 컴포넌트 밖에서도 자녀 선택 (연결 직후 새 자녀로 전환 등) */
export function selectParentChild(id: string) {
  if (selectedId === id) return;
  selectedId = id;
  writeStored(id);
  listeners.forEach((fn) => fn());
}

export type ParentChildState = {
  /** 연결된 자녀 목록 (세션 기준, 연결 순) */
  children: ParentChild[];
  /** 현재 선택된 자녀 (자녀가 없으면 null) */
  selected: ParentChild | null;
  selectedId: string | null;
  select: (id: string) => void;
  hasMultiple: boolean;
};

export function useParentChild(): ParentChildState {
  const { session } = useSession();
  const kids = session?.role === 'parent' ? (session.children ?? []) : [];
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected = kids.find((k) => k.id === stored) ?? kids[0] ?? null;
  return {
    children: kids,
    selected,
    selectedId: selected?.id ?? null,
    select: selectParentChild,
    hasMultiple: kids.length > 1,
  };
}

/** 호환용 — 스토어가 모듈 단위라 감쌀 필요는 없다. */
export function ParentChildProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** "고2 · 12번 좌석" */
export function childMeta(child: Pick<ParentChild, 'grade' | 'seat'>) {
  return [child.grade, child.seat ? `${child.seat}번 좌석` : null].filter(Boolean).join(' · ');
}

// ─── 헤더 알약 + 자녀 선택 시트 ───────────────────────────────────────

const LINK_CHILD_ROUTE = '/(parent)/link-child' as const;

/**
 * 헤더 오른쪽 자녀 알약 (아바타 + 이름 + ▾). 누르면 자녀 선택 시트.
 * 자녀가 한 명이어도 시트에서 "다른 자녀 연결하기"로 갈 수 있게 누를 수 있다.
 */
export function ChildSwitcher({ allowLink = true }: { allowLink?: boolean }) {
  const { children: kids, selected } = useParentChild();
  const [open, setOpen] = useState(false);
  if (!selected) return null;

  return (
    <>
      <Press
        onPress={() => setOpen(true)}
        pressedBg={color.bg.neutralWeakPressed}
        hitSlop={6}
        accessibilityLabel={`자녀 선택, 지금 ${selected.name}`}
        accessibilityHint="자녀를 바꾸거나 추가로 연결할 수 있어요"
        style={s.pill}>
        <Avatar name={selected.name} size={28} />
        <Text variant="t4-bold" numberOfLines={1} style={{ flexShrink: 1, maxWidth: 96 }}>
          {selected.name}
        </Text>
        <ChevronDown color={color.fg.neutralMuted} size={16} strokeWidth={2.2} />
      </Press>
      <ChildPickerSheet
        open={open}
        onClose={() => setOpen(false)}
        allowLink={allowLink}
        kids={kids}
        selectedId={selected.id}
      />
    </>
  );
}

function ChildPickerSheet({
  open,
  onClose,
  allowLink,
  kids,
  selectedId: current,
}: {
  open: boolean;
  onClose: () => void;
  allowLink: boolean;
  kids: ParentChild[];
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="자녀 선택"
      description={kids.length > 1 ? '어떤 자녀의 기록을 볼까요?' : undefined}>
      <View style={{ marginHorizontal: -space.x3 }}>
        {kids.map((kid) => {
          const on = kid.id === current;
          return (
            <Press
              key={kid.id}
              scale={0}
              pressedBg
              onPress={() => {
                selectParentChild(kid.id);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${kid.name}, ${childMeta(kid)}`}
              style={s.sheetRow}>
              <Avatar name={kid.name} size={44} />
              <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                <Text variant="t6-bold" numberOfLines={1}>
                  {kid.name}
                </Text>
                <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                  {childMeta(kid)}
                </Text>
              </View>
              {on && <Check color={color.fg.brand} size={24} strokeWidth={2.4} />}
            </Press>
          );
        })}
        {allowLink && (
          <Fragment>
            <Divider inset={space.x3} style={{ marginVertical: space.x1 }} />
            <Press
              scale={0}
              pressedBg
              onPress={() => {
                onClose();
                router.push(LINK_CHILD_ROUTE);
              }}
              accessibilityLabel="다른 자녀 연결하기"
              style={s.sheetRow}>
              <IconTile icon={UserPlus} tone="gray" size={44} round />
              <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                <Text variant="t5-bold">다른 자녀 연결하기</Text>
                <Text variant="t4-regular" color="neutralSubtle">
                  독서실에서 받은 초대 코드가 필요해요
                </Text>
              </View>
            </Press>
          </Fragment>
        )}
      </View>
    </BottomSheet>
  );
}

// ─── 본문 칩 전환 (자녀가 둘 이상일 때만) ─────────────────────────────

/** 본문 상단에 놓는 자녀 칩 줄 — 자녀가 한 명이면 아무것도 그리지 않는다. */
export function ChildChips() {
  const { children: kids, selectedId: current, hasMultiple } = useParentChild();
  if (!hasMultiple) return null;
  return (
    <View style={s.chips} accessibilityRole="tablist">
      {kids.map((kid) => {
        const on = kid.id === current;
        return (
          <Press
            key={kid.id}
            onPress={() => selectParentChild(kid.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={kid.name}
            pressedBg={on ? color.bg.neutralInvertedPressed : color.bg.transparentPressed}
            style={[
              s.chip,
              {
                backgroundColor: on ? color.bg.neutralInverted : color.bg.layerDefault,
                borderColor: on ? color.bg.neutralInverted : color.stroke.neutralWeak,
              },
            ]}>
            <Avatar name={kid.name} size={28} />
            <Text variant="t5-bold" color={on ? 'neutralInverted' : 'neutral'} numberOfLines={1}>
              {kid.name}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1_5,
    height: 40,
    paddingLeft: space.x1_5,
    paddingRight: space.x2_5,
    marginRight: space.x1,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralWeak,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 64,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    borderRadius: radius.r4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    height: 44,
    paddingLeft: space.x1_5,
    paddingRight: space.x4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});

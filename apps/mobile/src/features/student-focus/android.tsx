import { Check } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  Button,
  color,
  FullSheet,
  ListRow,
  LoadingState,
  Press,
  radius,
  Section,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';

import type { FocusGuardApp } from '../../../modules/focus-guard';
import { ANDROID_GUARD } from './focus';

// 안드로이드 집중 모드 화면 조각 — 권한 두 개 받기 · 잠글 앱 고르기. 공용 흐름은 app/(student)/focus.tsx.

/** 권한 안내 — 설정 화면 두 곳에서 학생이 직접 켠다 (돌아오면 useFocusMode 가 다시 읽음) */
export function AndroidPermissionSteps({
  usageAccess,
  overlay,
  battery,
}: {
  usageAccess: boolean;
  overlay: boolean;
  battery: boolean;
}) {
  return (
    <Section title="공부하는 동안 딴짓 앱을 잠가요">
      <Stack>
        <Text variant="t4-regular" color="neutralSubtle">
          내가 고른 앱을 열면 내가 끝낼 때까지 ‘집중 모드 중이에요’ 화면이 덮어요. 잠글 앱을 바꾸거나 끝내려면 내가 정한
          잠금 비밀번호가 필요해요. 2시간이 지나면 아직 공부 중인지 묻고, 3시간까지 답이 없으면 저절로 풀려요.{'\n\n'}•
          어떤 앱을 골랐는지, 언제 무엇을 쓰는지는 이 기기 밖으로 나가지 않아요. 선생님도 볼 수 없어요.{'\n'}• 잠금
          비밀번호를 잊으면 강한선배 로그인 비밀번호로 초기화할 수 있어요.{'\n'}• 설정에서 아래 1·2번 권한을 언제든 끌 수
          있고, 끄면 잠금과 비밀번호가 모두 풀려요.
        </Text>
        <Step
          n={1}
          title="사용 정보 접근 허용"
          description="지금 어떤 앱이 열렸는지 알아야 잠글 수 있어요. 목록에서 강한선배를 찾아 켜 주세요."
          done={usageAccess}
          onPress={() => ANDROID_GUARD?.openUsageAccessSettings()}
        />
        <Step
          n={2}
          title="다른 앱 위에 표시 허용"
          description="잠근 앱 위에 안내 화면을 띄우는 데 필요해요."
          done={overlay}
          onPress={() => ANDROID_GUARD?.openOverlaySettings()}
        />
        <Step
          n={3}
          title="배터리 사용 ‘제한 없음’"
          description="삼성 등 일부 기기는 배터리를 아끼려고 집중 모드를 멈춰요. 앱 정보에서 ‘배터리’를 누르고 ‘제한 없음’을 골라 주세요."
          done={battery}
          onPress={() => ANDROID_GUARD?.openBatterySettings()}
        />
      </Stack>
    </Section>
  );
}

function Step({
  n,
  title,
  description,
  done,
  onPress,
}: {
  n: number;
  title: string;
  description: string;
  done: boolean;
  onPress: () => void;
}) {
  return (
    <View style={s.step}>
      <View style={[s.stepNum, done && { backgroundColor: color.bg.positiveSolid }]}>
        {done ? (
          <Check color={color.palette.staticWhite} size={14} strokeWidth={3} />
        ) : (
          <Text variant="t3-bold" color="neutralInverted">
            {n}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text variant="t5-bold">{title}</Text>
        <Text variant="t3-regular" color="neutralSubtle">
          {description}
        </Text>
        {!done && (
          <Button size="sm" variant="weak" onPress={onPress} style={{ alignSelf: 'flex-start', marginTop: space.x1 }}>
            설정 열기
          </Button>
        )}
      </View>
    </View>
  );
}

/** 잠글 앱 고르기 — 홈 화면 아이콘이 있는 앱 (이 앱·설정·전화는 목록에 없음). 열 때만 마운트한다 */
export function AndroidAppPicker({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [initial] = useState(() => new Set(ANDROID_GUARD?.getBlocked() ?? []));
  const [apps, setApps] = useState<FocusGuardApp[] | null>(null);
  const [picked, setPicked] = useState(initial);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    ANDROID_GUARD?.getApps()
      .then((list) => {
        // 이미 고른 앱을 위로 — 열 때 한 번만 정렬 (고를 때마다 순서가 바뀌면 손가락 아래가 움직인다)
        if (alive) setApps([...list].sort((a, b) => Number(initial.has(b.packageName)) - Number(initial.has(a.packageName))));
      })
      .catch(() => alive && toast('앱 목록을 불러오지 못했어요', 'error'));
    return () => {
      alive = false;
    };
  }, [initial]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (apps ?? []).filter((a) => a.label.toLowerCase().includes(q)) : (apps ?? []);
  }, [apps, query]);

  const toggle = (pkg: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });

  return (
    <FullSheet
      visible
      onClose={onClose}
      title="잠글 앱"
      subtitle="집중 모드 동안 열면 안내 화면이 덮어요. 강한선배·설정·전화 앱은 잠글 수 없어요."
      footer={
        <Button
          size="xl"
          style={{ flex: 1 }}
          onPress={() => {
            ANDROID_GUARD?.setBlocked([...picked]);
            onSaved();
            onClose();
          }}>
          {picked.size > 0 ? `${picked.size}개 저장` : '저장'}
        </Button>
      }>
      <TextField value={query} onChangeText={setQuery} placeholder="앱 이름으로 찾기" accessibilityLabel="앱 찾기" />
      {apps == null ? (
        <LoadingState label="앱 목록을 불러오는 중" />
      ) : (
        <Section flush>
          {shown.map((app) => {
            const on = picked.has(app.packageName);
            return (
              <ListRow
                key={app.packageName}
                onPress={() => toggle(app.packageName)}
                leading={
                  app.icon ? (
                    <Image source={{ uri: `data:image/png;base64,${app.icon}` }} style={s.icon} />
                  ) : (
                    <View style={[s.icon, { backgroundColor: color.bg.neutralWeak }]} />
                  )
                }
                title={app.label}
                trailing={
                  <Press
                    onPress={() => toggle(app.packageName)}
                    scale={0}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={app.label}>
                    <View style={[s.box, on && s.boxOn]}>
                      {on && <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />}
                    </View>
                  </Press>
                }
                chevron={false}
              />
            );
          })}
        </Section>
      )}
    </FullSheet>
  );
}

const s = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.x3, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralInverted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  icon: { width: 36, height: 36, borderRadius: radius.r2 },
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

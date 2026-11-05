import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import * as DA from 'react-native-device-activity';

import {
  BottomSheet,
  Button,
  IconTile,
  ListRow,
  Notice,
  Screen,
  Section,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import {
  clock,
  FOCUS_SUPPORTED,
  keepFocus,
  resetPinWithLoginPassword,
  savePin,
  SELECTION_ID,
  startFocus,
  stopFocus,
  useFocusMode,
} from '@/features/student-focus/focus';
import { SubmitBlock } from '@/features/student-life/ui';

// 집중 모드 설정 — 권한 허용 → 잠글 앱·사이트 → 잠금 비밀번호 → 시작. 끝낼 때까지 잠기고,
// 2시간이 지나면 계속할지 묻고 3시간까지 답이 없으면 풀린다. 동작·약관 메모는 features/student-focus/focus.ts.
// 잠글 앱 바꾸기·비밀번호 바꾸기·끝내기에는 비밀번호가 필요하다(시작에는 불필요 — 홈 카드에서 바로 켠다).
// 비밀번호를 잊으면 강한선배 로그인 비밀번호로 초기화한다.

export default function StudentFocusScreen() {
  return (
    <Screen kind="push" title="집중 모드" backFallback="/(student)/(tabs)/menu">
      {FOCUS_SUPPORTED ? <Focus /> : <Notice tone="gray">iOS·iPadOS 18 이상에서 쓸 수 있어요.</Notice>}
    </Screen>
  );
}

type PinPrompt = { kind: 'set' } | { kind: 'verify'; title: string; then: () => void } | { kind: 'reset' };

function Focus() {
  const f = useFocusMode();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState<PinPrompt | null>(null);
  const [pending, setPending] = useState(false);

  const withPin = (title: string, then: () => void) => (f.pin ? setPrompt({ kind: 'verify', title, then }) : then());

  const pinSheet = (
    <PinSheet
      prompt={prompt}
      pin={f.pin}
      onClose={() => setPrompt(null)}
      onForgot={() => setPrompt({ kind: 'reset' })}
      onSet={(v) => {
        savePin(v);
        f.refresh();
        setPrompt(null);
        toast('잠금 비밀번호를 정했어요', 'success');
      }}
      onReset={() => {
        f.refresh();
        setPrompt({ kind: 'set' });
        toast('잠금 비밀번호를 지웠어요. 새로 정해 주세요', 'success');
      }}
    />
  );

  if (!f.approved) {
    return (
      <Section title="공부하는 동안 딴짓 앱을 잠가요">
        <Stack>
          <Text variant="t4-regular" color="neutralSubtle">
            내가 고른 앱과 사이트를 내가 끝낼 때까지 열 수 없게 해요. 잠글 앱을 바꾸거나 끝내려면 내가 정한 잠금
            비밀번호가 필요해요. 2시간이 지나면 아직 공부 중인지 묻고, 3시간까지 답이 없으면 저절로 풀려요.{'\n\n'}•
            어떤 앱을 골랐는지, 언제 무엇을 쓰는지는 이 기기 밖으로 나가지 않아요. 선생님도 볼 수 없어요.{'\n'}• 잠금
            비밀번호를 잊으면 강한선배 로그인 비밀번호로 초기화할 수 있어요.{'\n'}• 설정 › 스크린 타임에서 언제든
            권한을 끌 수 있고, 끄면 잠금과 비밀번호가 모두 풀려요.
          </Text>
          {f.denied && <Notice tone="warn">스크린 타임 권한이 꺼져 있어 집중 모드를 쓸 수 없어요.</Notice>}
          <Button
            size="xl"
            block
            onPress={() =>
              void DA.requestAuthorization('individual').catch(() => toast('스크린 타임 권한을 받지 못했어요', 'error'))
            }>
            계속
          </Button>
        </Stack>
      </Section>
    );
  }

  const run = async (action: () => Promise<void>, done?: string) => {
    setPending(true);
    try {
      await action();
      f.refresh();
      if (done) toast(done, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '집중 모드를 바꾸지 못했어요', 'error');
    } finally {
      setPending(false);
    }
  };

  if (f.active) {
    return (
      <>
        <Section>
          <View
            style={{
              alignItems: 'center',
              gap: space.x2,
              paddingVertical: space.x6,
            }}>
            <IconTile icon={Lock} tone="brand" />
            <Text variant="t7-bold">{f.asking ? '아직 공부 중인가요?' : '집중하는 중'}</Text>
            <Text variant="t4-regular" color="neutralSubtle" align="center">
              {f.asking
                ? `${clock(f.endsAt!)}까지 답이 없으면 집중 모드가 풀려요`
                : f.askAt
                  ? `${clock(f.askAt)}에 계속하는지 물어볼게요`
                  : '끝낼 때까지 잠겨 있어요'}
            </Text>
          </View>
          <Stack>
            {f.asking && (
              <Button block loading={pending} onPress={() => void run(keepFocus, '2시간 뒤에 다시 물어볼게요')}>
                계속 공부하기
              </Button>
            )}
            <Button
              variant="gray"
              block
              disabled={pending}
              onPress={() =>
                withPin('끝내려면 잠금 비밀번호를 입력해 주세요', () => {
                  stopFocus();
                  f.refresh();
                })
              }>
              집중 모드 끝내기
            </Button>
          </Stack>
        </Section>
        {pinSheet}
      </>
    );
  }

  return (
    <Stack>
      <Section flush>
        <ListRow
          onPress={() => withPin('잠글 앱을 바꾸려면 잠금 비밀번호를 입력해 주세요', () => setPickerOpen(true))}
          title="잠글 앱·사이트"
          description={f.picked > 0 ? `${f.picked}개 골랐어요` : '아직 고르지 않았어요'}
        />
        <ListRow
          onPress={() => withPin('비밀번호를 바꾸려면 지금 비밀번호를 입력해 주세요', () => setPrompt({ kind: 'set' }))}
          title="잠금 비밀번호"
          description={f.pin ? '앱을 바꾸거나 끝낼 때 필요해요' : '아직 정하지 않았어요'}
        />
      </Section>
      <SubmitBlock
        note={
          f.picked === 0
            ? '잠글 앱을 먼저 골라 주세요'
            : !f.pin
              ? '잠금 비밀번호를 먼저 정해 주세요'
              : '다음부터는 홈에서 바로 시작할 수 있어요'
        }
        label="집중 시작"
        loading={pending}
        disabled={!f.ready}
        onPress={() => void run(startFocus)}
      />
      {pickerOpen && (
        <DA.DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={SELECTION_ID}
          // 이 값이 있어야 라이브러리가 저장된 선택을 피커에 불러온다. 없으면 빈 선택으로 열리고
          // 0.1초 뒤 그 빈 선택을 저장해 고른 앱이 지워진다(react-native-device-activity 0.6.1).
          // true = 고른 카테고리의 웹사이트·나중에 깐 앱까지 함께 잠김
          includeEntireCategory
          style={{ position: 'absolute', width: 1, height: 1 }}
          onSelectionChange={f.refresh}
          // ponytail: 네이티브가 "완료" 0.1초 뒤에 저장·알림을 보내므로 피커를 바로 떼면 알림을 놓친다 — 잠깐 두었다 뗀다.
          // 라이브러리의 debounce(0.1초)가 바뀌면 이 값도 본다.
          onDismissRequest={() =>
            setTimeout(() => {
              setPickerOpen(false);
              f.refresh();
            }, 400)
          }
        />
      )}
      {pinSheet}
    </Stack>
  );
}

/** 잠금 비밀번호 정하기(두 번 입력) / 확인 / 잊었을 때 로그인 비밀번호로 초기화 */
function PinSheet({
  prompt,
  pin,
  onClose,
  onForgot,
  onSet,
  onReset,
}: {
  prompt: PinPrompt | null;
  pin: string | null;
  onClose: () => void;
  onForgot: () => void;
  onSet: (pin: string) => void;
  onReset: () => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 창 종류가 바뀌면(정하기↔확인↔초기화, 닫힘) 입력을 비운다
  const kind = prompt?.kind ?? null;
  const [shownKind, setShownKind] = useState(kind);
  if (kind !== shownKind) {
    setShownKind(kind);
    setA('');
    setB('');
    setError(null);
  }

  const submit = async () => {
    if (!prompt || pending) return;
    if (prompt.kind === 'verify') {
      if (a !== pin) return setError('비밀번호가 맞지 않아요');
      onClose();
      prompt.then();
      return;
    }
    if (prompt.kind === 'reset') {
      setPending(true);
      try {
        await resetPinWithLoginPassword(a);
        onReset();
      } catch (e) {
        setError(e instanceof Error ? e.message : '확인하지 못했어요. 잠시 후 다시 해 주세요');
      } finally {
        setPending(false);
      }
      return;
    }
    if (!/^\d{4,6}$/.test(a)) return setError('숫자 4~6자리로 정해 주세요');
    if (a !== b) return setError('두 번 입력한 비밀번호가 달라요');
    onSet(a);
  };

  const pinField = {
    keyboardType: 'number-pad',
    secureTextEntry: true,
    maxLength: 6,
    size: 'lg',
  } as const;
  const title = kind === 'set' ? '잠금 비밀번호 정하기' : kind === 'reset' ? '잠금 비밀번호 초기화' : '잠금 비밀번호';
  const description =
    prompt?.kind === 'set'
      ? '잠글 앱을 바꾸거나 끝낼 때 필요해요. 잊어버리면 강한선배 로그인 비밀번호로 초기화할 수 있어요.'
      : prompt?.kind === 'reset'
        ? '강한선배 로그인 비밀번호를 입력하면 잠금 비밀번호를 지우고 새로 정할 수 있어요.'
        : prompt?.title;

  return (
    <BottomSheet
      open={prompt != null}
      onClose={onClose}
      dismissible={!pending}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="gray" size="lg" onPress={onClose} disabled={pending} style={{ flex: 1 }}>
            취소
          </Button>
          <Button
            size="lg"
            onPress={() => void submit()}
            loading={pending}
            disabled={kind === 'reset' ? a.length === 0 : a.length < 4}
            style={{ flex: 1 }}>
            확인
          </Button>
        </>
      }>
      {/* key 로 입력칸을 새로 만든다 — iOS 는 포커스된 칸의 키보드 종류를 안 바꿔서, 확인→초기화로 넘어가면
          로그인 비밀번호 칸에 숫자 패드가 남는다 */}
      {kind === 'reset' ? (
        <TextField
          key="login-password"
          autoFocus
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={a}
          onChangeText={(v) => {
            setA(v);
            setError(null);
          }}
          placeholder="로그인 비밀번호"
          errorMessage={error}
        />
      ) : (
        <TextField
          key="pin"
          {...pinField}
          autoFocus
          value={a}
          onChangeText={(v) => {
            setA(v);
            setError(null);
          }}
          placeholder="숫자 4~6자리"
          errorMessage={kind === 'set' ? null : error}
        />
      )}
      {kind === 'set' && (
        <TextField
          {...pinField}
          value={b}
          onChangeText={(v) => {
            setB(v);
            setError(null);
          }}
          placeholder="한 번 더 입력"
          errorMessage={error}
        />
      )}
      {kind === 'verify' && (
        <Button variant="ghost" size="sm" onPress={onForgot}>
          비밀번호를 잊었어요
        </Button>
      )}
    </BottomSheet>
  );
}

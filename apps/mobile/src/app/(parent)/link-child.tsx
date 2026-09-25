import { useRouter } from 'expo-router';
import { Check, KeyRound, TicketCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  IconTile,
  Notice,
  Skeleton,
  Stack,
  Screen,
  Text,
  TextField,
  color,
  radius,
  space,
  toast,
} from '@/design';
import {
  extractInviteToken,
  parentApi,
  redeemParentInvite,
  type ParentLinkPreview,
} from '@/lib/api/parent-today';
import { requestMobileApi } from '@/lib/mobile-api';
import { childMeta, selectParentChild } from '@/lib/parent-child';
import { useSession } from '@/lib/session';

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading'; token: string }
  | { kind: 'ready'; token: string; preview: ParentLinkPreview }
  | { kind: 'error'; token: string; message: string };

/** 자녀 추가 연결 — 이미 학부모 계정이 있을 때 다른 자녀의 초대 코드로 연결 */
export default function LinkChildScreen() {
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [value, setValue] = useState('');
  const [state, setState] = useState<PreviewState>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const token = extractInviteToken(value);

  // 입력이 멈추면 초대 내용 미리보기 (토큰은 보통 40자 이상)
  useEffect(() => {
    if (token.length < 16) return;
    let active = true;
    const timer = setTimeout(() => {
      setState({ kind: 'loading', token });
      requestMobileApi<ParentLinkPreview>(parentApi.linkPreview(token))
        .then((preview) => active && setState({ kind: 'ready', token, preview }))
        .catch((e: unknown) =>
          active &&
          setState({
            kind: 'error',
            token,
            message: e instanceof Error ? e.message : '초대 코드를 확인하지 못했어요',
          }),
        );
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token]);

  // 입력이 바뀌면 이전 결과는 무시
  const current = state.kind !== 'idle' && state.token === token ? state : null;
  const tooShort = token.length > 0 && token.length < 16;
  const newChildren = current?.kind === 'ready' ? current.preview.children.filter((c) => !c.alreadyLinked) : [];
  const allLinked = current?.kind === 'ready' && newChildren.length === 0;

  const submit = async () => {
    if (busy.current || current?.kind !== 'ready' || newChildren.length === 0) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const result = await redeemParentInvite(token);
      await refreshProfile();
      const first = result.added[0];
      if (first) selectParentChild(first.id);
      toast(
        result.added.length > 1
          ? `자녀 ${result.added.length}명을 연결했어요`
          : `${first?.name ?? '자녀'} 학생을 연결했어요`,
        'success',
      );
      if (router.canGoBack()) router.back();
      else router.replace('/(parent)/(tabs)');
    } catch (e) {
      toast(e instanceof Error ? e.message : '연결하지 못했어요. 다시 시도해 주세요.', 'error');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const errorMessage = tooShort
    ? '초대 코드가 너무 짧아요. 받은 링크 전체를 붙여 넣어 주세요.'
    : current?.kind === 'error'
      ? current.message
      : allLinked
        ? '이미 연결된 자녀예요'
        : null;

  return (
    <Screen
      kind="push"
      title="자녀 연결"
      surface="panel"
      backFallback="/(parent)/(tabs)"
      footer={
        <Button
          size="xl"
          block
          loading={submitting}
          disabled={current?.kind !== 'ready' || newChildren.length === 0}
          onPress={submit}>
          {newChildren.length > 1 ? `자녀 ${newChildren.length}명 연결하기` : '연결하기'}
        </Button>
      }>
      <Stack gap={space.x6} style={{ paddingTop: space.x3 }}>
        <View style={{ gap: space.x2 }}>
          <Text variant="t9-bold">초대 코드를 붙여 넣어 주세요</Text>
          <Text variant="t5-regular" color="neutralMuted">
            독서실에서 문자로 받은 학부모 초대 링크를 그대로 붙여 넣으면 다른 자녀도 이 계정에서 함께 볼 수 있어요.
          </Text>
        </View>

        <TextField
          label="초대 링크 또는 코드"
          placeholder="https://… 로 시작하는 링크"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          errorMessage={errorMessage}
          prefix={
            <View style={{ justifyContent: 'center' }}>
              <KeyRound color={color.fg.neutralSubtle} size={20} strokeWidth={2} />
            </View>
          }
          description="초대 링크는 받은 날부터 7일 동안 쓸 수 있어요."
        />

        {current?.kind === 'loading' && (
          <View style={{ gap: space.x3 }}>
            <Skeleton style={{ width: 120, height: 18 }} />
            <Skeleton style={{ height: 72, borderRadius: radius.r4 }} />
          </View>
        )}

        {current?.kind === 'ready' && (
          <View style={{ gap: space.x3 }}>
            <Text variant="t5-bold">이 초대로 연결되는 자녀</Text>
            {current.preview.children.map((c) => (
              <View
                key={c.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x3,
                  padding: space.x4,
                  borderRadius: radius.r4,
                  backgroundColor: color.bg.layerFill,
                }}>
                <Avatar name={c.name} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="t6-bold" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                    {childMeta(c)}
                  </Text>
                </View>
                {c.alreadyLinked ? (
                  <Badge tone="gray" size="md">
                    이미 연결됨
                  </Badge>
                ) : (
                  <IconTile icon={Check} tone="ok" size={32} round />
                )}
              </View>
            ))}
          </View>
        )}

        <Notice tone="gray" icon={TicketCheck}>
          초대 코드는 한 번만 쓸 수 있어요. 만료됐거나 이미 쓴 코드라면 독서실에 새 초대를 요청해 주세요.
        </Notice>
      </Stack>
    </Screen>
  );
}

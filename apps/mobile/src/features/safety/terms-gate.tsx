// 이용약관·운영정책 동의.
//  · 새로 가입하는 계정: 가입 화면 문구로 동의하고 가입한다 (rememberTermsAgreedAtSignUp)
//  · 약관이 생기기 전에 가입한 계정: 로그인한 뒤 처음 한 번 동의 시트를 띄운다
// 동의 여부는 기기에만 적어 둔다 (웹: localStorage, 네이티브: SecureStore). 저장소를 못 읽으면 막지 않는다.

import * as SecureStore from 'expo-secure-store';
import { ExternalLink } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { BottomSheet, Button, Text, color, space } from '@/design';
import { useSession, type MobileSession } from '@/lib/session';
import { TERMS_URL, openHelpPage } from '@/lib/support';

/** 약관 내용이 크게 바뀌어 다시 동의를 받아야 하면 올린다 */
const TERMS_VERSION = 'v1';
const SIGNUP_KEY = `studyroom.terms.${TERMS_VERSION}.signup`;

const keyFor = (session: MobileSession) =>
  `studyroom.terms.${TERMS_VERSION}.${session.role}.${session.domainId}`;

async function read(key: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function write(key: string) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, '1');
  else await SecureStore.setItemAsync(key, '1');
}

async function remove(key: string) {
  if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

/** 가입 화면에서 약관에 동의하고 가입했음을 적어 둔다 — 이어지는 첫 로그인에서 시트를 건너뛴다 */
export async function rememberTermsAgreedAtSignUp() {
  try {
    await write(SIGNUP_KEY);
  } catch {
    // 못 적으면 첫 로그인 때 시트로 한 번 더 동의받는다
  }
}

const RULES = [
  '욕설·비방·괴롭힘, 성적이거나 불쾌한 내용, 다른 사람의 개인정보를 올리는 일은 허용하지 않아요.',
  '부적절한 메시지는 길게 눌러 신고하거나 상대를 차단할 수 있어요. 신고는 원장님이 24시간 안에 확인해요.',
  '위반이 확인되면 글을 지우고, 경고하거나 앱 이용을 제한해요.',
];

/** 앱 루트(FeedbackProvider 안)에 하나 둔다 */
export function TermsGate() {
  const { session, status } = useSession();
  const key = status === 'authenticated' && session ? keyFor(session) : null;
  // 동의가 필요한 계정의 키 — 계정이 바뀌면 key 와 달라져 시트가 닫힌다
  const [needed, setNeeded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!key) return;
    let active = true;
    void (async () => {
      try {
        if (await read(key)) return;
        if (await read(SIGNUP_KEY)) {
          await write(key);
          await remove(SIGNUP_KEY);
          return;
        }
        if (active) setNeeded(key);
      } catch {
        // 저장소를 읽지 못하면 앱 사용을 막지 않는다
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);

  const agree = async () => {
    if (!key || saving) return;
    setSaving(true);
    try {
      await write(key);
    } catch {
      // 못 적어도 이번 실행에서는 통과 — 다음 실행 때 다시 묻는다
    }
    setNeeded(null);
    setSaving(false);
  };

  return (
    <BottomSheet
      open={key != null && needed === key}
      onClose={() => undefined}
      dismissible={false}
      title="이용약관·운영정책에 동의해 주세요"
      description="서로 안심하고 쓸 수 있도록 아래 내용을 지켜 주세요."
      footer={
        <Button variant="primary" size="xl" style={{ flex: 1 }} loading={saving} onPress={() => void agree()}>
          동의하고 계속하기
        </Button>
      }>
      <View style={{ gap: space.x3 }}>
        {RULES.map((rule) => (
          <View key={rule} style={{ flexDirection: 'row', gap: space.x2 }}>
            <Text variant="t5-regular" color="neutralSubtle">
              ·
            </Text>
            <Text variant="t5-regular" style={{ flex: 1 }}>
              {rule}
            </Text>
          </View>
        ))}
      </View>
      <Button
        variant="ghost"
        size="sm"
        iconRight={ExternalLink}
        onPress={() => void openHelpPage(TERMS_URL)}
        style={{ alignSelf: 'flex-start', marginLeft: -space.x3_5 }}
        accessibilityLabel="이용약관·운영정책 전문 보기">
        <Text variant="t4-bold" color={color.fg.neutralMuted}>
          전문 보기
        </Text>
      </Button>
    </BottomSheet>
  );
}

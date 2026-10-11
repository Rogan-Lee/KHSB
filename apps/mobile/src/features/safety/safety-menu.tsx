// 신고·차단 메뉴 — 1:1 대화·직원 메시지·질문 화면이 함께 쓴다.
//  · 상대 말풍선을 길게 누르거나 헤더의 ⋯ 를 누르면 메뉴 시트 (메시지 신고 · 사용자 신고 · 차단/해제)
//  · 신고: 사유 + 자세한 내용(선택) → 운영진에게 전달 (어드민 신고 관리 · Slack)
//  · 차단: 확인 뒤 서버에 반영하고 onChanged 로 화면을 다시 불러오게 한다

import { Ban, Check, Copy, Flag, ShieldCheck, UserX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  IconTile,
  ListRow,
  Notice,
  Press,
  Text,
  TextField,
  color,
  confirm,
  radius,
  space,
  toast,
} from '@/design';
import { copyText } from '@/features/lunch/clipboard';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  blockUser,
  submitReport,
  unblockUser,
  type ReportMessageType,
  type ReportReason,
  type SafetyUser,
} from '@/lib/api/safety';

export type SafetyTarget = {
  user: SafetyUser;
  /** 신고할 메시지 — 없으면 사용자 신고만 */
  message?: { type: ReportMessageType; id: string };
  /** 메시지 글 — 있으면 메뉴에 "복사하기" (길게 누르기를 메뉴가 가져가므로) */
  copyText?: string;
  /** 내가 이미 차단한 상대 */
  blocked?: boolean;
};

export type SafetyChange = 'blocked' | 'unblocked';

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 차단 확인 → 서버 반영. 차단했으면 true */
export async function confirmBlock(user: SafetyUser) {
  const ok = await confirm({
    title: `${user.name}님을 차단할까요?`,
    message:
      '이 사람이 보낸 글이 더 보이지 않고, 서로 새 메시지를 보낼 수 없어요. 담당을 조정할 수 있도록 독서실에도 알려요.',
    confirmText: '차단하기',
    destructive: true,
  });
  if (!ok) return false;
  try {
    await blockUser(user);
    toast(`${user.name}님을 차단했어요`, 'success');
    return true;
  } catch (error) {
    toast(errorText(error, '차단하지 못했어요'), 'error');
    return false;
  }
}

/** 차단 해제. 풀었으면 true */
export async function releaseBlock(user: SafetyUser) {
  try {
    await unblockUser(user);
    toast(`${user.name}님 차단을 풀었어요`, 'success');
    return true;
  } catch (error) {
    toast(errorText(error, '차단을 풀지 못했어요'), 'error');
    return false;
  }
}

/** 차단한 상대와의 대화에서 작성창 자리에 두는 안내 + 차단 해제 */
export function BlockedBar({
  label = '차단한 상대예요. 차단을 풀면 다시 대화할 수 있어요.',
  onUnblock,
  bottomInset = 0,
}: {
  label?: string;
  onUnblock: () => void;
  /** 홈 인디케이터 여백 */
  bottomInset?: number;
}) {
  return (
    <View style={[s.blockedBar, { paddingBottom: bottomInset + space.x3 }]}>
      <Ban color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
      <Text variant="t4-regular" color="neutralMuted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Button variant="gray" size="sm" onPress={onUnblock}>
        차단 해제
      </Button>
    </View>
  );
}

/**
 * const safety = useSafetyMenu((change) => reload());
 * safety.open({ user, message, blocked }) · 화면 어딘가에 {safety.element}
 */
export function useSafetyMenu(onChanged?: (change: SafetyChange) => void) {
  // 닫히는 동안 내용이 비지 않게 대상과 열림 상태를 따로 둔다
  const [target, setTarget] = useState<SafetyTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'menu' | 'report'>('menu');
  const [reportMessage, setReportMessage] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [pending, setPending] = useState(false);

  const show = useCallback((next: SafetyTarget) => {
    setTarget(next);
    setStep('menu');
    setReason(null);
    setDetail('');
    setAlsoBlock(false);
    setOpen(true);
  }, []);

  const close = () => {
    if (!pending) setOpen(false);
  };

  const startReport = (withMessage: boolean) => {
    setReportMessage(withMessage);
    setStep('report');
  };

  const toggleBlock = async () => {
    if (!target || pending) return;
    setPending(true);
    const done = target.blocked ? await releaseBlock(target.user) : await confirmBlock(target.user);
    setPending(false);
    if (!done) return;
    setOpen(false);
    onChanged?.(target.blocked ? 'unblocked' : 'blocked');
  };

  const send = async () => {
    if (!target || !reason || pending) return;
    setPending(true);
    try {
      const result = await submitReport({
        user: target.user,
        message: reportMessage ? target.message : undefined,
        reason,
        detail,
      });
      let blocked = false;
      if (alsoBlock && !target.blocked) {
        try {
          await blockUser(target.user);
          blocked = true;
        } catch (error) {
          toast(errorText(error, '신고는 접수했지만 차단하지 못했어요'), 'error');
        }
      }
      setOpen(false);
      toast(
        result.duplicate ? '이미 신고한 내용이에요. 확인하고 있어요' : '신고를 접수했어요. 24시간 안에 확인할게요',
        'success',
      );
      if (blocked) onChanged?.('blocked');
    } catch (error) {
      toast(errorText(error, '신고하지 못했어요'), 'error');
    } finally {
      setPending(false);
    }
  };

  const name = target?.user.name ?? '';

  const element =
    step === 'menu' ? (
      <BottomSheet
        open={open}
        onClose={close}
        dismissible={!pending}
        title={name}
        description="신고한 내용은 원장님께 전달되고, 상대방에게는 알리지 않아요."
        footer={
          <Button variant="gray" size="xl" style={{ flex: 1 }} disabled={pending} onPress={close}>
            닫기
          </Button>
        }>
        <View style={s.rows}>
          {target?.copyText ? (
            <ListRow
              leading={<IconTile icon={Copy} tone="gray" size={40} round />}
              title="글 복사하기"
              chevron={false}
              onPress={() => {
                void copyText(target.copyText!);
                setOpen(false);
              }}
            />
          ) : null}
          {target?.message ? (
            <ListRow
              leading={<IconTile icon={Flag} tone="warn" size={40} round />}
              title="이 메시지 신고하기"
              onPress={() => startReport(true)}
            />
          ) : null}
          <ListRow
            leading={<IconTile icon={UserX} tone="warn" size={40} round />}
            title={`${name}님 신고하기`}
            onPress={() => startReport(false)}
          />
          <ListRow
            leading={<IconTile icon={target?.blocked ? ShieldCheck : Ban} tone={target?.blocked ? 'gray' : 'bad'} size={40} round />}
            title={target?.blocked ? '차단 해제하기' : `${name}님 차단하기`}
            description={target?.blocked ? undefined : '글이 보이지 않고 서로 메시지를 보낼 수 없어요'}
            chevron={false}
            onPress={() => void toggleBlock()}
          />
        </View>
      </BottomSheet>
    ) : (
      <BottomSheet
        open={open}
        onClose={close}
        dismissible={!pending}
        title={reportMessage ? '메시지를 신고해요' : `${name}님을 신고해요`}
        description="사유를 골라 주세요. 원장님이 24시간 안에 확인하고 조치해요."
        footer={
          <>
            <Button variant="gray" size="xl" style={{ flex: 1 }} disabled={pending} onPress={() => setStep('menu')}>
              이전
            </Button>
            <Button
              variant="primary"
              size="xl"
              style={{ flex: 1 }}
              loading={pending}
              disabled={!reason}
              onPress={() => void send()}>
              신고하기
            </Button>
          </>
        }>
        <ChipGroup>
          {REPORT_REASONS.map((r) => (
            <Chip key={r.value} selected={reason === r.value} onPress={() => setReason(r.value)}>
              {r.label}
            </Chip>
          ))}
        </ChipGroup>
        <TextField
          label="자세한 내용"
          indicator="선택"
          value={detail}
          onChangeText={setDetail}
          placeholder="어떤 점이 문제였는지 적어 주세요"
          multiline
          minHeight={96}
          maxLength={REPORT_DETAIL_MAX}
          showCount
          editable={!pending}
        />
        {target?.blocked ? (
          <Notice tone="gray" icon={Ban}>
            이미 차단한 상대예요.
          </Notice>
        ) : (
          <Press
            onPress={() => setAlsoBlock((v) => !v)}
            scale={0}
            disabled={pending}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            style={s.check}>
            <View style={[s.box, alsoBlock && s.boxOn]}>
              {alsoBlock ? <Check color={color.palette.staticWhite} size={16} strokeWidth={3} /> : null}
            </View>
            <Text variant="t5-regular" style={{ flex: 1 }}>
              {`${name}님 차단도 같이 하기`}
            </Text>
          </Press>
        )}
      </BottomSheet>
    );

  return { open: show, element };
}

const s = StyleSheet.create({
  // ListRow 는 자체 좌우 여백(x5)이 있어 시트 본문 여백과 겹치지 않게 당긴다
  rows: { marginHorizontal: -space.x5 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.x3, minHeight: 44 },
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
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    paddingHorizontal: space.x4,
    paddingTop: space.x3,
    backgroundColor: color.bg.layerDefault,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
});

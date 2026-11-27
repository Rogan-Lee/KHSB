import { Image } from 'expo-image';
import { FileX, type LucideIcon } from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  color,
  EmptyState,
  IconTile,
  InfoRow,
  Press,
  radius,
  Section,
  showImages,
  Skeleton,
  space,
  Stack,
  Text,
  type Tone,
} from '@/design';

// 학부모 리포트 공통 조각 — 웹 src/components/parent-report/report-shell.tsx(ReportHero) ·
// mentoring-note-sections.tsx(CardTitle) 와 같은 모양.

/**
 * 리포트 첫 화면 머리글 — 카드가 아니라 회색 캔버스 위에 바로 놓는다.
 * 문서 종류/날짜(eyebrow) + 배지 · 학생 이름(큰 제목) · 보조 정보(학년 · 학교) · 요약 카드
 */
export function ReportHero({
  eyebrow,
  title,
  meta,
  badge,
  children,
}: {
  eyebrow: string;
  title: string;
  /** "고2 · 반송고" 처럼 이어 붙일 보조 정보 (빈 값은 건너뜀) */
  meta?: (string | null | undefined | false)[];
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const items = (meta ?? []).filter((m): m is string => !!m);
  return (
    <View style={{ paddingHorizontal: space.x1, paddingTop: space.x4, paddingBottom: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x2 }}>
        <Text variant="t4-bold" color="brand">
          {eyebrow}
        </Text>
        {badge}
      </View>
      <Text variant="t10-bold" accessibilityRole="header" style={{ marginTop: space.x1_5 }}>
        {title}
      </Text>
      {items.length > 0 && (
        <Text variant="t5-regular" color="neutralSubtle" tabular style={{ marginTop: space.x1 }}>
          {items.map((m, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <Text variant="t5-regular" color="placeholder">
                  {'  ·  '}
                </Text>
              )}
              {m}
            </Fragment>
          ))}
        </Text>
      )}
      {/* 머리글 좌우 여백을 상쇄해 아래 카드들과 가장자리를 맞춘다 */}
      {children != null && <View style={{ marginTop: space.x5, marginHorizontal: -space.x1 }}>{children}</View>}
    </View>
  );
}

export type InfoCardRow = { icon: LucideIcon; label: string; value: string };

/** 머리글 아래 요약 카드 — 날짜 · 시간 · 담당 멘토 같은 정보 줄 (아이콘 라벨) */
export function InfoCard({ rows }: { rows: (InfoCardRow | null | false | undefined | '')[] }) {
  const list = rows.filter((r): r is InfoCardRow => !!r);
  if (list.length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: color.bg.layerDefault,
        borderRadius: radius.r5,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
      }}>
      {list.map(({ icon: Icon, label, value }) => (
        <InfoRow
          key={label}
          label={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1_5 }}>
              <Icon color={color.fg.neutralSubtle} size={16} strokeWidth={2} />
              <Text variant="t5-regular" color="neutralSubtle">
                {label}
              </Text>
            </View>
          }>
          <Text variant="t5-medium" align="right" tabular>
            {value}
          </Text>
        </InfoRow>
      ))}
    </View>
  );
}

/** 카드 머리글 — 작은 원형 아이콘 + 제목 (Section title 에 넣는다) */
export function CardTitle({ icon, tone, children }: { icon: LucideIcon; tone: Tone; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2_5 }}>
      <IconTile icon={icon} tone={tone} size={32} round />
      <Text variant="t6-bold" style={{ flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/** 카드 안 소제목 (+ 보조 설명) */
export function SubHeading({ hint, children }: { hint?: string; children: string }) {
  return (
    <View style={{ gap: space.x0_5 }}>
      <Text variant="t4-bold" color="neutralMuted">
        {children}
      </Text>
      {hint != null && (
        <Text variant="t3-regular" color="neutralSubtle">
          {hint}
        </Text>
      )}
    </View>
  );
}

/** 사진 여러 장 — 원본 비율로 쌓고, 누르면 앱 안 전체 화면 보기(좌우 넘기기) */
export function PhotoList({ images, alt }: { images: string[]; alt: string }) {
  return (
    <View style={{ gap: space.x3 }}>
      {images.map((uri, i) => (
        <Photo key={`${i}-${uri}`} uri={uri} label={`${alt} ${i + 1}`} onPress={() => showImages(images, i)} />
      ))}
      <Text variant="t3-regular" color="neutralSubtle" style={{ marginTop: -space.x0_5 }}>
        사진을 누르면 크게 볼 수 있어요.
      </Text>
    </View>
  );
}

function Photo({ uri, label, onPress }: { uri: string; label: string; onPress: () => void }) {
  const [ratio, setRatio] = useState(3 / 4);
  return (
    <Press
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${label}, 눌러서 크게 보기`}
      style={{
        borderRadius: radius.r3,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: color.stroke.neutralSubtle,
        backgroundColor: color.bg.layerFill,
      }}>
      <Image
        source={{ uri }}
        contentFit="contain"
        transition={150}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) setRatio(width / height);
        }}
        style={{ width: '100%', aspectRatio: ratio }}
      />
    </Press>
  );
}

/** 첫 로드 — 머리글 + 요약 카드 + 본문 카드 두 장 모양 */
export function ReportSkeleton() {
  return (
    <Stack>
      <View style={{ paddingHorizontal: space.x1, paddingTop: space.x4, paddingBottom: space.x3 }}>
        <Skeleton style={{ width: 96, height: 16 }} />
        <Skeleton style={{ width: 168, height: 30, marginTop: space.x2 }} />
        <Skeleton style={{ width: 112, height: 18, marginTop: space.x2 }} />
        <Skeleton style={{ height: 112, marginTop: space.x5, marginHorizontal: -space.x1, borderRadius: radius.r5 }} />
      </View>
      {[0, 1].map((i) => (
        <Section key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2_5 }}>
            <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
            <Skeleton style={{ width: 132, height: 22 }} />
          </View>
          <Skeleton style={{ width: '100%', height: 16, marginTop: space.x4 }} />
          <Skeleton style={{ width: '94%', height: 16, marginTop: space.x2 }} />
          <Skeleton style={{ width: '70%', height: 16, marginTop: space.x2 }} />
        </Section>
      ))}
    </Stack>
  );
}

/** 잘못된 경로 등으로 리포트를 특정할 수 없을 때 */
export function ReportNotFound() {
  return (
    <EmptyState icon={FileX} title="리포트를 찾을 수 없어요" description="리포트함에서 다시 골라 주세요." />
  );
}

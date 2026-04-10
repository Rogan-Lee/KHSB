# Study Room Manager Design System

## Visual Theme

**철학:** 클린 프로페셔널. 데이터 밀도가 높은 운영 대시보드이므로 장식보다 정보 가독성을 최우선.

**분위기:** Linear의 정밀함 + Notion의 친근함. 차분하고 전문적이되 딱딱하지 않은 톤.

**핵심 원칙:**
- 콘텐츠 우선 — UI 크롬을 최소화하고 데이터에 집중
- 일관된 밀도 — 테이블, 카드, 폼 모두 동일한 여백 체계
- 명확한 위계 — 제목 → 본문 → 보조텍스트가 한눈에 구분
- 부드러운 인터랙션 — 모든 상태 전환에 transition (100~150ms)

---

## Color Palette

### Primary
| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#0066ff` | CTA 버튼, 활성 탭, 포커스 링 |
| `--primary-foreground` | `#ffffff` | Primary 위의 텍스트 |
| `--secondary` | `#eaf2fe` | 선택된 항목 배경, 뱃지 배경 |
| `--secondary-foreground` | `#005eeb` | Secondary 위의 텍스트 |

### Neutral
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#ffffff` | 페이지 배경 |
| `--foreground` | `#1e2124` | 주요 텍스트 |
| `--muted` | `#f7f7f8` | 비활성 배경, 테이블 헤더 |
| `--muted-foreground` | `#6d7882` | 보조 텍스트, 라벨 |
| `--border` | `#e1e2e4` | 구분선, 카드 테두리 |
| `--accent` | `#f4f4f5` | hover 배경 |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `--destructive` | `#ff4242` | 삭제, 에러, 긴급 |
| success | `#00985a` | 완료, 정상 |
| warning | `#ff5e00` | 주의, 영단어 미응시 |
| info | `#6541f2` | 정보 뱃지 |

### Chart (데이터 시각화)
`#0066ff` → `#00985a` → `#6541f2` → `#ff5e00` → `#ff4242`

---

## Typography

**Font:** Pretendard Variable (한국어 최적화 산세리프)

| Level | Size | Weight | Letter Spacing | Usage |
|-------|------|--------|----------------|-------|
| Page Title | 20px | semibold (600) | -0.02em | 페이지 최상단 |
| Section Title | 15px | semibold (600) | -0.02em | 카드 헤더, 섹션 구분 |
| Body | 14px | normal (400) | -0.02em | 기본 텍스트 |
| Body Bold | 14px | medium (500) | -0.02em | 테이블 셀 강조 |
| Small | 13px | medium (500) | -0.02em | 네비게이션, 버튼 |
| Caption | 12px | normal (400) | 0 | 타임스탬프, 메타 |
| Label | 11px | semibold (600) | 0.02em | 폼 라벨, 섹션 태그 (uppercase 가능) |
| Tiny | 10px | medium (500) | 0 | 뱃지 내부, 부가 수치 |

---

## Spacing & Layout

### Spacing Scale (8px 기반)
`4px` · `8px` · `12px` · `16px` · `20px` · `24px` · `32px` · `48px`

### Layout Structure
```
┌──────────────────────────────────────────────┐
│ Sidebar (240px fixed)  │  Header (56px sticky) │
│                        │──────────────────────│
│  Logo (56px)           │                      │
│  ─────────────         │     Content Area     │
│  Nav Items             │     max-w: 1400px    │
│  (13px, 36px height)   │     px: 24px         │
│                        │     py: 16px         │
│  ─────────────         │                      │
│  Plan Badge            │                      │
└──────────────────────────────────────────────┘
```

### 카드 내부 구조
- CardHeader: `px-6 pt-6 pb-0`
- CardContent: `px-6 pb-6 pt-4`
- 카드 간 간격: `16px` (gap-4)
- 카드 border-radius: `8px`
- 카드 shadow: `0 1px 4px rgba(0,0,0,0.06)`

---

## Component Patterns

### Buttons
| Variant | 배경 | 텍스트 | 용도 |
|---------|------|--------|------|
| Primary | `#0066ff` | white | CTA, 저장, 등록 |
| Secondary | `#eaf2fe` | `#005eeb` | 보조 액션 |
| Outline | transparent + border | foreground | 취소, 필터 |
| Ghost | transparent | muted-foreground | 아이콘 버튼, 테이블 내 액션 |
| Destructive | `#ff4242` | white | 삭제 확인 |

**Size:** `sm` (28px height, 12px text) 기본. 폼 제출만 `default` (36px).
**Radius:** 6px. **Hover:** opacity 90% 또는 배경색 진하게.

### Tables
- 헤더: `bg-muted/40`, 12px uppercase text, `font-medium`
- 행: hover시 `bg-accent/50`, `transition-colors`
- 행 높이: `40~44px`
- 정렬 가능 컬럼: 클릭 시 `ArrowUp/Down` 아이콘
- 빈 상태: 중앙 정렬 회색 텍스트 + 48px 높이

### Badges / Status
```
SCHEDULED  → bg-secondary text-secondary-foreground (파란 톤)
COMPLETED  → bg-green-50 text-green-700
CANCELLED  → bg-red-50 text-red-700
IN_PROGRESS → bg-amber-50 text-amber-700
PENDING    → bg-gray-100 text-gray-600
```

### Form Fields
- Input height: `36px` (default), `28px` (sm)
- Border: `1px solid var(--border)`
- Focus: `ring-2 ring-primary/30`
- 라벨: `text-xs text-muted-foreground` (폼 내부), `text-sm font-medium` (독립 폼)
- 에러: `border-destructive` + `text-destructive text-xs`

### Filter Bar (멘토 필터 등)
```
[전체] [김멘토 12] [박멘토 8] [이멘토 5]
```
- 활성: `bg-primary/10 text-primary border-primary/30`
- 비활성: `border-border text-muted-foreground`
- 크기: `px-2.5 py-1 text-xs rounded-md`
- 카운트: `text-[10px] opacity-60`

### Cards (통계 카드)
```
┌─────────────┐
│ 🟢 85       │  아이콘(32px) + 숫자(2xl bold)
│   재원생     │  라벨(sm muted)
└─────────────┘
```
- grid-cols-4 (데스크탑), grid-cols-2 (모바일)
- 아이콘 색상으로 의미 전달 (green=활성, red=위험, blue=정보)

---

## Depth & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| Flat | none | 테이블 행, 리스트 아이템 |
| Card | `0 1px 4px rgba(0,0,0,0.06)` | 카드, 패널 |
| Dropdown | `0 4px 12px rgba(0,0,0,0.1)` | 드롭다운, 팝오버 |
| Modal | `0 8px 32px rgba(0,0,0,0.15)` | 다이얼로그, 시트 |
| Tooltip | `0 4px 12px rgba(0,0,0,0.25)` (dark bg) | 차트 툴팁 |

---

## Data Visualization

### 차트 스타일 (Recharts)
- 배경: transparent (카드 배경 활용)
- 축 라벨: `11px #94a3b8`
- 그리드: `stroke-dasharray="3 3"` subtle
- 툴팁: 다크 배경 (`#1e293b`, 12px, rounded-lg`)
- Area fill: gradient (primary → transparent)
- 등급 색상: 1-2등급 `#3B82F6`, 3-4 `#10B981`, 5-6 `#F59E0B`, 7-9 `#EF4444`

### 테이블 내 데이터
- 숫자: `tabular-nums font-medium text-right`
- 퍼센트 뱃지: ≥80% default, ≥60% secondary, <60% destructive
- 트렌드: `↑ green`, `↓ red`, `— gray` (TrendingUp/Down 아이콘 3px)

---

## Navigation

### Sidebar
- 폭: 240px 고정
- 그룹 구분: `11px uppercase text-muted-foreground/50 font-semibold` + `mt-6 mb-1`
- 아이템: `13px font-medium`, 36px height, `rounded-md`
- 활성: `bg-[#eaf2fe] text-[#005eeb]`
- Hover: `bg-accent`
- 아이콘: 16px (`h-4 w-4`), 아이콘-텍스트 간격 12px

### Tabs
- 기본 shadcn TabsList 스타일
- 활성 탭: `bg-card shadow-sm text-foreground`
- 비활성: `text-muted-foreground`
- 탭 크기: `px-3 py-1.5 text-xs font-medium rounded-md`

---

## Interactive States

| State | 표현 |
|-------|------|
| Hover | 배경색 변경 (`bg-accent/50`), 100ms transition |
| Active/Pressed | scale(0.98) 또는 배경 더 진하게 |
| Focus | `ring-2 ring-primary/30 ring-offset-2` |
| Disabled | `opacity-50 cursor-not-allowed` |
| Loading | `opacity-70` + "...중" 텍스트 또는 spinner |
| Selected (row) | `bg-primary/5` + 체크박스 checked |
| Dragging | `shadow-lg opacity-80` |

---

## Responsive Behavior

| Breakpoint | 변화 |
|------------|------|
| < 768px (mobile) | 사이드바 → Sheet 오버레이, 통계 grid-cols-2, 테이블 가로 스크롤 |
| 768px+ (tablet) | 사이드바 고정, 콘텐츠 오프셋 |
| 1400px+ | max-width 제한, 중앙 정렬 |

터치 타겟: 최소 36px (모바일), 28px (데스크탑)

---

## Do's and Don'ts

### Do
- 모든 사용자 대면 텍스트는 **한국어**
- 상태 변화 시 `toast` (sonner) 피드백 — `toast.success("저장되었습니다")`
- 테이블 빈 상태에 안내 메시지 표시
- 숫자는 `tabular-nums`로 정렬
- 삭제 전 confirm 다이얼로그
- 폼 제출 중 버튼 disabled + "...중" 텍스트

### Don't
- 순수 장식 목적의 아이콘/이모지 남용 금지
- 5가지 이상 색상을 한 화면에 사용하지 않기
- 모달 안의 모달 (중첩 모달) 금지 — Sheet 또는 페이지 이동 사용
- 300px 이상 넓이의 드롭다운 금지
- inline style 사용 금지 (차트 색상 등 동적 값 제외)
- 영어 UI 텍스트 금지 (코드 주석/변수명은 영어 가능)

---

## Agent Implementation Guide

UI를 구현할 때 참고:

1. **새 페이지**: 기존 페이지 구조 복사 — `Card > CardHeader + CardContent` 패턴
2. **새 테이블**: `Table/TableHeader/TableBody` + 정렬 가능 헤더 + 빈 상태
3. **새 폼**: `space-y-4` + `grid grid-cols-2 gap-4` + DatePicker/Select/Input
4. **필터 바**: 버튼 그룹 (`flex gap-1.5`) + 활성/비활성 스타일
5. **통계 카드**: `grid grid-cols-4 gap-4` + 아이콘 + 숫자 + 라벨
6. **액션 버튼**: 테이블 내 — `Ghost` 아이콘 버튼 (Pencil, Trash2), 페이지 상단 — `Primary sm`
7. **상태 뱃지**: `Badge` + variant 매핑 (위 Status 섹션 참조)
8. **로딩**: `useTransition` + `isPending` + 버튼 disabled

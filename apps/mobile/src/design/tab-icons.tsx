import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from './tokens';

/**
 * 탭 아이콘 — 비활성은 선, 활성은 채움 (Toss 탭바 방식).
 * home·tasks·qna·chat·menu 는 웹 학생 포털(portal-shell.tsx)과 같은 도형.
 */
export type TabIconName =
  | 'home'
  | 'tasks'
  | 'qna'
  | 'chat'
  | 'menu'
  | 'calendar'
  | 'people'
  | 'report'
  | 'growth'
  | 'inbox';

export function TabIcon({
  name,
  active,
  tint,
  size = 26,
}: {
  name: TabIconName;
  active: boolean;
  tint: string;
  size?: number;
}) {
  const line = { fill: 'none', stroke: tint, strokeWidth: 1.8 } as const;
  const solid = { fill: tint, stroke: tint, strokeWidth: 1.8 } as const;
  // 채움 도형 위에 배경색으로 그어 "파낸" 선
  const cut = { fill: 'none', stroke: color.bg.layerDefault, strokeWidth: 1.8 } as const;
  const main = active ? solid : line;
  const detail = active ? cut : line;
  const common = { width: size, height: size, viewBox: '0 0 24 24' } as const;
  const cap = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

  switch (name) {
    case 'home':
      return (
        <Svg {...common}>
          <Path d="M4 10.3 12 4l8 6.3V19a1 1 0 0 1-1 1h-4.25v-5.25h-5.5V20H5a1 1 0 0 1-1-1z" {...main} {...cap} />
        </Svg>
      );
    case 'tasks':
      return (
        <Svg {...common}>
          <Path
            d="M8.5 4.5H6.75A1.75 1.75 0 0 0 5 6.25v13A1.75 1.75 0 0 0 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25v-13a1.75 1.75 0 0 0-1.75-1.75H15.5"
            {...main}
            {...cap}
          />
          <Rect x="8.5" y="3" width="7" height="3.5" rx="1.2" {...main} {...cap} />
          <Path d="m9 13.25 2.1 2.1 4-4.1" {...detail} {...cap} />
        </Svg>
      );
    case 'qna':
      return (
        <Svg {...common}>
          <Path d="M12 3.75a8.25 8.25 0 0 0-7.2 12.28L3.75 20.25l4.3-1.02A8.25 8.25 0 1 0 12 3.75z" {...main} {...cap} />
          <Path d="M9.75 9.75a2.3 2.3 0 0 1 4.47.77c0 1.53-2.22 1.9-2.22 3.23" {...detail} {...cap} />
          <Circle cx="12" cy="16.4" r="0.4" {...detail} {...cap} />
        </Svg>
      );
    case 'chat':
      return (
        <Svg {...common}>
          <Path
            d="M5.25 4.5h13.5c.97 0 1.75.78 1.75 1.75v9.5c0 .97-.78 1.75-1.75 1.75H12l-4.75 3.5V17.5h-2c-.97 0-1.75-.78-1.75-1.75v-9.5c0-.97.78-1.75 1.75-1.75z"
            {...main}
            {...cap}
          />
          {[8.25, 12, 15.75].map((x) => (
            <Circle key={x} cx={x} cy="11" r="0.35" {...detail} strokeWidth={2.2} {...cap} />
          ))}
        </Svg>
      );
    case 'menu':
      return (
        <Svg {...common}>
          {[
            [4, 4],
            [13.5, 4],
            [4, 13.5],
            [13.5, 13.5],
          ].map(([x, y]) => (
            <Rect key={`${x}-${y}`} x={x} y={y} width="6.5" height="6.5" rx="1.8" {...main} {...cap} />
          ))}
        </Svg>
      );
    case 'calendar':
      return (
        <Svg {...common}>
          <Rect x="3.75" y="5.25" width="16.5" height="15" rx="2.25" {...main} {...cap} />
          <Path d="M8 3.25v3.5M16 3.25v3.5" {...line} {...cap} />
          <Path d="M3.75 9.75h16.5" {...detail} {...cap} />
          <Path d="m9.25 14.75 1.9 1.9 3.6-3.65" {...detail} {...cap} />
        </Svg>
      );
    case 'people':
      return (
        <Svg {...common}>
          <Circle cx="9.25" cy="8" r="3.25" {...main} {...cap} />
          <Path d="M3.5 19.25a5.75 5.75 0 0 1 11.5 0 .75.75 0 0 1-.75.75h-10a.75.75 0 0 1-.75-.75z" {...main} {...cap} />
          <Path d="M15.25 5.1a3.1 3.1 0 0 1 0 5.8M17.6 14.25a5.4 5.4 0 0 1 2.9 4.9.85.85 0 0 1-.85.85H17.5" {...line} {...cap} />
        </Svg>
      );
    case 'report':
      return (
        <Svg {...common}>
          <Path
            d="M6.75 3.25h7.25l5 5v11a1.75 1.75 0 0 1-1.75 1.75H6.75A1.75 1.75 0 0 1 5 19.25V5a1.75 1.75 0 0 1 1.75-1.75z"
            {...main}
            {...cap}
          />
          <Path d="M13.75 3.5v4.75h5" {...detail} {...cap} />
          <Path d="M8.5 12.75h7M8.5 16.25h4.5" {...detail} {...cap} />
        </Svg>
      );
    case 'growth':
      return (
        <Svg {...common}>
          <Rect x="4" y="12.5" width="3.75" height="7.75" rx="1.2" {...main} {...cap} />
          <Rect x="10.13" y="8.25" width="3.75" height="12" rx="1.2" {...main} {...cap} />
          <Rect x="16.25" y="4" width="3.75" height="16.25" rx="1.2" {...main} {...cap} />
        </Svg>
      );
    case 'inbox':
      return (
        <Svg {...common}>
          <Path
            d="M4 13.25 6.3 5.6A1.75 1.75 0 0 1 7.98 4.35h8.04a1.75 1.75 0 0 1 1.68 1.25L20 13.25v5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25z"
            {...main}
            {...cap}
          />
          <Path d="M4.25 13.25h4.25l1.25 2.25h4.5l1.25-2.25h4.25" {...detail} {...cap} />
        </Svg>
      );
  }
}

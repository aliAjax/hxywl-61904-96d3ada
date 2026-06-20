export interface StarDef {
  x: number;
  y: number;
}

export interface ObstacleDef {
  x: number;
  y: number;
  w: number;
  h: number;
  type?: "wall" | "bumper";
}

export interface StarRules {
  stars: {
    minCollected?: number;
    maxShotsUsed?: number;
    minRemainingShots?: number;
    description: string;
  }[];
}

export interface LevelDef {
  id: number;
  name: string;
  ball: { x: number; y: number };
  goal: { x: number; y: number };
  stars: StarDef[];
  obstacles: ObstacleDef[];
  maxShots: number;
  gravity: number;
  bounce: number;
  starRules: StarRules;
}

const W = 800;
const H = 500;

export const CANVAS_W = W;
export const CANVAS_H = H;

export function calculateEarnedStars(
  level: LevelDef,
  collected: number,
  shotsUsed: number,
  remainingShots: number,
  cleared: boolean
): number {
  if (!cleared) return 0;

  const rules = level.starRules.stars;
  let earnedStars = 0;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    let meetsRule = true;

    if (rule.minCollected !== undefined && collected < rule.minCollected) {
      meetsRule = false;
    }
    if (rule.maxShotsUsed !== undefined && shotsUsed > rule.maxShotsUsed) {
      meetsRule = false;
    }
    if (rule.minRemainingShots !== undefined && remainingShots < rule.minRemainingShots) {
      meetsRule = false;
    }

    if (meetsRule) {
      earnedStars = i + 1;
    } else {
      break;
    }
  }

  return Math.min(earnedStars, 3);
}

export const levels: LevelDef[] = [
  {
    id: 1,
    name: "初识弹射",
    ball: { x: 100, y: 400 },
    goal: { x: 680, y: 400 },
    stars: [
      { x: 300, y: 380 },
      { x: 480, y: 380 },
      { x: 580, y: 380 },
    ],
    obstacles: [],
    maxShots: 3,
    gravity: 0.15,
    bounce: 0.7,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 2 颗星星", minCollected: 2 },
        { description: "收集全部星星", minCollected: 3 },
      ],
    },
  },
  {
    id: 2,
    name: "弧线之旅",
    ball: { x: 80, y: 420 },
    goal: { x: 700, y: 120 },
    stars: [
      { x: 250, y: 300 },
      { x: 450, y: 200 },
      { x: 620, y: 140 },
    ],
    obstacles: [
      { x: 350, y: 350, w: 20, h: 150, type: "wall" },
    ],
    maxShots: 3,
    gravity: 0.18,
    bounce: 0.65,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 2 颗星星", minCollected: 2 },
        { description: "收集全部星星", minCollected: 3 },
      ],
    },
  },
  {
    id: 3,
    name: "反弹奇径",
    ball: { x: 80, y: 250 },
    goal: { x: 700, y: 250 },
    stars: [
      { x: 200, y: 150 },
      { x: 400, y: 350 },
      { x: 600, y: 150 },
    ],
    obstacles: [
      { x: 300, y: 100, w: 20, h: 200, type: "wall" },
      { x: 500, y: 200, w: 20, h: 200, type: "wall" },
    ],
    maxShots: 4,
    gravity: 0.12,
    bounce: 0.75,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 2 颗星星", minCollected: 2 },
        { description: "3 次内通关并收集全部", maxShotsUsed: 3, minCollected: 3 },
      ],
    },
  },
  {
    id: 4,
    name: "弹力迷宫",
    ball: { x: 60, y: 440 },
    goal: { x: 720, y: 60 },
    stars: [
      { x: 180, y: 350 },
      { x: 400, y: 250 },
      { x: 580, y: 100 },
    ],
    obstacles: [
      { x: 200, y: 300, w: 150, h: 16, type: "wall" },
      { x: 400, y: 180, w: 16, h: 160, type: "wall" },
      { x: 500, y: 100, w: 150, h: 16, type: "wall" },
    ],
    maxShots: 4,
    gravity: 0.2,
    bounce: 0.7,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 2 颗星星", minCollected: 2 },
        { description: "2 次内通关并收集全部", maxShotsUsed: 2, minCollected: 3 },
      ],
    },
  },
  {
    id: 5,
    name: "星辰大海",
    ball: { x: 60, y: 440 },
    goal: { x: 740, y: 60 },
    stars: [
      { x: 150, y: 200 },
      { x: 350, y: 400 },
      { x: 550, y: 200 },
      { x: 650, y: 100 },
    ],
    obstacles: [
      { x: 120, y: 260, w: 120, h: 16, type: "wall" },
      { x: 300, y: 160, w: 16, h: 200, type: "wall" },
      { x: 450, y: 300, w: 160, h: 16, type: "wall" },
      { x: 600, y: 80, w: 16, h: 180, type: "wall" },
    ],
    maxShots: 5,
    gravity: 0.16,
    bounce: 0.68,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 3 颗星星", minCollected: 3 },
        { description: "3 次内通关并收集全部", maxShotsUsed: 3, minCollected: 4 },
      ],
    },
  },
  {
    id: 6,
    name: "终极试炼",
    ball: { x: 60, y: 440 },
    goal: { x: 740, y: 60 },
    stars: [
      { x: 140, y: 340 },
      { x: 300, y: 150 },
      { x: 500, y: 350 },
      { x: 660, y: 140 },
      { x: 400, y: 60 },
    ],
    obstacles: [
      { x: 100, y: 380, w: 140, h: 14, type: "wall" },
      { x: 250, y: 200, w: 14, h: 180, type: "wall" },
      { x: 350, y: 100, w: 140, h: 14, type: "wall" },
      { x: 450, y: 200, w: 14, h: 180, type: "wall" },
      { x: 560, y: 180, w: 140, h: 14, type: "wall" },
      { x: 640, y: 60, w: 14, h: 140, type: "wall" },
    ],
    maxShots: 5,
    gravity: 0.22,
    bounce: 0.65,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 4 颗星星", minCollected: 4 },
        { description: "3 次内通关并收集全部", maxShotsUsed: 3, minCollected: 5 },
      ],
    },
  },
  {
    id: 7,
    name: "低重力世界",
    ball: { x: 100, y: 250 },
    goal: { x: 700, y: 250 },
    stars: [
      { x: 250, y: 150 },
      { x: 400, y: 100 },
      { x: 550, y: 150 },
      { x: 400, y: 400 },
    ],
    obstacles: [
      { x: 300, y: 200, w: 200, h: 14, type: "wall" },
      { x: 500, y: 300, w: 200, h: 14, type: "wall" },
    ],
    maxShots: 4,
    gravity: 0.08,
    bounce: 0.8,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 3 颗星星", minCollected: 3 },
        { description: "2 次内通关并收集全部", maxShotsUsed: 2, minCollected: 4 },
      ],
    },
  },
  {
    id: 8,
    name: "中心孤岛",
    ball: { x: 100, y: 450 },
    goal: { x: 400, y: 250 },
    stars: [
      { x: 200, y: 350 },
      { x: 600, y: 350 },
      { x: 400, y: 100 },
      { x: 200, y: 150 },
      { x: 600, y: 150 },
    ],
    obstacles: [
      { x: 300, y: 200, w: 200, h: 14, type: "wall" },
      { x: 300, y: 286, w: 200, h: 14, type: "wall" },
      { x: 300, y: 200, w: 14, h: 100, type: "wall" },
      { x: 486, y: 200, w: 14, h: 100, type: "wall" },
    ],
    maxShots: 5,
    gravity: 0.18,
    bounce: 0.7,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 4 颗星星", minCollected: 4 },
        { description: "3 次内通关并收集全部", maxShotsUsed: 3, minCollected: 5 },
      ],
    },
  },
  {
    id: 9,
    name: "高弹挑战",
    ball: { x: 400, y: 450 },
    goal: { x: 400, y: 50 },
    stars: [
      { x: 150, y: 350 },
      { x: 650, y: 350 },
      { x: 150, y: 150 },
      { x: 650, y: 150 },
      { x: 400, y: 250 },
    ],
    obstacles: [
      { x: 250, y: 380, w: 300, h: 14, type: "wall" },
      { x: 250, y: 106, w: 300, h: 14, type: "wall" },
      { x: 350, y: 200, w: 100, h: 100, type: "wall" },
    ],
    maxShots: 4,
    gravity: 0.15,
    bounce: 0.9,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 4 颗星星", minCollected: 4 },
        { description: "2 次内通关并收集全部", maxShotsUsed: 2, minCollected: 5 },
      ],
    },
  },
  {
    id: 10,
    name: "星际迷航",
    ball: { x: 60, y: 60 },
    goal: { x: 740, y: 440 },
    stars: [
      { x: 200, y: 100 },
      { x: 350, y: 200 },
      { x: 500, y: 300 },
      { x: 650, y: 400 },
      { x: 400, y: 400 },
      { x: 150, y: 350 },
    ],
    obstacles: [
      { x: 100, y: 150, w: 16, h: 200, type: "wall" },
      { x: 250, y: 250, w: 16, h: 200, type: "wall" },
      { x: 400, y: 100, w: 16, h: 200, type: "wall" },
      { x: 550, y: 200, w: 16, h: 200, type: "wall" },
      { x: 150, y: 450, w: 500, h: 14, type: "wall" },
    ],
    maxShots: 6,
    gravity: 0.2,
    bounce: 0.65,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集 5 颗星星", minCollected: 5 },
        { description: "4 次内通关并收集全部", maxShotsUsed: 4, minCollected: 6 },
      ],
    },
  },
];

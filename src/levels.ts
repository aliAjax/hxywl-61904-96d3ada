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
}

const W = 800;
const H = 500;

export const CANVAS_W = W;
export const CANVAS_H = H;

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
  },
];

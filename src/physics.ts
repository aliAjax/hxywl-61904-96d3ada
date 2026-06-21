import { LevelDef, CANVAS_W, CANVAS_H } from "./levels";

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  sx: number;
  sy: number;
}

export interface StarState {
  x: number;
  y: number;
  collected: boolean;
  collectAnim: number;
}

export interface ObstacleState {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "wall" | "oneTime" | "slowZone" | "movingHorizontal" | "movingVertical";
  destroyed: boolean;
  destroyAnim: number;
  baseX: number;
  baseY: number;
  moveRange: number;
  moveSpeed: number;
  movePhase: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "collision" | "star" | "goal" | "destroy" | "slow";
}

export interface ScreenShake {
  x: number;
  y: number;
  intensity: number;
  duration: number;
}

export type Phase = "aim" | "fly" | "done";

export type PhysicsEvent =
  | { type: "boundaryBounce"; x: number; y: number; speed: number }
  | { type: "obstacleBounce"; x: number; y: number; speed: number; idx: number }
  | { type: "obstacleDestroy"; idx: number; cx: number; cy: number; impactSpeed: number }
  | { type: "slowZoneParticle"; x: number; y: number }
  | { type: "starCollect"; idx: number; x: number; y: number }
  | { type: "goalReach"; x: number; y: number }
  | { type: "ballStop" }
  | { type: "levelFail" };

export interface PhysicsState {
  ball: BallState;
  stars: StarState[];
  obstacles: ObstacleState[];
  trail: TrailPoint[];
  particles: Particle[];
  shake: ScreenShake;
  phase: Phase;
  shotsRemaining: number;
  shotsUsed: number;
  collected: number;
  cleared: boolean;
  goalAnim: number;
  trailCounter: number;
  accumulator: number;
}

export interface PhysicsConfig {
  ballRadius: number;
  goalRadius: number;
  starRadius: number;
  friction: number;
  slowZoneFriction: number;
  minSpeed: number;
  maxDrag: number;
  launchPower: number;
  trailMax: number;
  trailStep: number;
  maxVelocity: number;
  fixedDt: number;
  maxAccumulator: number;
  predictSteps: number;
  touchRadius: number;
  minLaunchDist: number;
  canvasW: number;
  canvasH: number;
  maxSubSteps: number;
  subStepSafeRatio: number;
}

export const DEFAULT_CONFIG: PhysicsConfig = {
  ballRadius: 12,
  goalRadius: 24,
  starRadius: 16,
  friction: 0.995,
  slowZoneFriction: 0.96,
  minSpeed: 0.25,
  maxDrag: 160,
  launchPower: 0.14,
  trailMax: 20,
  trailStep: 2,
  maxVelocity: 25,
  fixedDt: 1000 / 60,
  maxAccumulator: 100,
  predictSteps: 60,
  touchRadius: 60,
  minLaunchDist: 8,
  canvasW: CANVAS_W,
  canvasH: CANVAS_H,
  maxSubSteps: 20,
  subStepSafeRatio: 0.25,
};

const SAFE_OBSTACLE_TYPES = new Set([
  "wall", "oneTime", "slowZone", "movingHorizontal", "movingVertical",
]);

function safeObstacleType(t: string | undefined): ObstacleState["type"] {
  if (t && SAFE_OBSTACLE_TYPES.has(t)) {
    return t as ObstacleState["type"];
  }
  return "wall";
}

export function createPhysicsState(
  level: LevelDef,
  config: PhysicsConfig
): PhysicsState {
  return {
    ball: {
      x: level.ball.x,
      y: level.ball.y,
      vx: 0,
      vy: 0,
      radius: config.ballRadius,
      sx: 1,
      sy: 1,
    },
    stars: level.stars.map((s) => ({
      x: s.x,
      y: s.y,
      collected: false,
      collectAnim: 0,
    })),
    obstacles: level.obstacles.map((o) => ({
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      type: safeObstacleType(o.type),
      destroyed: false,
      destroyAnim: 0,
      baseX: o.x,
      baseY: o.y,
      moveRange: o.moveRange || 0,
      moveSpeed: o.moveSpeed !== undefined ? o.moveSpeed : 1.5,
      movePhase: 0,
    })),
    trail: [],
    particles: [],
    shake: { x: 0, y: 0, intensity: 0, duration: 0 },
    phase: "aim",
    shotsRemaining: level.maxShots,
    shotsUsed: 0,
    collected: 0,
    cleared: false,
    goalAnim: 0,
    trailCounter: 0,
    accumulator: 0,
  };
}

export function resetBall(state: PhysicsState, level: LevelDef): void {
  state.ball = {
    x: level.ball.x,
    y: level.ball.y,
    vx: 0,
    vy: 0,
    radius: state.ball.radius,
    sx: 1,
    sy: 1,
  };
  state.trail = [];
  state.trailCounter = 0;
  state.phase = "aim";
  state.particles = state.particles.filter(
    (p) => p.type === "star" || p.type === "destroy"
  );
}

export function resetAll(
  state: PhysicsState,
  level: LevelDef,
  config: PhysicsConfig
): void {
  const fresh = createPhysicsState(level, config);
  Object.assign(state, fresh);
}

export function tickPhysics(
  state: PhysicsState,
  level: LevelDef,
  config: PhysicsConfig,
  dtMs: number
): PhysicsEvent[] {
  const capped = Math.min(dtMs, config.maxAccumulator);
  state.accumulator += capped;

  const events: PhysicsEvent[] = [];

  while (state.accumulator >= config.fixedDt) {
    const stepEvents = stepPhysics(state, level, config);
    events.push(...stepEvents);
    state.accumulator -= config.fixedDt;
  }

  return events;
}

function stepPhysics(
  state: PhysicsState,
  level: LevelDef,
  config: PhysicsConfig
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];

  state.obstacles.forEach((o) => {
    if (o.destroyAnim > 0) o.destroyAnim--;
  });
  state.stars.forEach((s) => {
    if (s.collectAnim > 0) s.collectAnim--;
  });
  if (state.goalAnim > 0) state.goalAnim--;

  state.obstacles.forEach((o) => {
    if (o.destroyed) return;
    if (o.type !== "movingHorizontal" && o.type !== "movingVertical") return;
    o.movePhase += o.moveSpeed;
    if (o.movePhase > 100) {
      o.movePhase = 0;
    }
    const t = (Math.sin((o.movePhase / 100) * Math.PI * 2) + 1) / 2;
    const offset = t * o.moveRange;
    if (o.type === "movingHorizontal") {
      o.x = o.baseX + offset;
    } else {
      o.y = o.baseY + offset;
    }
  });

  updateParticles(state);
  updateShake(state);

  if (state.phase !== "fly") return events;

  const b = state.ball;

  let inSlowZone = false;
  for (let i = 0; i < state.obstacles.length; i++) {
    const ob = state.obstacles[i];
    if (ob.destroyed || ob.type !== "slowZone") continue;
    if (
      b.x + b.radius > ob.x &&
      b.x - b.radius < ob.x + ob.w &&
      b.y + b.radius > ob.y &&
      b.y - b.radius < ob.y + ob.h
    ) {
      inSlowZone = true;
      if (Math.random() < 0.3) {
        events.push({ type: "slowZoneParticle", x: b.x, y: b.y });
      }
      break;
    }
  }

  const friction = inSlowZone ? config.slowZoneFriction : config.friction;
  b.vy += level.gravity;
  b.vx *= friction;
  b.vy *= friction;

  capVelocity(b, config.maxVelocity);

  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const safeDist = b.radius * config.subStepSafeRatio;
  const subSteps = Math.min(
    config.maxSubSteps,
    Math.max(1, Math.ceil(speed / safeDist))
  );

  let anyBounced = false;
  let maxBounceSpeed = 0;

  for (let s = 0; s < subSteps; s++) {
    b.x += b.vx / subSteps;
    b.y += b.vy / subSteps;

    const boundaryResult = resolveBoundaryCollisions(b, level, config);
    for (const e of boundaryResult) {
      events.push(e);
      if (e.type === "boundaryBounce") {
        anyBounced = true;
        maxBounceSpeed = Math.max(maxBounceSpeed, e.speed);
      }
    }

    const obstacleResult = resolveObstacleCollisions(state, level);
    for (const e of obstacleResult) {
      events.push(e);
      if (e.type === "obstacleBounce") {
        anyBounced = true;
        maxBounceSpeed = Math.max(maxBounceSpeed, e.speed);
      }
      if (e.type === "obstacleDestroy") {
        anyBounced = true;
        maxBounceSpeed = Math.max(maxBounceSpeed, e.impactSpeed);
      }
    }

    const starResult = resolveStarCollection(state, config);
    for (const e of starResult) {
      events.push(e);
    }

    const goalResult = resolveGoalDetection(state, level, config);
    if (goalResult) {
      events.push(goalResult);
      return events;
    }
  }

  if (anyBounced) {
    b.sx = 0.75;
    b.sy = 1.2;
  } else {
    const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 1) {
      const stretch = Math.min(spd / 10, 0.35);
      b.sx = 1 + stretch;
      b.sy = 1 - stretch * 0.6;
    } else {
      b.sx = 1;
      b.sy = 1;
    }
  }

  state.trailCounter++;
  if (state.trailCounter >= config.trailStep) {
    state.trailCounter = 0;
    state.trail.unshift({ x: b.x, y: b.y, age: 0 });
    if (state.trail.length > config.trailMax) {
      state.trail.pop();
    }
  }
  state.trail.forEach((p) => (p.age += 1 / config.trailStep));
  state.trail = state.trail.filter((p) => p.age < config.trailMax);

  const finalSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (finalSpeed < config.minSpeed) {
    b.vx = 0;
    b.vy = 0;
    b.sx = 1;
    b.sy = 1;
    state.shotsRemaining--;
    state.shotsUsed++;
    events.push({ type: "ballStop" });

    if (state.shotsRemaining <= 0) {
      events.push({ type: "levelFail" });
    } else {
      resetBall(state, level);
    }
  }

  return events;
}

function capVelocity(ball: BallState, maxVelocity: number): void {
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (speed > maxVelocity) {
    const scale = maxVelocity / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

function resolveBoundaryCollisions(
  ball: BallState,
  level: LevelDef,
  config: PhysicsConfig
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  let bounced = false;
  let bounceSpeed = 0;

  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    bounceSpeed = Math.max(bounceSpeed, Math.abs(ball.vx));
    ball.vx = Math.abs(ball.vx) * level.bounce;
    bounced = true;
  }
  if (ball.x + ball.radius > config.canvasW) {
    ball.x = config.canvasW - ball.radius;
    bounceSpeed = Math.max(bounceSpeed, Math.abs(ball.vx));
    ball.vx = -Math.abs(ball.vx) * level.bounce;
    bounced = true;
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    bounceSpeed = Math.max(bounceSpeed, Math.abs(ball.vy));
    ball.vy = Math.abs(ball.vy) * level.bounce;
    bounced = true;
  }
  if (ball.y + ball.radius > config.canvasH) {
    ball.y = config.canvasH - ball.radius;
    bounceSpeed = Math.max(bounceSpeed, Math.abs(ball.vy));
    ball.vy = -Math.abs(ball.vy) * level.bounce;
    bounced = true;
  }

  if (bounced && bounceSpeed > 1) {
    events.push({
      type: "boundaryBounce",
      x: ball.x,
      y: ball.y,
      speed: bounceSpeed,
    });
  }

  return events;
}

function resolveObstacleCollisions(
  state: PhysicsState,
  level: LevelDef
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  const b = state.ball;

  for (let idx = 0; idx < state.obstacles.length; idx++) {
    const ob = state.obstacles[idx];
    if (ob.destroyed || ob.type === "slowZone") continue;

    const result = resolveCircleAABB(b, ob, level.bounce);
    if (!result.hit) continue;

    if (ob.type === "oneTime") {
      ob.destroyed = true;
      ob.destroyAnim = 30;
      events.push({
        type: "obstacleDestroy",
        idx,
        cx: ob.x + ob.w / 2,
        cy: ob.y + ob.h / 2,
        impactSpeed: result.impactSpeed,
      });
      b.vx *= 0.85;
      b.vy *= 0.85;
    } else {
      events.push({
        type: "obstacleBounce",
        x: result.contactX,
        y: result.contactY,
        speed: result.impactSpeed,
        idx,
      });
    }
  }

  return events;
}

interface CircleAABBResult {
  hit: boolean;
  contactX: number;
  contactY: number;
  impactSpeed: number;
}

function resolveCircleAABB(
  ball: BallState,
  ob: ObstacleState,
  bounce: number
): CircleAABBResult {
  const closestX = Math.max(ob.x, Math.min(ball.x, ob.x + ob.w));
  const closestY = Math.max(ob.y, Math.min(ball.y, ob.y + ob.h));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= ball.radius) {
    return { hit: false, contactX: 0, contactY: 0, impactSpeed: 0 };
  }

  const impactSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  let nx: number;
  let ny: number;

  if (dist > 0.001) {
    nx = dx / dist;
    ny = dy / dist;
    ball.x = closestX + nx * (ball.radius + 1);
    ball.y = closestY + ny * (ball.radius + 1);
  } else {
    const dLeft = ball.x - ob.x;
    const dRight = ob.x + ob.w - ball.x;
    const dTop = ball.y - ob.y;
    const dBottom = ob.y + ob.h - ball.y;
    const minD = Math.min(dLeft, dRight, dTop, dBottom);

    nx = 0;
    ny = 0;
    if (minD === dLeft) {
      nx = -1;
      ball.x = ob.x - ball.radius - 1;
    } else if (minD === dRight) {
      nx = 1;
      ball.x = ob.x + ob.w + ball.radius + 1;
    } else if (minD === dTop) {
      ny = -1;
      ball.y = ob.y - ball.radius - 1;
    } else {
      ny = 1;
      ball.y = ob.y + ob.h + ball.radius + 1;
    }
  }

  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx = (ball.vx - 2 * dot * nx) * bounce;
    ball.vy = (ball.vy - 2 * dot * ny) * bounce;
  }

  return {
    hit: true,
    contactX: closestX,
    contactY: closestY,
    impactSpeed,
  };
}

function resolveStarCollection(
  state: PhysicsState,
  config: PhysicsConfig
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  const b = state.ball;

  for (let i = 0; i < state.stars.length; i++) {
    const s = state.stars[i];
    if (s.collected) continue;
    const dx = b.x - s.x;
    const dy = b.y - s.y;
    if (Math.sqrt(dx * dx + dy * dy) < b.radius + config.starRadius) {
      s.collected = true;
      s.collectAnim = 30;
      state.collected++;
      events.push({ type: "starCollect", idx: i, x: s.x, y: s.y });
    }
  }

  return events;
}

function resolveGoalDetection(
  state: PhysicsState,
  level: LevelDef,
  config: PhysicsConfig
): PhysicsEvent | null {
  const b = state.ball;
  const dx = b.x - level.goal.x;
  const dy = b.y - level.goal.y;
  if (Math.sqrt(dx * dx + dy * dy) < b.radius + config.goalRadius) {
    state.shotsRemaining--;
    state.shotsUsed++;
    state.cleared = true;
    state.phase = "done";
    state.goalAnim = 60;
    return { type: "goalReach", x: level.goal.x, y: level.goal.y };
  }
  return null;
}

function updateParticles(state: PhysicsState): void {
  const ps = state.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.type === "goal" || p.type === "star" ? -0.05 : 0.1;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life--;
    if (p.life <= 0) {
      ps.splice(i, 1);
    }
  }
}

function updateShake(state: PhysicsState): void {
  const s = state.shake;
  if (s.duration > 0) {
    s.x = (Math.random() - 0.5) * s.intensity * 2;
    s.y = (Math.random() - 0.5) * s.intensity * 2;
    s.duration--;
    s.intensity *= 0.92;
  } else {
    s.x = 0;
    s.y = 0;
    s.intensity = 0;
  }
}

export function spawnParticles(
  state: PhysicsState,
  x: number,
  y: number,
  count: number,
  type: Particle["type"],
  baseColor?: string
): void {
  const colorMap: Record<Particle["type"], string> = {
    collision: baseColor || "#94a3b8",
    star: "#fbbf24",
    goal: "#22c55e",
    destroy: "#f97316",
    slow: "#a78bfa",
  };
  const color = colorMap[type];
  const sizeMap: Record<Particle["type"], [number, number]> = {
    collision: [2, 5],
    star: [3, 7],
    goal: [4, 8],
    destroy: [3, 6],
    slow: [2, 4],
  };
  const [minSize, maxSize] = sizeMap[type];
  const lifeMap: Record<Particle["type"], [number, number]> = {
    collision: [15, 30],
    star: [25, 45],
    goal: [40, 70],
    destroy: [20, 40],
    slow: [10, 20],
  };
  const [minLife, maxLife] = lifeMap[type];
  const speedMap: Record<Particle["type"], number> = {
    collision: 3,
    star: 5,
    goal: 6,
    destroy: 4,
    slow: 1.5,
  };
  const speed = speedMap[type];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + speed * 0.3;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy:
        Math.sin(angle) * spd -
        (type === "star" || type === "goal" ? 1 : 0),
      life: Math.floor(Math.random() * (maxLife - minLife) + minLife),
      maxLife: maxLife,
      size: Math.random() * (maxSize - minSize) + minSize,
      color,
      type,
    });
  }
}

export function triggerShake(
  state: PhysicsState,
  intensity: number,
  duration: number
): void {
  state.shake.intensity = intensity;
  state.shake.duration = duration;
}

export function computeLaunchVelocity(
  ballX: number,
  ballY: number,
  dragX: number,
  dragY: number,
  config: PhysicsConfig
): { vx: number; vy: number; power: number; clampedDist: number } | null {
  const dx = dragX - ballX;
  const dy = dragY - ballY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const clampedDist = Math.min(dist, config.maxDrag);

  if (clampedDist < config.minLaunchDist) return null;

  const angle = Math.atan2(dy, dx);
  const power = clampedDist * config.launchPower;

  return {
    vx: -Math.cos(angle) * power,
    vy: -Math.sin(angle) * power,
    power,
    clampedDist,
  };
}

export function applyLaunch(
  state: PhysicsState,
  dragX: number,
  dragY: number,
  config: PhysicsConfig
): boolean {
  const result = computeLaunchVelocity(
    state.ball.x,
    state.ball.y,
    dragX,
    dragY,
    config
  );
  if (!result) return false;

  state.ball.vx = result.vx;
  state.ball.vy = result.vy;
  state.ball.sx = 1.4;
  state.ball.sy = 0.7;
  state.phase = "fly";
  return true;
}

export function predictTrajectory(
  state: PhysicsState,
  level: LevelDef,
  config: PhysicsConfig,
  vx: number,
  vy: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let px = state.ball.x;
  let py = state.ball.y;
  let pvx = vx;
  let pvy = vy;
  const r = config.ballRadius;

  for (let i = 0; i < config.predictSteps; i++) {
    pvy += level.gravity;

    let inSlowZone = false;
    for (const ob of state.obstacles) {
      if (ob.destroyed || ob.type !== "slowZone") continue;
      if (
        px + r > ob.x &&
        px - r < ob.x + ob.w &&
        py + r > ob.y &&
        py - r < ob.y + ob.h
      ) {
        inSlowZone = true;
      }
    }

    const friction = inSlowZone ? config.slowZoneFriction : config.friction;
    pvx *= friction;
    pvy *= friction;

    const speed = Math.sqrt(pvx * pvx + pvy * pvy);
    const safeDist = r * config.subStepSafeRatio;
    const subSteps = Math.min(
      config.maxSubSteps,
      Math.max(1, Math.ceil(speed / safeDist))
    );

    for (let s = 0; s < subSteps; s++) {
      px += pvx / subSteps;
      py += pvy / subSteps;

      if (px - r < 0) {
        px = r;
        pvx = Math.abs(pvx) * level.bounce;
      }
      if (px + r > config.canvasW) {
        px = config.canvasW - r;
        pvx = -Math.abs(pvx) * level.bounce;
      }
      if (py - r < 0) {
        py = r;
        pvy = Math.abs(pvy) * level.bounce;
      }
      if (py + r > config.canvasH) {
        py = config.canvasH - r;
        pvy = -Math.abs(pvy) * level.bounce;
      }

      let hitObstacle = false;
      for (const ob of state.obstacles) {
        if (hitObstacle) break;
        if (ob.destroyed || ob.type === "slowZone") continue;

        const closestX = Math.max(ob.x, Math.min(px, ob.x + ob.w));
        const closestY = Math.max(ob.y, Math.min(py, ob.y + ob.h));
        const odx = px - closestX;
        const ody = py - closestY;
        const odist = Math.sqrt(odx * odx + ody * ody);
        if (odist < r) {
          if (odist > 0.001) {
            const onx = odx / odist;
            const ony = ody / odist;
            px = closestX + onx * (r + 1);
            py = closestY + ony * (r + 1);
            const odot = pvx * onx + pvy * ony;
            pvx = (pvx - 2 * odot * onx) * level.bounce;
            pvy = (pvy - 2 * odot * ony) * level.bounce;
          } else {
            const dLeft = px - ob.x;
            const dRight = ob.x + ob.w - px;
            const dTop = py - ob.y;
            const dBottom = ob.y + ob.h - py;
            const minD = Math.min(dLeft, dRight, dTop, dBottom);
            let onx = 0;
            let ony = 0;
            if (minD === dLeft) {
              onx = -1;
              px = ob.x - r - 1;
            } else if (minD === dRight) {
              onx = 1;
              px = ob.x + ob.w + r + 1;
            } else if (minD === dTop) {
              ony = -1;
              py = ob.y - r - 1;
            } else {
              ony = 1;
              py = ob.y + ob.h + r + 1;
            }
            const odot = pvx * onx + pvy * ony;
            pvx = (pvx - 2 * odot * onx) * level.bounce;
            pvy = (pvy - 2 * odot * ony) * level.bounce;
          }
          if (ob.type === "oneTime") {
            hitObstacle = true;
          }
        }
      }
    }

    pts.push({ x: px, y: py });

    const gdx = px - level.goal.x;
    const gdy = py - level.goal.y;
    if (Math.sqrt(gdx * gdx + gdy * gdy) < r + config.goalRadius) break;

    const sp = Math.sqrt(pvx * pvx + pvy * pvy);
    if (sp < config.minSpeed) break;
  }

  return pts;
}

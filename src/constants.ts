// ╔══════════════════════════════════════════════════╗
// ║  SiegeGuard — 3D Tower Defense Game             ║
// ║  Constants & Type Definitions                    ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';

// ─── Grid ──────────────────────────────────────────
export const GRID_COLS = 12;
export const GRID_ROWS = 8;
export const CELL_SIZE = 2;
export const GRID_OFFSET_X = -(GRID_COLS / 2 - 0.5) * CELL_SIZE; // -11
export const GRID_OFFSET_Z = -(GRID_ROWS / 2 - 0.5) * CELL_SIZE; // -7

// ─── Tower Types ───────────────────────────────────
export enum TowerType {
  Arrow = 'arrow',
  Cannon = 'cannon',
  Ice = 'ice',
  Lightning = 'lightning',
}

export interface TowerConfig {
  type: TowerType;
  name: string;
  icon: string;
  cost: number;
  damage: number;
  range: number;
  fireRate: number;      // seconds between shots
  slowFactor: number;    // 1 = no slow, 0.5 = half speed
  slowDuration: number;  // seconds
  aoeRadius: number;     // 0 = single target
  chainCount: number;    // 0 = no chain
  color: number;
  description: string;
}

export const TOWER_CONFIGS: Record<TowerType, TowerConfig> = {
  [TowerType.Arrow]: {
    type: TowerType.Arrow,
    name: '箭塔',
    icon: '🏹',
    cost: 100,
    damage: 18,
    range: 5,
    fireRate: 0.5,
    slowFactor: 1,
    slowDuration: 0,
    aoeRadius: 0,
    chainCount: 0,
    color: 0x4fc3f7,
    description: '快速单目标攻击',
  },
  [TowerType.Cannon]: {
    type: TowerType.Cannon,
    name: '炮塔',
    icon: '💣',
    cost: 200,
    damage: 45,
    range: 4,
    fireRate: 1.5,
    slowFactor: 1,
    slowDuration: 0,
    aoeRadius: 2.5,
    chainCount: 0,
    color: 0xff7043,
    description: '范围爆炸伤害',
  },
  [TowerType.Ice]: {
    type: TowerType.Ice,
    name: '冰塔',
    icon: '❄️',
    cost: 150,
    damage: 12,
    range: 4.5,
    fireRate: 1.0,
    slowFactor: 0.4,
    slowDuration: 2.0,
    aoeRadius: 3,     // area slow — all enemies in range get slowed
    chainCount: 0,
    color: 0x4dd0e1,
    description: '范围减速敌人 60%',
  },
  [TowerType.Lightning]: {
    type: TowerType.Lightning,
    name: '电塔',
    icon: '⚡',
    cost: 250,
    damage: 28,
    range: 5.5,
    fireRate: 0.8,
    slowFactor: 1,
    slowDuration: 0,
    aoeRadius: 0,
    chainCount: 3,
    color: 0xffd740,
    description: '连锁 3 个目标',
  },
};

// ─── Enemy Types ───────────────────────────────────
export enum EnemyType {
  Grunt = 'grunt',
  Runner = 'runner',
  Tank = 'tank',
  Boss = 'boss',
}

export interface EnemyConfig {
  type: EnemyType;
  name: string;
  maxHp: number;
  speed: number;       // units per second
  reward: number;
  color: number;
  emissive: number;
  scale: number;       // relative size
}

export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  [EnemyType.Grunt]: {
    type: EnemyType.Grunt, name: '小兵',
    maxHp: 80, speed: 1.5, reward: 25,
    color: 0xe57373, emissive: 0x330000, scale: 0.7,
  },
  [EnemyType.Runner]: {
    type: EnemyType.Runner, name: '快兵',
    maxHp: 50, speed: 3.0, reward: 30,
    color: 0xffb74d, emissive: 0x331100, scale: 0.55,
  },
  [EnemyType.Tank]: {
    type: EnemyType.Tank, name: '重装',
    maxHp: 250, speed: 0.8, reward: 60,
    color: 0x5c6bc0, emissive: 0x000022, scale: 0.9,
  },
  [EnemyType.Boss]: {
    type: EnemyType.Boss, name: 'Boss',
    maxHp: 800, speed: 0.5, reward: 200,
    color: 0xffd740, emissive: 0x331100, scale: 1.2,
  },
};

// ─── Wave Config ───────────────────────────────────
export interface WaveEntry {
  type: EnemyType;
  count: number;
  interval: number; // seconds between spawns
}

export interface WaveConfig {
  entries: WaveEntry[];
  bonusGold: number;
}

// ─── Path Waypoints (S-shaped path through 12×8 grid) ──
// Each waypoint is [col, row] in grid coordinates
export const PATH_WAYPOINTS: [number, number][] = [
  [0, 0], [5, 0],                                 // row 0: left → right
  [5, 2], [1, 2],                                 // down then left
  [1, 4], [8, 4],                                 // down then right
  [8, 6], [11, 6],                                // down then right
  [11, 7],                                        // down to exit
];

// Generate full path cells (all cells between waypoints)
export function getPathCells(): Set<string> {
  const cells = new Set<string>();
  for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
    const [x1, z1] = PATH_WAYPOINTS[i - 1];
    const [x2, z2] = PATH_WAYPOINTS[i];
    if (x1 === x2) {
      // vertical
      const minZ = Math.min(z1, z2);
      const maxZ = Math.max(z1, z2);
      for (let z = minZ; z <= maxZ; z++) {
        cells.add(`${x1},${z}`);
        // mark adjacent cells as path too (2-wide)
        cells.add(`${x1},${z}`);
      }
    } else {
      // horizontal
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX; x <= maxX; x++) {
        cells.add(`${x},${z1}`);
      }
    }
  }
  return cells;
}

// Generate full path as world-space positions for enemy movement
export function getPathPositions(): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
    const [x1, z1] = PATH_WAYPOINTS[i - 1];
    const [x2, z2] = PATH_WAYPOINTS[i];
    const sx = GRID_OFFSET_X + x1 * CELL_SIZE;
    const sz = GRID_OFFSET_Z + z1 * CELL_SIZE;
    const ex = GRID_OFFSET_X + x2 * CELL_SIZE;
    const ez = GRID_OFFSET_Z + z2 * CELL_SIZE;
    // Sample points along the segment for smooth movement
    const dist = Math.sqrt((ex - sx) ** 2 + (ez - sz) ** 2);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      positions.push(new THREE.Vector3(
        sx + (ex - sx) * t,
        0,
        sz + (ez - sz) * t,
      ));
    }
  }
  // Deduplicate
  const deduped: THREE.Vector3[] = [];
  for (const p of positions) {
    const last = deduped[deduped.length - 1];
    if (!last || p.distanceToSquared(last) > 0.001) {
      deduped.push(p);
    }
  }
  return deduped;
}

// ─── Game State ────────────────────────────────────
export enum GamePhase {
  Building = 'building',
  Combat = 'combat',
  GameOver = 'gameover',
  Victory = 'victory',
}

export interface GameState {
  phase: GamePhase;
  gold: number;
  lives: number;
  wave: number;
  score: number;
}

export const INITIAL_GOLD = 400;
export const INITIAL_LIVES = 20;
export const TOTAL_WAVES = 15;
export const SELL_REFUND_RATIO = 0.5;

// ─── Tower Instance ────────────────────────────────
export interface TowerInstance {
  id: number;
  config: TowerConfig;
  gridCol: number;
  gridRow: number;
  worldPos: THREE.Vector3;
  mesh: THREE.Group;
  rangeRing: THREE.Mesh;
  cooldown: number;
  level: number;
  target: EnemyInstance | null;
}

// ─── Enemy Instance ────────────────────────────────
export interface EnemyInstance {
  id: number;
  config: EnemyConfig;
  hp: number;
  maxHp: number;
  speed: number;
  worldPos: THREE.Vector3;
  mesh: THREE.Group;
  hpBarGroup: THREE.Group;    // 3D HP bar group (child of mesh)
  hpFill: THREE.Mesh;         // fill bar mesh (scale.x = hp ratio)
  pathIndex: number;
  pathProgress: number;
  alive: boolean;
  reachedEnd: boolean;
  slowTimer: number;
  slowFactor: number;
}

// ─── Projectile Instance ───────────────────────────
export interface ProjectileInstance {
  id: number;
  sourceTower: TowerInstance;
  target: EnemyInstance;
  position: THREE.Vector3;
  mesh: THREE.Mesh | THREE.Group;
  damage: number;
  speed: number;
  aoeRadius: number;
  slowFactor: number;
  slowDuration: number;
  chainCount: number;
  alive: boolean;
}

// ─── Effect Instance ───────────────────────────────
export interface ParticleEffect {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  mesh: THREE.Mesh;
  size: number;
}

// ─── Helper ────────────────────────────────────────
export function gridToWorld(col: number, row: number): THREE.Vector3 {
  return new THREE.Vector3(
    GRID_OFFSET_X + col * CELL_SIZE,
    0,
    GRID_OFFSET_Z + row * CELL_SIZE,
  );
}

export function worldToGrid(pos: THREE.Vector3): [number, number] {
  const col = Math.round((pos.x - GRID_OFFSET_X) / CELL_SIZE);
  const row = Math.round((pos.z - GRID_OFFSET_Z) / CELL_SIZE);
  return [col, row];
}

export function isGridValid(col: number, row: number): boolean {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

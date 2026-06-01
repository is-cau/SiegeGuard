// ╔══════════════════════════════════════════════════╗
// ║  GameManager — Game State & Wave Control        ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  GamePhase, GameState, WaveConfig, WaveEntry,
  EnemyType, TowerType, TOWER_CONFIGS,
  INITIAL_GOLD, INITIAL_LIVES, TOTAL_WAVES,
} from './constants';
import { MapManager } from './MapManager';
import { TowerManager } from './TowerManager';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { EffectManager } from './EffectManager';

export class GameManager {
  public state: GameState;
  public mapManager: MapManager;
  public towerManager: TowerManager;
  public enemyManager: EnemyManager;
  public projectileManager: ProjectileManager;
  public effectManager: EffectManager;

  public selectedTowerType: TowerType | null = null;
  public gameSpeed: number = 1; // 1 = normal, 2 = double speed

  // Wave state
  private waveQueue: WaveEntry[] = [];
  private waveSpawnTimer = 0;
  private waveEntryIndex = 0;
  private waveSpawnedCount = 0;
  private waveAllSpawned = false;

  // Callbacks
  public onStateChanged: ((state: GameState) => void) | null = null;
  public onMessage: ((msg: string) => void) | null = null;
  public onGoldChanged: ((gold: number) => void) | null = null;
  public onLivesChanged: ((lives: number) => void) | null = null;
  public onSpeedChanged: ((speed: number) => void) | null = null;

  constructor(
    mapManager: MapManager,
    towerManager: TowerManager,
    enemyManager: EnemyManager,
    projectileManager: ProjectileManager,
    effectManager: EffectManager,
  ) {
    this.mapManager = mapManager;
    this.towerManager = towerManager;
    this.enemyManager = enemyManager;
    this.projectileManager = projectileManager;
    this.effectManager = effectManager;

    this.state = {
      phase: GamePhase.Building,
      gold: INITIAL_GOLD,
      lives: INITIAL_LIVES,
      wave: 0,
      score: 0,
    };

    // Wire up callbacks
    this.projectileManager.onEnemyKilled = (enemy) => {
      this.state.gold += enemy.config.reward;
      this.state.score += enemy.config.reward;
      // Death effect
      this.effectManager.spawnExplosion(enemy.worldPos.clone(), new THREE.Color(enemy.config.color), 15);
      if (this.onGoldChanged) this.onGoldChanged(this.state.gold);
    };
  }

  public toggleSpeed(): void {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    if (this.onSpeedChanged) this.onSpeedChanged(this.gameSpeed);
    if (this.onMessage) this.onMessage(this.gameSpeed === 2 ? '⏩ 二倍速' : '⏩ 一倍速');
  }

  public selectTower(type: TowerType | null): void {
    this.selectedTowerType = type;
  }

  public canAfford(type: TowerType): boolean {
    return this.state.gold >= TOWER_CONFIGS[type].cost;
  }

  public placeTower(type: TowerType, col: number, row: number): boolean {
    if (!this.canAfford(type)) return false;
    if (!this.mapManager.isCellPlaceable(col, row)) return false;

    this.state.gold -= TOWER_CONFIGS[type].cost;
    this.mapManager.occupiedCells.add(`${col},${row}`);
    this.towerManager.placeTower(type, col, row);

    if (this.onGoldChanged) this.onGoldChanged(this.state.gold);
    return true;
  }

  public sellTower(col: number, row: number): void {
    const refund = this.towerManager.sellTower(col, row);
    if (refund > 0) {
      this.state.gold += refund;
      this.mapManager.occupiedCells.delete(`${col},${row}`);
      if (this.onGoldChanged) this.onGoldChanged(this.state.gold);
    }
  }

  public startWave(): void {
    if (this.state.phase !== GamePhase.Building) return;

    this.state.wave++;
    this.state.phase = GamePhase.Combat;

    // Generate wave config
    const waveConfig = this.generateWaveConfig(this.state.wave);
    this.waveQueue = [...waveConfig.entries];
    this.waveEntryIndex = 0;
    this.waveSpawnedCount = 0;
    this.waveSpawnTimer = 0;
    this.waveAllSpawned = false;

    this.showMessage(`🌊 第 ${this.state.wave} 波来袭！`);
    if (this.onStateChanged) this.onStateChanged(this.state);
  }

  private generateWaveConfig(wave: number): WaveConfig {
    const entries: WaveEntry[] = [];
    const difficulty = wave / TOTAL_WAVES;

    // Grunts: always present
    entries.push({
      type: EnemyType.Grunt,
      count: 3 + Math.floor(difficulty * 8),
      interval: Math.max(0.3, 1.2 - difficulty * 0.7),
    });

    // Runners: starting wave 3
    if (wave >= 3) {
      entries.push({
        type: EnemyType.Runner,
        count: 2 + Math.floor(difficulty * 5),
        interval: Math.max(0.2, 0.8 - difficulty * 0.4),
      });
    }

    // Tanks: starting wave 5
    if (wave >= 5) {
      entries.push({
        type: EnemyType.Tank,
        count: 1 + Math.floor(difficulty * 3),
        interval: 1.5 + (1 - difficulty) * 1.5,
      });
    }

    // Boss: waves 5, 10, 15
    if (wave % 5 === 0) {
      entries.push({
        type: EnemyType.Boss,
        count: 1,
        interval: 2,
      });
    }

    return { entries, bonusGold: 50 + wave * 25 };
  }

  public update(dt: number): void {
    const speedDt = dt * this.gameSpeed;

    // Update combat
    if (this.state.phase === GamePhase.Combat) {
      this.updateWaveSpawning(speedDt);

      // Check wave completion
      if (this.waveAllSpawned &&
          this.enemyManager.getActiveCount() === 0 &&
          this.projectileManager.projectiles.length === 0) {
        this.completeWave();
      }

      // Check game over
      if (this.state.lives <= 0) {
        this.state.phase = GamePhase.GameOver;
        this.showMessage('💀 游戏结束！点击重置重新开始');
        if (this.onStateChanged) this.onStateChanged(this.state);
        return;
      }

      // Check victory
      if (this.state.wave >= TOTAL_WAVES &&
          this.waveAllSpawned &&
          this.enemyManager.getActiveCount() === 0) {
        this.state.phase = GamePhase.Victory;
        this.showMessage('🎉 恭喜通关！你保卫了城池！');
        if (this.onStateChanged) this.onStateChanged(this.state);
      }
    }

    // Check for enemies that reached the end
    const enemiesReachedEnd = this.enemyManager.enemies.filter(e => e.reachedEnd && e.alive);
    for (const enemy of enemiesReachedEnd) {
      this.state.lives--;
      enemy.alive = false;
      if (this.onLivesChanged) this.onLivesChanged(this.state.lives);
    }
  }

  private updateWaveSpawning(dt: number): void {
    if (this.waveEntryIndex >= this.waveQueue.length) {
      this.waveAllSpawned = true;
      return;
    }

    this.waveSpawnTimer -= dt;

    while (this.waveSpawnTimer <= 0 && this.waveEntryIndex < this.waveQueue.length) {
      const entry = this.waveQueue[this.waveEntryIndex];

      // Spawn one enemy
      this.enemyManager.spawnEnemy(entry.type);
      this.waveSpawnedCount++;

      // HP scaling based on wave
      const lastEnemy = this.enemyManager.enemies[this.enemyManager.enemies.length - 1];
      if (lastEnemy) {
        const hpMult = 1 + (this.state.wave - 1) * 0.1;
        lastEnemy.hp = Math.floor(lastEnemy.hp * hpMult);
        lastEnemy.maxHp = lastEnemy.hp;
        lastEnemy.speed = lastEnemy.config.speed * (1 + (this.state.wave - 1) * 0.03);
        this.enemyManager.drawHpBar(lastEnemy);
      }

      // Move to next entry or reset timer
      if (this.waveSpawnedCount >= entry.count) {
        this.waveEntryIndex++;
        this.waveSpawnedCount = 0;
        if (this.waveEntryIndex < this.waveQueue.length) {
          this.waveSpawnTimer = 1.5; // gap between entry types
        }
      } else {
        this.waveSpawnTimer = entry.interval;
      }

      // Safety: don't spawn too many in one frame
      if (this.waveSpawnTimer <= 0 && this.waveSpawnedCount >= entry.count) {
        break;
      }
    }
  }

  private completeWave(): void {
    const waveConfig = this.generateWaveConfig(this.state.wave);
    this.state.gold += waveConfig.bonusGold;
    this.state.phase = GamePhase.Building;

    this.showMessage(`✅ 第 ${this.state.wave} 波清除！奖励 💰${waveConfig.bonusGold}`);
    if (this.onGoldChanged) this.onGoldChanged(this.state.gold);
    if (this.onStateChanged) this.onStateChanged(this.state);
  }

  public reset(): void {
    // Clean up all entities
    this.enemyManager.dispose();
    this.towerManager.dispose();
    this.projectileManager.dispose();
    this.effectManager.dispose();
    this.mapManager.occupiedCells.clear();

    this.state = {
      phase: GamePhase.Building,
      gold: INITIAL_GOLD,
      lives: INITIAL_LIVES,
      wave: 0,
      score: 0,
    };
    this.selectedTowerType = null;
    this.waveQueue = [];
    this.waveSpawnTimer = 0;
    this.waveEntryIndex = 0;
    this.waveSpawnedCount = 0;
    this.waveAllSpawned = false;

    if (this.onStateChanged) this.onStateChanged(this.state);
    if (this.onGoldChanged) this.onGoldChanged(this.state.gold);
    if (this.onLivesChanged) this.onLivesChanged(this.state.lives);
  }

  private showMessage(msg: string): void {
    if (this.onMessage) this.onMessage(msg);
  }
}

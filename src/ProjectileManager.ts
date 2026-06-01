// ╔══════════════════════════════════════════════════╗
// ║  ProjectileManager — Projectiles & Hit Logic    ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  ProjectileInstance, TowerInstance, EnemyInstance,
  TowerType,
} from './constants';
import { EnemyManager } from './EnemyManager';
import { EffectManager } from './EffectManager';

export class ProjectileManager {
  private scene: THREE.Scene;
  private enemyManager: EnemyManager;
  private effectManager: EffectManager;
  public projectiles: ProjectileInstance[] = [];
  private idCounter = 0;

  public onEnemyKilled: ((enemy: EnemyInstance) => void) | null = null;

  constructor(scene: THREE.Scene, enemyManager: EnemyManager, effectManager: EffectManager) {
    this.scene = scene;
    this.enemyManager = enemyManager;
    this.effectManager = effectManager;
  }

  public fireProjectile(tower: TowerInstance, target: EnemyInstance): void {
    const config = tower.config;
    const mesh = this.createProjectileMesh(config);

    const instance: ProjectileInstance = {
      id: this.idCounter++,
      sourceTower: tower,
      target,
      position: tower.worldPos.clone().add(new THREE.Vector3(0, 0.8, 0)),
      mesh,
      damage: config.damage,
      speed: 8,
      aoeRadius: config.aoeRadius,
      slowFactor: config.slowFactor,
      slowDuration: config.slowDuration,
      chainCount: config.chainCount,
      alive: true,
    };

    mesh.position.copy(instance.position);
    this.scene.add(mesh);
    this.projectiles.push(instance);
  }

  private createProjectileMesh(config: TowerInstance['config']): THREE.Mesh {
    switch (config.type) {
      case TowerType.Arrow: {
        const geo = new THREE.ConeGeometry(0.12, 0.5, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2; // point forward
        return mesh;
      }
      case TowerType.Cannon: {
        const geo = new THREE.SphereGeometry(0.2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        return new THREE.Mesh(geo, mat);
      }
      case TowerType.Ice: {
        const geo = new THREE.OctahedronGeometry(0.15, 0);
        const mat = new THREE.MeshBasicMaterial({ color: 0x80deea });
        return new THREE.Mesh(geo, mat);
      }
      case TowerType.Lightning: {
        const geo = new THREE.SphereGeometry(0.15, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
        return new THREE.Mesh(geo, mat);
      }
      default: {
        const geo = new THREE.SphereGeometry(0.15, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        return new THREE.Mesh(geo, mat);
      }
    }
  }

  public update(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) {
        this.cleanupProjectile(proj);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check if target still valid
      if (!proj.target.alive) {
        proj.alive = false;
        continue;
      }

      // Move toward target
      const toTarget = proj.target.worldPos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(proj.position);
      const distToTarget = toTarget.length();

      if (distToTarget < 0.4) {
        // Hit!
        this.onProjectileHit(proj);
        proj.alive = false;
        continue;
      }

      const moveStep = proj.speed * dt;
      toTarget.normalize();
      proj.position.add(toTarget.clone().multiplyScalar(Math.min(moveStep, distToTarget)));
      proj.mesh.position.copy(proj.position);

      // Rotate projectile to face direction
      if (toTarget.lengthSq() > 0.001) {
        proj.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          toTarget.clone().normalize(),
        );
      }

      // Adjust target position (in case target moved)
      if (proj.target.alive) {
        // Simple homing - adjust direction slightly
        const newDir = proj.target.worldPos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(proj.position).normalize();
        const currentDir = toTarget;
        // Only adjust if target is still somewhat ahead
        if (currentDir.dot(newDir) > 0) {
          // Fine
        }
      }
    }
  }

  private onProjectileHit(proj: ProjectileInstance): void {
    const pos = proj.position.clone();

    // AOE damage
    if (proj.aoeRadius > 0) {
      const enemies = this.enemyManager.getEnemiesInRange(pos, proj.aoeRadius);
      for (const enemy of enemies) {
        const killed = this.enemyManager.takeDamage(enemy, proj.damage);
        if (killed && this.onEnemyKilled) {
          this.onEnemyKilled(enemy);
        }
      }
      // AOE explosion effect
      this.effectManager.spawnExplosion(pos, new THREE.Color(0xff6600), 20);
    } else if (proj.chainCount > 0) {
      // Chain lightning
      const hitEnemies: EnemyInstance[] = [];
      let currentEnemy = proj.target;

      for (let c = 0; c <= proj.chainCount && currentEnemy && currentEnemy.alive; c++) {
        const killed = this.enemyManager.takeDamage(
          currentEnemy,
          c === 0 ? proj.damage : proj.damage * 0.7,
        );
        hitEnemies.push(currentEnemy);
        if (killed && this.onEnemyKilled) {
          this.onEnemyKilled(currentEnemy);
        }

        // Find next chain target (closest not yet hit)
        const nearby = this.enemyManager.getEnemiesInRange(
          currentEnemy.worldPos,
          proj.sourceTower.config.range * 0.8,
        ).filter(e => !hitEnemies.includes(e) && e.alive);
        currentEnemy = nearby.length > 0 ? nearby[0] : null!;
      }

      // Lightning visual
      this.effectManager.spawnLightningChain(
        hitEnemies.map(e => e.worldPos.clone()),
      );
      this.effectManager.spawnExplosion(pos, new THREE.Color(0xffd740), 8);
    } else {
      // Single target
      const killed = this.enemyManager.takeDamage(
        proj.target,
        proj.damage,
        proj.slowFactor,
        proj.slowDuration,
      );
      if (killed && this.onEnemyKilled) {
        this.onEnemyKilled(proj.target);
      }

      // Effect based on tower type
      if (proj.slowFactor < 1) {
        this.effectManager.spawnIceEffect(proj.target.worldPos.clone());
      } else {
        this.effectManager.spawnExplosion(pos, new THREE.Color(0xffcc80), 5);
      }
    }
  }

  private cleanupProjectile(proj: ProjectileInstance): void {
    this.scene.remove(proj.mesh);
    if (Array.isArray(proj.mesh.material)) {
      proj.mesh.material.forEach(m => m.dispose());
    } else {
      proj.mesh.material.dispose();
    }
    proj.mesh.geometry.dispose();
  }

  public dispose(): void {
    for (const proj of this.projectiles) {
      this.cleanupProjectile(proj);
    }
    this.projectiles = [];
  }
}

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
      speed: config.type === TowerType.Cannon ? 5 : 10,
      aoeRadius: config.aoeRadius,
      slowFactor: config.slowFactor,
      slowDuration: config.slowDuration,
      chainCount: config.chainCount,
      alive: true,
    };

    // Face initial direction toward target
    mesh.position.copy(instance.position);
    this.scene.add(mesh);
    this.projectiles.push(instance);
  }

  private createProjectileMesh(config: TowerInstance['config']): THREE.Mesh | THREE.Group {
    switch (config.type) {
      case TowerType.Arrow: {
        // Arrow: long shaft + pointed tip
        const group = new THREE.Group();
        // Shaft
        const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6);
        const shaftMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        group.add(shaft);
        // Tip
        const tipGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
        const tipMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.y = 0.55;
        group.add(tip);
        // Fletching
        const fletchGeo = new THREE.BoxGeometry(0.12, 0.04, 0.02);
        const fletchMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        const fletch1 = new THREE.Mesh(fletchGeo, fletchMat);
        fletch1.position.set(0, -0.4, 0.04);
        group.add(fletch1);
        const fletch2 = new THREE.Mesh(fletchGeo, fletchMat);
        fletch2.position.set(0, -0.4, -0.04);
        group.add(fletch2);
        return group;
      }
      case TowerType.Cannon: {
        // Bomb: large dark sphere with fuse glow
        const geo = new THREE.SphereGeometry(0.25, 12, 10);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x333333,
          roughness: 0.4,
          metalness: 0.7,
          emissive: 0x441100,
        });
        const bomb = new THREE.Mesh(geo, mat);
        // Fuse spark
        const sparkGeo = new THREE.SphereGeometry(0.06, 4, 4);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.y = 0.28;
        bomb.add(spark);
        return bomb;
      }
      case TowerType.Ice: {
        // Ice: bright blue crystal shard
        const geo = new THREE.OctahedronGeometry(0.18, 0);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x80deea,
          roughness: 0.1,
          metalness: 0.1,
          emissive: 0x115566,
          transparent: true,
          opacity: 0.9,
        });
        return new THREE.Mesh(geo, mat);
      }
      case TowerType.Lightning: {
        // Lightning: small bright orb
        const geo = new THREE.SphereGeometry(0.12, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        return new THREE.Mesh(geo, mat);
      }
      default:
        const geo = new THREE.SphereGeometry(0.15, 4, 4);
        return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
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

      if (!proj.target.alive) {
        proj.alive = false;
        continue;
      }

      const targetPos = proj.target.worldPos.clone().add(new THREE.Vector3(0, 0.5, 0));
      const toTarget = targetPos.clone().sub(proj.position);
      const distToTarget = toTarget.length();

      if (distToTarget < 0.5) {
        this.onProjectileHit(proj);
        proj.alive = false;
        continue;
      }

      toTarget.normalize();
      proj.position.add(toTarget.clone().multiplyScalar(proj.speed * dt));
      proj.mesh.position.copy(proj.position);

      // Orient toward target
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, toTarget);
      proj.mesh.quaternion.slerp(quat, 0.3);

      // Spin cannonballs
      if (proj.sourceTower.config.type === TowerType.Cannon) {
        proj.mesh.rotateY(dt * 5);
      }
    }
  }

  private onProjectileHit(proj: ProjectileInstance): void {
    const pos = proj.position.clone();

    // AOE damage/slow (Cannon = AOE damage, Ice = AOE slow)
    if (proj.aoeRadius > 0) {
      const enemies = this.enemyManager.getEnemiesInRange(pos, proj.aoeRadius);
      for (const enemy of enemies) {
        // Ice applies slow to ALL in range, cannon just deals damage
        const killed = this.enemyManager.takeDamage(
          enemy, proj.damage, proj.slowFactor, proj.slowDuration,
        );
        if (killed && this.onEnemyKilled) {
          this.onEnemyKilled(enemy);
        }
      }
      // Visual effect
      if (proj.slowFactor < 1) {
        // Ice: frost nova ring
        this.effectManager.spawnIceEffect(pos);
        for (const enemy of enemies) {
          this.effectManager.spawnIceEffect(enemy.worldPos.clone());
        }
      } else {
        // Cannon: explosion
        this.effectManager.spawnExplosion(pos, new THREE.Color(0xff6600), 25);
        this.effectManager.spawnExplosion(
          pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
          new THREE.Color(0xffcc00), 15,
        );
      }
    } else if (proj.chainCount > 0) {
      // Chain lightning
      const hitEnemies: EnemyInstance[] = [];
      let currentEnemy: EnemyInstance = proj.target;

      for (let c = 0; c <= proj.chainCount && currentEnemy && currentEnemy.alive; c++) {
        const dmg = c === 0 ? proj.damage : Math.floor(proj.damage * 0.7);
        const killed = this.enemyManager.takeDamage(currentEnemy, dmg);
        hitEnemies.push(currentEnemy);
        if (killed && this.onEnemyKilled) {
          this.onEnemyKilled(currentEnemy);
        }

        // Find next chain target (closest not yet hit)
        const nearby = this.enemyManager.getEnemiesInRange(
          currentEnemy.worldPos,
          proj.sourceTower.config.range * 0.8,
        ).filter(e => !hitEnemies.includes(e) && e.alive);

        if (nearby.length > 0) {
          currentEnemy = nearby[0];
        } else {
          break;
        }
      }

      // Lightning visual with jagged arcs
      this.effectManager.spawnLightningChain(
        hitEnemies.map(e => e.worldPos.clone()),
      );
      this.effectManager.spawnExplosion(
        hitEnemies[hitEnemies.length - 1].worldPos.clone(),
        new THREE.Color(0xffff00),
        8,
      );
    } else {
      // Single target (Arrow only — no AOE, no chain)
      const killed = this.enemyManager.takeDamage(
        proj.target,
        proj.damage,
      );

      // Arrow hit — small spark
      this.effectManager.spawnExplosion(pos, new THREE.Color(0xffcc80), 4);

      if (killed && this.onEnemyKilled) {
        this.onEnemyKilled(proj.target);
      }
    }
  }

  private cleanupProjectile(proj: ProjectileInstance): void {
    this.scene.remove(proj.mesh);
    if (proj.mesh instanceof THREE.Group) {
      proj.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    } else {
      if (Array.isArray(proj.mesh.material)) {
        proj.mesh.material.forEach(m => m.dispose());
      } else {
        proj.mesh.material.dispose();
      }
      proj.mesh.geometry.dispose();
    }
  }

  public dispose(): void {
    for (const proj of this.projectiles) {
      this.cleanupProjectile(proj);
    }
    this.projectiles = [];
  }
}

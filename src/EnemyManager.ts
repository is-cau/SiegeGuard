// ╔══════════════════════════════════════════════════╗
// ║  EnemyManager — Enemy Spawning & Movement       ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  EnemyInstance, EnemyType, EnemyConfig,
  ENEMY_CONFIGS, getPathPositions,
} from './constants';

const HP_BAR_WIDTH = 0.9;
const HP_BAR_HEIGHT = 0.1;
const HP_BAR_Y_OFFSET = 1.4;

export class EnemyManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera | null = null;
  public enemies: EnemyInstance[] = [];
  private pathPositions: THREE.Vector3[];
  private idCounter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pathPositions = getPathPositions();
  }

  public setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  public spawnEnemy(type: EnemyType): EnemyInstance {
    const config = ENEMY_CONFIGS[type];
    const startPos = this.pathPositions[0].clone();

    const mesh = this.createEnemyMesh(config);
    mesh.position.copy(startPos);

    // ─── 3D HP bar (BoxGeometry, no canvas/texture issues) ───
    const hpBarGroup = new THREE.Group();

    // Background bar (dark, always full width)
    const bgGeo = new THREE.BoxGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT, 0.03);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false });
    const bgBar = new THREE.Mesh(bgGeo, bgMat);
    hpBarGroup.add(bgBar);

    // Fill bar (colored, scale.x changes with HP)
    const fillGeo = new THREE.BoxGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT, 0.04);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, depthTest: false });
    const fillBar = new THREE.Mesh(fillGeo, fillMat);
    // Position fill at left edge: pivot is center, so offset by half width
    fillBar.position.x = 0;
    fillBar.position.z = 0.005;
    hpBarGroup.add(fillBar);

    // White border
    const borderGeo = new THREE.EdgesGeometry(bgGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x000000, depthTest: false });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.z = 0.01;
    hpBarGroup.add(border);

    hpBarGroup.position.y = HP_BAR_Y_OFFSET;
    mesh.add(hpBarGroup); // attach to enemy mesh so it follows

    const id = this.idCounter++;

    const instance: EnemyInstance = {
      id,
      config,
      hp: config.maxHp,
      maxHp: config.maxHp,
      speed: config.speed,
      worldPos: startPos.clone(),
      mesh,
      hpBarGroup,
      hpFill: fillBar,
      pathIndex: 0,
      pathProgress: 0,
      alive: true,
      reachedEnd: false,
      slowTimer: 0,
      slowFactor: 1,
    };

    this.scene.add(mesh);
    this.enemies.push(instance);
    return instance;
  }

  private createEnemyMesh(config: EnemyConfig): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.emissive,
      roughness: 0.4,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = 'body';
    body.scale.set(config.scale, config.scale, config.scale);
    body.position.y = 0.4 * config.scale;
    body.castShadow = true;
    group.add(body);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.55 * config.scale, 0.35 * config.scale);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.55 * config.scale, 0.35 * config.scale);
    group.add(rightEye);

    if (config.type === EnemyType.Boss) {
      const crownGeo = new THREE.ConeGeometry(0.4, 0.6, 8);
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xffd740, emissive: 0xff8f00,
        roughness: 0.2, metalness: 0.8,
      });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = 1.0;
      group.add(crown);

      const ringGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd740, transparent: true, opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.5;
      group.add(ring);
    }

    if (config.type === EnemyType.Runner) {
      body.scale.set(config.scale * 0.6, config.scale * 1.2, config.scale);
    }

    return group;
  }

  private getBodyMaterial(enemy: EnemyInstance): THREE.MeshStandardMaterial | null {
    for (const child of enemy.mesh.children) {
      if (child instanceof THREE.Mesh && child.name === 'body') {
        return child.material as THREE.MeshStandardMaterial;
      }
    }
    return null;
  }

  public takeDamage(enemy: EnemyInstance, damage: number, slowFactor: number = 1, slowDuration: number = 0): boolean {
    if (!enemy.alive) return false;
    enemy.hp -= damage;

    // Apply slow — turn body deep blue
    if (slowFactor < 1 && slowDuration > 0) {
      enemy.slowFactor = slowFactor;
      enemy.slowTimer = Math.max(enemy.slowTimer, slowDuration);
      const mat = this.getBodyMaterial(enemy);
      if (mat) {
        mat.color.set(0x3388cc);
        mat.emissive.set(0x113355);
      }
    }

    // Update 3D HP fill bar: scale.x from center (pivot is center)
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpFill.scale.x = ratio;

    // Color: green → orange → red
    const fillMat = enemy.hpFill.material as THREE.MeshBasicMaterial;
    if (ratio > 0.5) {
      fillMat.color.set(0x4caf50); // green
    } else if (ratio > 0.25) {
      fillMat.color.set(0xff9800); // orange
    } else {
      fillMat.color.set(0xf44336); // red
    }

    // Offset the fill bar so it shrinks from the right (pivot is center)
    // When scale.x = ratio, the visual width is HP_BAR_WIDTH * ratio
    // The right edge moves left by HP_BAR_WIDTH * (1 - ratio) / 2
    enemy.hpFill.position.x = -HP_BAR_WIDTH * (1 - ratio) / 2;

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      return true;
    }
    return false;
  }

  public update(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive || enemy.reachedEnd) continue;

      // Update slow
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        if (enemy.slowTimer <= 0) {
          enemy.slowFactor = 1;
          enemy.slowTimer = 0;
          const mat = this.getBodyMaterial(enemy);
          if (mat) {
            mat.color.set(enemy.config.color);
            mat.emissive.set(enemy.config.emissive);
          }
        }
      }

      // Move along path
      const effectiveSpeed = enemy.speed * enemy.slowFactor;
      const distToMove = effectiveSpeed * dt;
      let remaining = distToMove;

      while (remaining > 0 && enemy.pathIndex < this.pathPositions.length - 1) {
        const current = this.pathPositions[enemy.pathIndex];
        const next = this.pathPositions[enemy.pathIndex + 1];
        const segDist = current.distanceTo(next);
        const progressOnSeg = enemy.pathProgress + remaining / segDist;

        if (progressOnSeg >= 1) {
          remaining -= (1 - enemy.pathProgress) * segDist;
          enemy.pathIndex++;
          enemy.pathProgress = 0;
        } else {
          enemy.pathProgress = progressOnSeg;
          remaining = 0;
        }
      }

      if (enemy.pathIndex >= this.pathPositions.length - 1) {
        enemy.reachedEnd = true;
        continue;
      }

      // Update world position
      const from = this.pathPositions[enemy.pathIndex];
      const to = this.pathPositions[Math.min(enemy.pathIndex + 1, this.pathPositions.length - 1)];
      enemy.worldPos.copy(from).lerp(to, enemy.pathProgress);
      enemy.mesh.position.copy(enemy.worldPos);
      enemy.mesh.position.y += 0.2;

      // Bob animation
      enemy.mesh.position.y += Math.sin(performance.now() * 0.006 + enemy.id) * 0.1;

      // Face movement direction
      const dir = to.clone().sub(from).normalize();
      if (dir.lengthSq() > 0.001) {
        const angle = Math.atan2(dir.x, dir.z);
        enemy.mesh.rotation.y = angle;
      }

      // Billboard HP bar to face camera
      if (this.camera) {
        enemy.hpBarGroup.lookAt(this.camera.position);
      }
    }

    // Cleanup dead enemies only (reached-end handled by GameManager)
    this.enemies = this.enemies.filter(e => {
      if (!e.alive) {
        this.cleanupEnemy(e);
        return false;
      }
      return true;
    });
  }

  private cleanupEnemy(enemy: EnemyInstance): void {
    this.scene.remove(enemy.mesh);
    enemy.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          (child.material as THREE.Material).dispose();
        }
      }
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          (child.material as THREE.Material).dispose();
        }
      }
    });
  }

  public getEnemiesInRange(pos: THREE.Vector3, range: number): EnemyInstance[] {
    const rangeSq = range * range;
    return this.enemies.filter(e =>
      e.alive && !e.reachedEnd && e.worldPos.distanceToSquared(pos) <= rangeSq,
    );
  }

  public getActiveCount(): number {
    return this.enemies.filter(e => e.alive && !e.reachedEnd).length;
  }

  public dispose(): void {
    for (const enemy of [...this.enemies]) {
      this.cleanupEnemy(enemy);
    }
    this.enemies = [];
  }
}

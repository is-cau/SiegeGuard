// ╔══════════════════════════════════════════════════╗
// ║  EnemyManager — Enemy Spawning & Movement       ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  EnemyInstance, EnemyType, EnemyConfig,
  ENEMY_CONFIGS, getPathPositions,
} from './constants';

export class EnemyManager {
  private scene: THREE.Scene;
  public enemies: EnemyInstance[] = [];
  private pathPositions: THREE.Vector3[];
  private idCounter = 0;

  // Per-enemy HP canvas + texture storage
  private hpData: Map<number, {
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
    bgTexture: THREE.CanvasTexture;
  }> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pathPositions = getPathPositions();
  }

  public spawnEnemy(type: EnemyType): EnemyInstance {
    const config = ENEMY_CONFIGS[type];
    const startPos = this.pathPositions[0].clone();

    const mesh = this.createEnemyMesh(config);
    mesh.position.copy(startPos);

    // Per-enemy HP bar canvases
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 64;
    hpCanvas.height = 8;
    const hpTexture = new THREE.CanvasTexture(hpCanvas);
    hpTexture.minFilter = THREE.NearestFilter;
    hpTexture.magFilter = THREE.NearestFilter;

    const hpMat = new THREE.SpriteMaterial({
      map: hpTexture,
      transparent: true,
      depthTest: false,
    });
    const hpBar = new THREE.Sprite(hpMat);
    hpBar.scale.set(1.2, 0.12, 1);

    // Background bar (always full width, dark)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 64;
    bgCanvas.height = 8;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.fillStyle = '#333333';
    bgCtx.fillRect(0, 0, 64, 8);
    const bgTexture = new THREE.CanvasTexture(bgCanvas);
    bgTexture.minFilter = THREE.NearestFilter;
    bgTexture.magFilter = THREE.NearestFilter;
    const bgMat = new THREE.SpriteMaterial({
      map: bgTexture,
      transparent: true,
      depthTest: false,
    });
    const hpBarBg = new THREE.Sprite(bgMat);
    hpBarBg.scale.set(1.2, 0.12, 1);

    const id = this.idCounter++;
    this.hpData.set(id, { canvas: hpCanvas, texture: hpTexture, bgTexture });

    const instance: EnemyInstance = {
      id,
      config,
      hp: config.maxHp,
      maxHp: config.maxHp,
      speed: config.speed,
      worldPos: startPos.clone(),
      mesh,
      hpBar,
      hpBarBg,
      pathIndex: 0,
      pathProgress: 0,
      alive: true,
      reachedEnd: false,
      slowTimer: 0,
      slowFactor: 1,
    };

    // Draw initial full HP
    this.drawHpBar(instance);

    this.scene.add(mesh);
    this.scene.add(hpBar);
    this.scene.add(hpBarBg);
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
    body.name = 'body'; // for finding later
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

    // Type-specific geometry
    if (config.type === EnemyType.Boss) {
      const crownGeo = new THREE.ConeGeometry(0.4, 0.6, 8);
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xffd740,
        emissive: 0xff8f00,
        roughness: 0.2,
        metalness: 0.8,
      });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = 1.0;
      group.add(crown);

      // Glow ring
      const ringGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd740, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.5;
      group.add(ring);
    }

    if (config.type === EnemyType.Runner) {
      // Give runner a leaner look
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

  public drawHpBar(enemy: EnemyInstance): void {
    const data = this.hpData.get(enemy.id);
    if (!data) return;

    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    const ctx = data.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 8);

    // Background
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, 64, 8);

    // Health fill
    const color = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, Math.round(64 * ratio), 8);

    // Border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 64, 8);

    data.texture.needsUpdate = true;
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
        mat.color.set(0x4488cc);       // Blue body
        mat.emissive.set(0x113355);    // Blue glow
      }
    }

    this.drawHpBar(enemy);

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      return true; // killed
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
          // Restore original color
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

      // Reached end
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

      // Position HP bar above enemy
      const barY = enemy.mesh.position.y + 1.6;
      enemy.hpBar.position.set(enemy.worldPos.x, barY, enemy.worldPos.z);
      enemy.hpBarBg.position.set(enemy.worldPos.x, barY, enemy.worldPos.z);
    }

    // Remove dead/reached-end enemies
    this.enemies = this.enemies.filter(e => {
      if (!e.alive || e.reachedEnd) {
        this.cleanupEnemy(e);
        return false;
      }
      return true;
    });
  }

  private cleanupEnemy(enemy: EnemyInstance): void {
    this.scene.remove(enemy.mesh);
    this.scene.remove(enemy.hpBar);
    this.scene.remove(enemy.hpBarBg);
    // Dispose 3D meshes
    enemy.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    enemy.hpBar.material.dispose();
    enemy.hpBarBg.material.dispose();
    // Dispose per-enemy textures
    const data = this.hpData.get(enemy.id);
    if (data) {
      data.texture.dispose();
      data.bgTexture.dispose();
      this.hpData.delete(enemy.id);
    }
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
    this.hpData.clear();
  }
}

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

  // HP bar canvas textures
  private hpBarCanvas: HTMLCanvasElement;
  private hpBarBgCanvas: HTMLCanvasElement;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pathPositions = getPathPositions();

    // Create shared HP bar textures
    this.hpBarCanvas = document.createElement('canvas');
    this.hpBarCanvas.width = 64;
    this.hpBarCanvas.height = 8;

    this.hpBarBgCanvas = document.createElement('canvas');
    this.hpBarBgCanvas.width = 64;
    this.hpBarBgCanvas.height = 8;
  }

  public spawnEnemy(type: EnemyType): EnemyInstance {
    const config = ENEMY_CONFIGS[type];
    const startPos = this.pathPositions[0].clone();

    const mesh = this.createEnemyMesh(config);
    mesh.position.copy(startPos);

    const hpBar = this.createHpBar(0xff0000);
    const hpBarBg = this.createHpBar(0x333333);

    const instance: EnemyInstance = {
      id: this.idCounter++,
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
    }

    return group;
  }

  private createHpBar(color: number): THREE.Sprite {
    const canvas = color === 0xff0000 ? this.hpBarCanvas : this.hpBarBgCanvas;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 0.12, 1);
    return sprite;
  }

  public updateHpBar(enemy: EnemyInstance): void {
    const ratio = enemy.hp / enemy.maxHp;
    const canvas = this.hpBarCanvas;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Health
    const color = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width * ratio, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    enemy.hpBar.material.map?.dispose();
    enemy.hpBar.material.map = texture;
    (enemy.hpBar.material as THREE.SpriteMaterial).needsUpdate = true;
  }

  public takeDamage(enemy: EnemyInstance, damage: number, slowFactor: number = 1, slowDuration: number = 0): boolean {
    if (!enemy.alive) return false;
    enemy.hp -= damage;

    // Apply slow
    if (slowFactor < 1 && slowDuration > 0) {
      enemy.slowFactor = slowFactor;
      enemy.slowTimer = Math.max(enemy.slowTimer, slowDuration);
      // Tint blue-white
      if (enemy.mesh.children[0] instanceof THREE.Mesh) {
        const mat = enemy.mesh.children[0].material as THREE.MeshStandardMaterial;
        mat.emissive = new THREE.Color(0x113344);
      }
    }

    this.updateHpBar(enemy);

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
          // Remove blue tint
          if (enemy.mesh.children[0] instanceof THREE.Mesh) {
            const mat = enemy.mesh.children[0].material as THREE.MeshStandardMaterial;
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

      // Face movement direction
      const dir = to.clone().sub(from).normalize();
      if (dir.lengthSq() > 0.001) {
        const angle = Math.atan2(dir.x, dir.z);
        enemy.mesh.rotation.y = angle;
      }

      // Position HP bar above enemy
      enemy.hpBar.position.copy(enemy.worldPos).add(new THREE.Vector3(0, 1.5, 0));
      enemy.hpBarBg.position.copy(enemy.hpBar.position);
    }

    // Remove dead/reached-end enemies
    this.enemies = this.enemies.filter(e => {
      if (!e.alive || e.reachedEnd) {
        this.scene.remove(e.mesh);
        this.scene.remove(e.hpBar);
        this.scene.remove(e.hpBarBg);
        // Dispose
        e.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        e.hpBar.material.map?.dispose();
        e.hpBar.material.dispose();
        e.hpBarBg.material.map?.dispose();
        e.hpBarBg.material.dispose();
        return false;
      }
      return true;
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
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
      this.scene.remove(enemy.hpBar);
      this.scene.remove(enemy.hpBarBg);
    }
    this.enemies = [];
  }
}

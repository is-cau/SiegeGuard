// ╔══════════════════════════════════════════════════╗
// ║  TowerManager — Tower Creation & Targeting      ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  TowerInstance, TowerType, TowerConfig, EnemyInstance,
  TOWER_CONFIGS, gridToWorld, SELL_REFUND_RATIO,
} from './constants';
import type { EnemyManager } from './EnemyManager';

export class TowerManager {
  private scene: THREE.Scene;
  private enemyManager: EnemyManager;
  public towers: TowerInstance[] = [];
  private idCounter = 0;

  // Firing callbacks
  public onTowerFire: ((tower: TowerInstance, target: EnemyInstance) => void) | null = null;

  constructor(scene: THREE.Scene, enemyManager: EnemyManager) {
    this.scene = scene;
    this.enemyManager = enemyManager;
  }

  public placeTower(type: TowerType, col: number, row: number): TowerInstance {
    const config = TOWER_CONFIGS[type];
    const worldPos = gridToWorld(col, row);
    worldPos.y = 0;

    const mesh = this.createTowerMesh(config);
    mesh.position.copy(worldPos);
    this.scene.add(mesh);

    // Range ring (hidden, shown on hover/select)
    const ringGeo = new THREE.TorusGeometry(config.range, 0.06, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.3,
    });
    const rangeRing = new THREE.Mesh(ringGeo, ringMat);
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.copy(worldPos).add(new THREE.Vector3(0, 0.03, 0));
    rangeRing.visible = false;
    this.scene.add(rangeRing);

    const instance: TowerInstance = {
      id: this.idCounter++,
      config,
      gridCol: col,
      gridRow: row,
      worldPos: worldPos.clone(),
      mesh,
      rangeRing,
      cooldown: 0,
      level: 1,
      target: null,
    };

    // Placement animation: scale up
    mesh.scale.set(0.01, 0.01, 0.01);
    this.animatePlacement(mesh);

    this.towers.push(instance);
    return instance;
  }

  private animatePlacement(mesh: THREE.Group): void {
    const start = performance.now();
    const duration = 300;
    const animate = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease out elastic
      const s = 1 - Math.pow(1 - t, 3);
      const bounce = 1 + Math.sin(t * Math.PI * 2) * (1 - t) * 0.15;
      const scale = s * bounce;
      mesh.scale.setScalar(Math.max(0.01, scale));
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        mesh.scale.setScalar(1);
      }
    };
    requestAnimationFrame(animate);
  }

  private createTowerMesh(config: TowerConfig): THREE.Group {
    const group = new THREE.Group();

    // Base (all towers share this)
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.5, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.5,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    group.add(base);

    switch (config.type) {
      case TowerType.Arrow: {
        // Tall cylinder + cone roof
        const pillarGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.9, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: 0.3,
          metalness: 0.4,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 0.7;
        pillar.castShadow = true;
        group.add(pillar);

        const roofGeo = new THREE.ConeGeometry(0.35, 0.5, 8);
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0x1565c0,
          roughness: 0.3,
          metalness: 0.4,
        });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 1.15;
        roof.castShadow = true;
        group.add(roof);
        break;
      }
      case TowerType.Cannon: {
        // Short wide cylinder + turret
        const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.7, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: 0.3,
          metalness: 0.5,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.55;
        body.castShadow = true;
        group.add(body);

        const barrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8);
        const barrelMat = new THREE.MeshStandardMaterial({
          color: 0x444444,
          roughness: 0.2,
          metalness: 0.7,
        });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 4;
        barrel.position.set(0, 0.8, 0.25);
        barrel.castShadow = true;
        group.add(barrel);
        break;
      }
      case TowerType.Ice: {
        // Crystal on pillar
        const pillarGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: 0.2,
          metalness: 0.3,
          emissive: 0x003344,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 0.6;
        pillar.castShadow = true;
        group.add(pillar);

        const crystalGeo = new THREE.OctahedronGeometry(0.35, 0);
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x80deea,
          roughness: 0.1,
          metalness: 0.2,
          emissive: 0x004455,
          transparent: true,
          opacity: 0.85,
        });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.y = 1.1;
        crystal.castShadow = true;
        group.add(crystal);
        break;
      }
      case TowerType.Lightning: {
        // Tesla coil
        const coilGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8);
        const coilMat = new THREE.MeshStandardMaterial({
          color: config.color,
          roughness: 0.3,
          metalness: 0.6,
          emissive: 0x221100,
        });
        const coil = new THREE.Mesh(coilGeo, coilMat);
        coil.position.y = 0.7;
        coil.castShadow = true;
        group.add(coil);

        const orbGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const orbMat = new THREE.MeshStandardMaterial({
          color: 0xffea00,
          roughness: 0.1,
          metalness: 0.1,
          emissive: 0xff8f00,
          emissiveIntensity: 0.8,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = 1.25;
        group.add(orb);
        break;
      }
    }

    return group;
  }

  public getTowerAtCell(col: number, row: number): TowerInstance | null {
    return this.towers.find(t => t.gridCol === col && t.gridRow === row) || null;
  }

  public sellTower(col: number, row: number): number {
    const tower = this.getTowerAtCell(col, row);
    if (!tower) return 0;

    this.scene.remove(tower.mesh);
    this.scene.remove(tower.rangeRing);
    tower.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    tower.rangeRing.geometry.dispose();
    (tower.rangeRing.material as THREE.Material).dispose();

    this.towers = this.towers.filter(t => t.id !== tower.id);
    return Math.floor(tower.config.cost * SELL_REFUND_RATIO);
  }

  public setRangeRingsVisible(tower: TowerInstance | null): void {
    for (const t of this.towers) {
      t.rangeRing.visible = t === tower;
    }
  }

  public update(dt: number): void {
    for (const tower of this.towers) {
      // Cooldown
      if (tower.cooldown > 0) {
        tower.cooldown -= dt;
      }

      // Find target
      if (tower.cooldown <= 0) {
        // If current target is lost, find new
        if (!tower.target || !tower.target.alive ||
            tower.target.worldPos.distanceToSquared(tower.worldPos) > tower.config.range * tower.config.range) {
          const enemies = this.enemyManager.getEnemiesInRange(tower.worldPos, tower.config.range);
          // Target the enemy closest to the end (highest pathIndex)
          tower.target = enemies.sort((a, b) => b.pathIndex - a.pathIndex)[0] || null;
        }

        if (tower.target) {
          // Fire!
          tower.cooldown = tower.config.fireRate;
          if (this.onTowerFire) {
            this.onTowerFire(tower, tower.target);
          }
        }
      }

      // Rotate tower top to face target
      if (tower.target && tower.target.alive) {
        const dir = tower.target.worldPos.clone().sub(tower.worldPos);
        const angle = Math.atan2(dir.x, dir.z);
        // Smooth rotation
        const currentAngle = tower.mesh.rotation.y;
        let diff = angle - currentAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        tower.mesh.rotation.y += diff * Math.min(1, dt * 10);
      }

      // Animate lightning orb
      if (tower.config.type === TowerType.Lightning) {
        const orb = tower.mesh.children[tower.mesh.children.length - 1];
        if (orb) {
          orb.position.y = 1.25 + Math.sin(performance.now() * 0.005) * 0.1;
        }
      }
    }
  }

  public dispose(): void {
    for (const tower of this.towers) {
      this.scene.remove(tower.mesh);
      this.scene.remove(tower.rangeRing);
    }
    this.towers = [];
  }
}

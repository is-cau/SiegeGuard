// ╔══════════════════════════════════════════════════╗
// ║  EffectManager — Particles & Visual Effects      ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import { ParticleEffect } from './constants';

export class EffectManager {
  private scene: THREE.Scene;
  private particles: ParticleEffect[] = [];
  private particlePool: THREE.Mesh[] = [];
  private poolSize = 300;

  // Active lightning effects
  private lightningGroups: { group: THREE.Group; timer: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initPool();
  }

  private initPool(): void {
    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    for (let i = 0; i < this.poolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }
  }

  private getPooledMesh(): THREE.Mesh | null {
    for (const mesh of this.particlePool) {
      if (!mesh.visible) return mesh;
    }
    // Expand pool if needed
    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const newMesh = new THREE.Mesh(geo, mat);
    this.scene.add(newMesh);
    this.particlePool.push(newMesh);
    return newMesh;
  }

  public spawnExplosion(position: THREE.Vector3, color: THREE.Color, count: number = 15): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.getPooledMesh();
      if (!mesh) break;
      mesh.visible = true;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      mat.color.copy(color);
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        Math.random() * 0.3,
        (Math.random() - 0.5) * 0.4,
      ));

      const angle = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const spd = 2.5 + Math.random() * 5;
      this.particles.push({
        position: mesh.position.clone(),
        velocity: new THREE.Vector3(
          Math.cos(angle) * Math.cos(phi) * spd,
          Math.sin(phi) * spd + 2.5,
          Math.sin(angle) * Math.cos(phi) * spd,
        ),
        life: 0.3 + Math.random() * 0.7,
        maxLife: 0.3 + Math.random() * 0.7,
        color: color.clone(),
        mesh,
        size: 0.2 + Math.random() * 0.5,
      });
    }
  }

  public spawnIceEffect(position: THREE.Vector3): void {
    for (let i = 0; i < 12; i++) {
      const mesh = this.getPooledMesh();
      if (!mesh) break;
      mesh.visible = true;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      mat.color.set(0x80deea);
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        Math.random() * 1.2,
        (Math.random() - 0.5) * 0.4,
      ));
      this.particles.push({
        position: mesh.position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          1.5 + Math.random() * 3,
          (Math.random() - 0.5) * 1.5,
        ),
        life: 0.6,
        maxLife: 0.6,
        color: new THREE.Color(0xb2ebf2),
        mesh,
        size: 0.12 + Math.random() * 0.2,
      });
    }
    // Also a brief ice flash ring
    const ringGeo = new THREE.TorusGeometry(1.5, 0.12, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x80deea,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position).add(new THREE.Vector3(0, 0.05, 0));
    ring.name = 'temp-ring';
    this.scene.add(ring);

    // Animate the ring
    const start = performance.now();
    const animateRing = () => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.5) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        return;
      }
      const t = elapsed / 0.5;
      ring.scale.setScalar(1 + t * 1.5);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      requestAnimationFrame(animateRing);
    };
    requestAnimationFrame(animateRing);
  }

  public spawnLightningChain(positions: THREE.Vector3[]): void {
    if (positions.length < 1) return;

    // Create a group to hold all lightning arcs
    const group = new THREE.Group();
    const allPoints: THREE.Vector3[] = [];

    // Start from the tower position (first enemy's position minus height offset)
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i].clone();
      p.y += 0.5; // enemy mid-height

      if (i > 0) {
        const prev = positions[i - 1].clone();
        prev.y += 0.5;
        // Add several jitter midpoints for jagged lightning look
        const segments = 4;
        for (let s = 1; s < segments; s++) {
          const t = s / segments;
          const mid = prev.clone().lerp(p, t);
          mid.x += (Math.random() - 0.5) * 1.2;
          mid.y += (Math.random() - 0.5) * 1.2;
          mid.z += (Math.random() - 0.5) * 1.2;
          allPoints.push(mid);
          // Add branch
          if (Math.random() < 0.4) {
            const branchEnd = mid.clone();
            branchEnd.x += (Math.random() - 0.5) * 2;
            branchEnd.y += (Math.random() - 0.5) * 2;
            branchEnd.z += (Math.random() - 0.5) * 2;
            const branchPts = [mid.clone(), branchEnd];
            const branchGeo = new THREE.BufferGeometry().setFromPoints(branchPts);
            const branchMat = new THREE.LineBasicMaterial({
              color: 0x4488ff,
              transparent: true,
              opacity: 0.6,
            });
            group.add(new THREE.Line(branchGeo, branchMat));
          }
        }
      }
      allPoints.push(p);
    }

    // Main lightning bolt — thick white core
    const coreGeo = new THREE.BufferGeometry().setFromPoints(allPoints);
    const coreMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      linewidth: 2,
    });
    group.add(new THREE.Line(coreGeo, coreMat));

    // Yellow outer glow
    const glowPts = allPoints.map(p => {
      const jittered = p.clone();
      jittered.x += (Math.random() - 0.5) * 0.3;
      jittered.z += (Math.random() - 0.5) * 0.3;
      return jittered;
    });
    const glowGeo = new THREE.BufferGeometry().setFromPoints(glowPts);
    const glowMat = new THREE.LineBasicMaterial({
      color: 0xffd740,
      transparent: true,
      opacity: 0.7,
    });
    group.add(new THREE.Line(glowGeo, glowMat));

    // Blue outer halo
    const haloPts = allPoints.map(p => {
      const j = p.clone();
      j.x += (Math.random() - 0.5) * 0.5;
      j.z += (Math.random() - 0.5) * 0.5;
      return j;
    });
    const haloGeo = new THREE.BufferGeometry().setFromPoints(haloPts);
    const haloMat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.4,
    });
    group.add(new THREE.Line(haloGeo, haloMat));

    this.scene.add(group);
    this.lightningGroups.push({ group, timer: 0.35 });
  }

  public update(dt: number): void {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 9.8 * dt; // gravity
      p.position.add(p.velocity.clone().multiplyScalar(dt));
      p.mesh.position.copy(p.position);
      const ratio = p.life / p.maxLife;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = ratio;
      p.mesh.scale.setScalar(p.size * (0.3 + ratio * 0.7));
    }

    // Update lightning
    for (let i = this.lightningGroups.length - 1; i >= 0; i--) {
      const lg = this.lightningGroups[i];
      lg.timer -= dt;
      if (lg.timer <= 0) {
        this.scene.remove(lg.group);
        lg.group.traverse(child => {
          if (child instanceof THREE.Line) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        this.lightningGroups.splice(i, 1);
      } else {
        // Fade out
        const ratio = lg.timer / 0.35;
        lg.group.children.forEach(c => {
          if (c instanceof THREE.Line) {
            (c.material as THREE.LineBasicMaterial).opacity = ratio;
          }
        });
      }
    }
  }

  public dispose(): void {
    for (const p of this.particles) {
      p.mesh.visible = false;
    }
    this.particles = [];
    for (const lg of this.lightningGroups) {
      this.scene.remove(lg.group);
      lg.group.traverse(child => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
    this.lightningGroups = [];
    for (const mesh of this.particlePool) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.particlePool = [];
  }
}

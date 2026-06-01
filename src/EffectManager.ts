// ╔══════════════════════════════════════════════════╗
// ║  EffectManager — Particles & Visual Effects      ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import { ParticleEffect } from './constants';

export class EffectManager {
  private scene: THREE.Scene;
  private particles: ParticleEffect[] = [];
  private particlePool: THREE.Mesh[] = [];
  private poolSize = 200;

  // Lightning chain meshes (temporary)
  private lightningLines: { mesh: THREE.Line; timer: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initPool();
  }

  private initPool(): void {
    const geo = new THREE.SphereGeometry(0.1, 4, 4);
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
    return null;
  }

  public spawnExplosion(position: THREE.Vector3, color: THREE.Color, count: number = 15): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.getPooledMesh();
      if (!mesh) break;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      (mesh.material as THREE.MeshBasicMaterial).color.copy(color);
      mesh.scale.setScalar(0.3 + Math.random() * 0.5);
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5,
      ));

      const angle = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        position: mesh.position.clone(),
        velocity: new THREE.Vector3(
          Math.cos(angle) * Math.cos(phi) * spd,
          Math.sin(phi) * spd + 2,
          Math.sin(angle) * Math.cos(phi) * spd,
        ),
        life: 0.4 + Math.random() * 0.6,
        maxLife: 0.4 + Math.random() * 0.6,
        color: color.clone(),
        mesh,
        size: 0.3 + Math.random() * 0.5,
      });
    }
  }

  public spawnIceEffect(position: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const mesh = this.getPooledMesh();
      if (!mesh) break;
      mesh.visible = true;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
      mat.color.set(0x80deea);
      mesh.scale.setScalar(0.15);
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.8,
        (Math.random() - 0.5) * 0.3,
      ));
      this.particles.push({
        position: mesh.position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1,
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 1,
        ),
        life: 0.5,
        maxLife: 0.5,
        color: new THREE.Color(0x80deea),
        mesh,
        size: 0.15,
      });
    }
  }

  public spawnLightningChain(positions: THREE.Vector3[]): void {
    if (positions.length < 2) return;
    const allPoints: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i].clone();
      p.y += 0.5;
      if (i > 0) {
        // Add jitter points between
        const prev = positions[i - 1].clone();
        prev.y += 0.5;
        const mid = prev.clone().add(p).multiplyScalar(0.5);
        mid.x += (Math.random() - 0.5) * 1.5;
        mid.y += (Math.random() - 0.5) * 1.5;
        mid.z += (Math.random() - 0.5) * 1.5;
        allPoints.push(mid);
      }
      allPoints.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(allPoints);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd740, linewidth: 2, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.lightningLines.push({ mesh: line, timer: 0.3 });
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
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
      p.mesh.scale.setScalar(p.size * ratio);
    }

    // Update lightning lines
    for (let i = this.lightningLines.length - 1; i >= 0; i--) {
      const ll = this.lightningLines[i];
      ll.timer -= dt;
      if (ll.timer <= 0) {
        this.scene.remove(ll.mesh);
        ll.mesh.geometry.dispose();
        (ll.mesh.material as THREE.Material).dispose();
        this.lightningLines.splice(i, 1);
      } else {
        (ll.mesh.material as THREE.LineBasicMaterial).opacity = ll.timer / 0.3;
      }
    }
  }

  public dispose(): void {
    for (const p of this.particles) {
      p.mesh.visible = false;
    }
    this.particles = [];
    for (const ll of this.lightningLines) {
      this.scene.remove(ll.mesh);
      ll.mesh.geometry.dispose();
      (ll.mesh.material as THREE.Material).dispose();
    }
    this.lightningLines = [];
    for (const mesh of this.particlePool) {
      this.scene.remove(mesh);
    }
    this.particlePool = [];
  }
}

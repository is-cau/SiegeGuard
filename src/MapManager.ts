// ╔══════════════════════════════════════════════════╗
// ║  MapManager — Grid, Path & Placement Logic       ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import {
  GRID_COLS, GRID_ROWS, CELL_SIZE, GRID_OFFSET_X, GRID_OFFSET_Z,
  getPathCells, getPathPositions, gridToWorld, isGridValid,
} from './constants';

export class MapManager {
  public scene: THREE.Scene;
  public ground: THREE.Mesh;
  public gridHighlights: THREE.Mesh[];
  public pathLine!: THREE.Line;
  public pathPositions: THREE.Vector3[];
  public pathCells: Set<string>;
  public occupiedCells: Set<string>; // cells with towers

  // Placement preview
  public previewMesh: THREE.Group | null = null;
  public previewRangeRing: THREE.Mesh | null = null;
  public previewValid: boolean = false;

  private highlightMeshes: Map<string, THREE.Mesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.gridHighlights = [];
    this.pathCells = getPathCells();
    this.occupiedCells = new Set();
    this.pathPositions = getPathPositions();

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a27,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.05, 0);
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // Grid cells — subtle highlight
    this.createGridCells();

    // Path visualization
    this.createPathVisual();

    // Path line for enemy movement
    this.createPathLine();
  }

  private createGridCells(): void {
    const geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const key = `${col},${row}`;
        const isPath = this.pathCells.has(key);
        const material = new THREE.MeshBasicMaterial({
          color: isPath ? 0x8b4513 : 0x3a7d34,
          transparent: true,
          opacity: isPath ? 0.6 : 0.3,
          side: THREE.DoubleSide,
        });
        const cell = new THREE.Mesh(geometry, material);
        cell.rotation.x = -Math.PI / 2;
        const worldPos = gridToWorld(col, row);
        cell.position.set(worldPos.x, 0.01, worldPos.z);
        cell.userData = { col, row, isPath, key };
        this.scene.add(cell);
        this.highlightMeshes.set(key, cell);
        this.gridHighlights.push(cell);
      }
    }
  }

  private createPathVisual(): void {
    // Create a visible path on the ground
    for (const key of this.pathCells) {
      const [col, row] = key.split(',').map(Number);
      const worldPos = gridToWorld(col, row);
      const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.85, CELL_SIZE * 0.85);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xc4a46c,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const tile = new THREE.Mesh(geo, mat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(worldPos.x, 0.02, worldPos.z);
      this.scene.add(tile);
    }
  }

  private createPathLine(): void {
    const points = this.pathPositions.map(p => new THREE.Vector3(p.x, 0.05, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffcc80, linewidth: 2, transparent: true, opacity: 0.4 });
    this.pathLine = new THREE.Line(geometry, material);
    this.scene.add(this.pathLine);

    // Start marker
    const startPos = points[0];
    const startGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
    const startMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, emissive: 0x1b5e20, roughness: 0.3 });
    const startMarker = new THREE.Mesh(startGeo, startMat);
    startMarker.position.copy(startPos).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(startMarker);

    // End marker
    const endPos = points[points.length - 1];
    const endGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
    const endMat = new THREE.MeshStandardMaterial({ color: 0xf44336, emissive: 0x5b0000, roughness: 0.3 });
    const endMarker = new THREE.Mesh(endGeo, endMat);
    endMarker.position.copy(endPos).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(endMarker);
  }

  public isCellPlaceable(col: number, row: number): boolean {
    if (!isGridValid(col, row)) return false;
    const key = `${col},${row}`;
    if (this.pathCells.has(key)) return false;
    if (this.occupiedCells.has(key)) return false;
    return true;
  }

  public highlightCell(col: number, row: number, color: number): void {
    const key = `${col},${row}`;
    const mesh = this.highlightMeshes.get(key);
    if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
      mesh.material.color.set(color);
      mesh.material.opacity = 0.7;
    }
  }

  public resetHighlights(): void {
    for (const mesh of this.highlightMeshes.values()) {
      if (mesh.material instanceof THREE.MeshBasicMaterial) {
        const key = mesh.userData.key as string;
        const isPath = this.pathCells.has(key);
        mesh.material.color.set(isPath ? 0x8b4513 : 0x3a7d34);
        mesh.material.opacity = isPath ? 0.6 : 0.3;
      }
    }
  }

  public showRangePreview(worldPos: THREE.Vector3, range: number, valid: boolean): void {
    this.hideRangePreview();
    const ringGeo = new THREE.TorusGeometry(range, 0.08, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: valid ? 0x00ff00 : 0xff0000,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(worldPos).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(ring);
    this.previewRangeRing = ring;
  }

  public hideRangePreview(): void {
    if (this.previewRangeRing) {
      this.scene.remove(this.previewRangeRing);
      this.previewRangeRing.geometry.dispose();
      (this.previewRangeRing.material as THREE.Material).dispose();
      this.previewRangeRing = null;
    }
  }

  public getGroundIntersection(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    const intersects = raycaster.intersectObject(this.ground);
    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  }

  public update(time: number): void {
    // placeholder for animations
  }
}

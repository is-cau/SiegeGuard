// ╔══════════════════════════════════════════════════╗
// ║  SiegeGuard — 3D Tower Defense                  ║
// ║  main.ts — Entry Point & Game Loop              ║
// ╚══════════════════════════════════════════════════╝

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapManager } from './MapManager';
import { EnemyManager } from './EnemyManager';
import { TowerManager } from './TowerManager';
import { ProjectileManager } from './ProjectileManager';
import { EffectManager } from './EffectManager';
import { GameManager } from './GameManager';
import { UIManager } from './UIManager';
import { GamePhase, TowerType, TOWER_CONFIGS, worldToGrid, gridToWorld } from './constants';

// ─── Scene Setup ──────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 25, 60);

// Camera: start high and back to see the full map including castle at the far end
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.5,
  80,
);
// Position to see: start (left) → path → castle (right/far)
camera.position.set(0, 22, 18);
camera.lookAt(0, 0, -1);

// ─── OrbitControls ────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, -1);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 10;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minPolarAngle = 0.3;
// Default: left = rotate, right = pan, scroll = zoom
// We intercept left click for tower placement only when a tower is selected
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
controls.update();

// ─── Lighting ─────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x404060, 1.8);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 4.0);
sunLight.position.set(15, 25, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 60;
sunLight.shadow.camera.left = -18;
sunLight.shadow.camera.right = 18;
sunLight.shadow.camera.top = 18;
sunLight.shadow.camera.bottom = -18;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.9);
scene.add(hemisphereLight);

// ─── Decorative elements ──────────────────────────
// Water around the map
const waterGeo = new THREE.PlaneGeometry(50, 36);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x1a5276,
  roughness: 0.15,
  metalness: 0.85,
  transparent: true,
  opacity: 0.5,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.15;
water.receiveShadow = true;
scene.add(water);

// Castle at the end (defend point)
const castleGroup = new THREE.Group();
const castleBaseGeo = new THREE.BoxGeometry(2.5, 2, 2.5);
const castleBaseMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.3, metalness: 0.4 });
const castleBase = new THREE.Mesh(castleBaseGeo, castleBaseMat);
castleBase.position.y = 1.0;
castleBase.castShadow = true;
castleBase.receiveShadow = true;
castleGroup.add(castleBase);

// 4 corner towers
for (let i = 0; i < 4; i++) {
  const twrGeo = new THREE.CylinderGeometry(0.35, 0.4, 2.0, 8);
  const twrMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.3, metalness: 0.5 });
  const twr = new THREE.Mesh(twrGeo, twrMat);
  const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
  twr.position.set(Math.cos(angle) * 1.2, 1.0, Math.sin(angle) * 1.2);
  twr.castShadow = true;
  castleGroup.add(twr);

  const coneGeo = new THREE.ConeGeometry(0.4, 0.7, 8);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xcc3333,
    roughness: 0.3,
    metalness: 0.3,
    emissive: 0x330000,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(twr.position).add(new THREE.Vector3(0, 1.3, 0));
  cone.castShadow = true;
  castleGroup.add(cone);
}

// Central keep
const keepGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.5, 8);
const keepMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.3, metalness: 0.5 });
const keep = new THREE.Mesh(keepGeo, keepMat);
keep.position.y = 2.0;
keep.castShadow = true;
castleGroup.add(keep);

const flagGeo = new THREE.PlaneGeometry(0.3, 0.6);
const flagMat = new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide });
const flag = new THREE.Mesh(flagGeo, flagMat);
flag.position.set(0, 3.5, 0);
castleGroup.add(flag);

const endPos = gridToWorld(11, 7);
castleGroup.position.set(endPos.x, 0, endPos.z + 2.5);
scene.add(castleGroup);

// Castle HP bar
const castleHpBarWidth = 3.0;
const castleHpBarHeight = 0.3;
const castleHpGroup = new THREE.Group();
const castleBgGeo = new THREE.BoxGeometry(castleHpBarWidth, castleHpBarHeight, 0.05);
const castleBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false });
castleHpGroup.add(new THREE.Mesh(castleBgGeo, castleBgMat));
const castleFillGeo = new THREE.BoxGeometry(castleHpBarWidth, castleHpBarHeight, 0.06);
const castleFillMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, depthTest: false });
const castleHpFill = new THREE.Mesh(castleFillGeo, castleFillMat);
castleHpFill.position.z = 0.005;
castleHpGroup.add(castleHpFill);
const castleBorderGeo = new THREE.EdgesGeometry(castleBgGeo);
const castleBorderMat = new THREE.LineBasicMaterial({ color: 0x000000, depthTest: false });
const castleBorder = new THREE.LineSegments(castleBorderGeo, castleBorderMat);
castleBorder.position.z = 0.01;
castleHpGroup.add(castleBorder);
// "🏠" label using a small plane with text — just use position
castleHpGroup.position.set(endPos.x, 3.5, endPos.z + 2.5);
scene.add(castleHpGroup);

function updateCastleHpBar(lives: number, maxLives: number): void {
  const ratio = Math.max(0, lives / maxLives);
  castleHpFill.scale.x = ratio;
  castleHpFill.position.x = -castleHpBarWidth * (1 - ratio) / 2;
  if (ratio > 0.5) castleFillMat.color.set(0x4caf50);
  else if (ratio > 0.25) castleFillMat.color.set(0xff9800);
  else castleFillMat.color.set(0xf44336);
}
updateCastleHpBar(10, 10); // initial

// Trees (decorative, placed around the grid)
for (let i = 0; i < 35; i++) {
  const treeGroup = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const colorVar = Math.floor(Math.random() * 0x334422);
  const leavesGeo = new THREE.ConeGeometry(0.7, 1.8, 8);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 + colorVar, roughness: 0.7 });
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = 1.9;
  leaves.castShadow = true;
  treeGroup.add(leaves);

  // Position outside the grid
  const margin = 4;
  let tx: number, tz: number;
  do {
    tx = (Math.random() - 0.5) * 32;
    tz = (Math.random() - 0.5) * 26;
  } while (tx > -12 && tx < 12 && tz > -8 && tz < 8);
  treeGroup.position.set(tx, 0, tz);
  treeGroup.scale.setScalar(0.6 + Math.random() * 0.8);
  scene.add(treeGroup);
}

// ─── Managers ─────────────────────────────────────
const mapManager = new MapManager(scene);
const enemyManager = new EnemyManager(scene);
const effectManager = new EffectManager(scene);
const towerManager = new TowerManager(scene, enemyManager);
const projectileManager = new ProjectileManager(scene, enemyManager, effectManager);
const gameManager = new GameManager(mapManager, towerManager, enemyManager, projectileManager, effectManager);
const uiManager = new UIManager(gameManager);

// Wire camera for HP bar billboarding
enemyManager.setCamera(camera);

// Wire tower fire callback
towerManager.onTowerFire = (tower, target) => {
  projectileManager.fireProjectile(tower, target);
};

// ─── Input Handling ───────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getGridFromEvent(e: MouseEvent): [number, number] | null {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersection = mapManager.getGroundIntersection(raycaster);
  if (!intersection) return null;
  return worldToGrid(intersection);
}

// Left click: place tower (only when a tower is selected), otherwise orbit
renderer.domElement.addEventListener('click', (e: MouseEvent) => {
  if (e.button !== 0) return;

  // Only place if we have a tower selected AND in building phase
  if (!gameManager.selectedTowerType || gameManager.state.phase !== GamePhase.Building) {
    return; // let OrbitControls handle it
  }

  const grid = getGridFromEvent(e);
  if (!grid) return;

  const [col, row] = grid;
  const success = gameManager.placeTower(gameManager.selectedTowerType, col, row);
  if (success) {
    mapManager.hideRangePreview();
    mapManager.resetHighlights();
    uiManager.updateTowerButtons();
    // Keep selection for chain placement
    if (!gameManager.canAfford(gameManager.selectedTowerType)) {
      gameManager.selectTower(null);
      uiManager.updateTowerButtons();
    }
  }
  // Block OrbitControls from rotating when we placed a tower
  e.stopPropagation();
});

// Right click: sell tower
renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  if (gameManager.state.phase !== GamePhase.Building) return;

  const grid = getGridFromEvent(e);
  if (!grid) return;

  const [col, row] = grid;
  const tower = towerManager.getTowerAtCell(col, row);
  if (tower) {
    gameManager.sellTower(col, row);
    uiManager.updateTowerButtons();
    uiManager.showMessage(`💰 出售 ${tower.config.name}，返还 ${Math.floor(tower.config.cost * 0.5)} 金币`);
  }
});

// Mouse move: show placement preview when tower selected
renderer.domElement.addEventListener('mousemove', (e: MouseEvent) => {
  if (!gameManager.selectedTowerType || gameManager.state.phase !== GamePhase.Building) {
    return;
  }

  const grid = getGridFromEvent(e);
  mapManager.resetHighlights();

  if (grid) {
    const [col, row] = grid;
    const valid = mapManager.isCellPlaceable(col, row);
    const worldPos = gridToWorld(col, row);
    const config = TOWER_CONFIGS[gameManager.selectedTowerType];

    mapManager.highlightCell(col, row, valid ? 0x4caf50 : 0xf44336);
    mapManager.showRangePreview(worldPos, config.range, valid);
  } else {
    mapManager.hideRangePreview();
  }
});

// ─── Keyboard ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Speed toggle with 'F' key
  if (e.key === 'f' || e.key === 'F') {
    gameManager.toggleSpeed();
    return;
  }

  if (gameManager.state.phase !== GamePhase.Building) return;

  switch (e.key) {
    case '1': selectTowerType(TowerType.Arrow); break;
    case '2': selectTowerType(TowerType.Cannon); break;
    case '3': selectTowerType(TowerType.Ice); break;
    case '4': selectTowerType(TowerType.Lightning); break;
    case 'Escape':
      gameManager.selectTower(null);
      uiManager.updateTowerButtons();
      mapManager.hideRangePreview();
      mapManager.resetHighlights();
      break;
    case ' ':
      e.preventDefault();
      if (gameManager.state.phase === GamePhase.Building) {
        gameManager.startWave();
        uiManager.updateTowerButtons();
        uiManager.updateWaveButton();
      }
      break;
  }
});

function selectTowerType(type: TowerType): void {
  if (!gameManager.canAfford(type)) {
    uiManager.showMessage('💰 金币不足！');
    return;
  }
  gameManager.selectTower(gameManager.selectedTowerType === type ? null : type);
  uiManager.updateTowerButtons();
}

// ─── Resize Handler ───────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Game Loop ────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const rawDt = Math.min(clock.getDelta(), 0.1);
  const speed = gameManager.gameSpeed;
  const dt = rawDt * speed;

  // When a tower is selected, don't let OrbitControls rotate (we handle clicks)
  // When no tower selected, OrbitControls works normally
  controls.enabled = !gameManager.selectedTowerType || gameManager.state.phase !== GamePhase.Building;
  controls.update();

  // Update all managers at game speed
  mapManager.update(performance.now());
  towerManager.update(dt);
  enemyManager.update(dt);
  projectileManager.update(dt);
  effectManager.update(dt);

  // GameManager has its own speed logic
  gameManager.update(rawDt);

  // Update castle HP bar
  updateCastleHpBar(gameManager.state.lives, 10);
  castleHpGroup.lookAt(camera.position);

  // Water animation
  water.position.y = -0.15 + Math.sin(performance.now() * 0.001) * 0.06;

  renderer.render(scene, camera);
}

// ─── Start ────────────────────────────────────────
console.log('🏰 SiegeGuard — 3D Tower Defense 已就绪');
console.log('  选择塔 → 点击地图放置 | 右键出售 | 空格开始波次 | F 切换倍速');
console.log('  左键拖拽旋转视角 | 右键拖拽平移 | 滚轮缩放');

animate();

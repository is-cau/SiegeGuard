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
scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.5,
  80,
);
camera.position.set(12, 16, 16);
camera.lookAt(0, 0, 0);

// ─── OrbitControls ────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, -1);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI / 2.2; // prevent going under ground
controls.minPolarAngle = 0.2;
// Use right mouse for rotate, left click for game interaction
controls.mouseButtons = {
  LEFT: -1 as any,  // disabled — we handle left click
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
controls.update();

// ─── Lighting ─────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x404060, 1.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.5);
sunLight.position.set(15, 25, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 60;
sunLight.shadow.camera.left = -15;
sunLight.shadow.camera.right = 15;
sunLight.shadow.camera.top = 15;
sunLight.shadow.camera.bottom = -15;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.8);
scene.add(hemisphereLight);

// ─── Decorative elements ──────────────────────────
// Water around the map
const waterGeo = new THREE.PlaneGeometry(40, 30);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x1a5276,
  roughness: 0.2,
  metalness: 0.8,
  transparent: true,
  opacity: 0.6,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.1;
water.receiveShadow = true;
scene.add(water);

// Castle at the end
const castleGroup = new THREE.Group();
const castleBaseGeo = new THREE.BoxGeometry(2, 1.5, 2);
const castleBaseMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.4, metalness: 0.3 });
const castleBase = new THREE.Mesh(castleBaseGeo, castleBaseMat);
castleBase.position.y = 0.75;
castleBase.castShadow = true;
castleGroup.add(castleBase);

for (let i = 0; i < 4; i++) {
  const towerGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.5, 8);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.4 });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
  tower.position.set(Math.cos(angle) * 1.1, 0.75, Math.sin(angle) * 1.1);
  tower.castShadow = true;
  castleGroup.add(tower);

  const coneGeo = new THREE.ConeGeometry(0.35, 0.6, 8);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.3, metalness: 0.3 });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(tower.position).add(new THREE.Vector3(0, 1.0, 0));
  cone.castShadow = true;
  castleGroup.add(cone);
}

const endPos = gridToWorld(11, 7);
castleGroup.position.set(endPos.x, 0, endPos.z + 2);
scene.add(castleGroup);

// Trees (decorative)
for (let i = 0; i < 30; i++) {
  const treeGroup = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const leavesGeo = new THREE.ConeGeometry(0.6, 1.5, 8);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 + Math.floor(Math.random() * 0x224411), roughness: 0.7 });
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = 1.8;
  leaves.castShadow = true;
  treeGroup.add(leaves);

  // Position trees away from the grid
  const margin = 3;
  const totalW = 30;
  const totalH = 24;
  let tx: number, tz: number;
  do {
    tx = (Math.random() - 0.5) * totalW;
    tz = (Math.random() - 0.5) * totalH;
  } while (
    tx > -12 && tx < 12 &&
    tz > -9 && tz < 7
  );
  treeGroup.position.set(tx, 0, tz);
  treeGroup.scale.setScalar(0.7 + Math.random() * 0.6);
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

// Left click: place tower
renderer.domElement.addEventListener('click', (e: MouseEvent) => {
  if (e.button !== 0) return; // only left click

  const grid = getGridFromEvent(e);
  if (!grid) return;

  const [col, row] = grid;

  // If a tower is selected, try to place it
  if (gameManager.selectedTowerType && gameManager.state.phase === GamePhase.Building) {
    const success = gameManager.placeTower(gameManager.selectedTowerType, col, row);
    if (success) {
      mapManager.hideRangePreview();
      mapManager.resetHighlights();
      uiManager.updateTowerButtons();
      // Keep selection for rapid placement
      if (!gameManager.canAfford(gameManager.selectedTowerType)) {
        gameManager.selectTower(null);
        uiManager.updateTowerButtons();
      }
    }
  }
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

// Mouse move: show preview
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

    if (valid) {
      mapManager.highlightCell(col, row, 0x4caf50);
    } else {
      mapManager.highlightCell(col, row, 0xf44336);
    }
    mapManager.showRangePreview(worldPos, config.range, valid);
  } else {
    mapManager.hideRangePreview();
  }
});

// ─── Resize Handler ───────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Game Loop ────────────────────────────────────
const clock = new THREE.Clock();
let lastTime = performance.now();

function animate(): void {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.1); // cap delta to prevent jumps

  controls.update();

  // Update all managers
  mapManager.update(now);
  towerManager.update(dt);
  enemyManager.update(dt);
  projectileManager.update(dt);
  effectManager.update(dt);
  gameManager.update(dt);

  // Water animation
  water.position.y = -0.1 + Math.sin(now * 0.001) * 0.05;

  // Update shadow camera
  sunLight.position.x = camera.position.x + 5;
  sunLight.position.z = camera.position.z + 5;

  renderer.render(scene, camera);
  lastTime = now;
}

// ─── Start ────────────────────────────────────────
console.log('🏰 SiegeGuard — 3D Tower Defense 已就绪');
console.log('  选择塔 → 点击地图放置 | 右键出售 | 空格开始波次');

animate();

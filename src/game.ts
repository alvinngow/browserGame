import * as THREE from 'three';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/enemies/Enemy.js';
import { TrainingDummyEnemy } from './entities/enemies/TrainingDummyEnemy.js';

type GridPosition = {
  x: number;
  z: number;
};

type CrystalMesh = THREE.Mesh & {
  userData: {
    homeY: number;
    gridX: number;
    gridZ: number;
  };
};

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

const canvas = getElement<HTMLCanvasElement>('#game');
const scoreEl = getElement<HTMLElement>('#score');
const distanceEl = getElement<HTMLElement>('#moves');
const toastEl = getElement<HTMLElement>('#toast');
const resetButton = getElement<HTMLButtonElement>('#reset');

const TILE = 1;
const PLAYER_RADIUS = 0.28;
const PLAYER_SPEED = 3.1;
const CRYSTAL_PICKUP_RADIUS = 0.42;
const MAP = [
  '....#....',
  '..C...C..',
  '.##..#...',
  '...EP..C.',
  '.C..##...',
  '...C.....',
  '..#...##.',
  '.C....C..',
  '....#....',
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07100e);
scene.fog = new THREE.Fog(0x07100e, 12, 24);

const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100);
camera.position.set(8, 9, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const world = new THREE.Group();
scene.add(world);

const ambient = new THREE.HemisphereLight(0xdffbed, 0x122018, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffe2a3, 2.6);
sun.position.set(4, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 26;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
scene.add(sun);

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x4aa36f, roughness: 0.9 }),
  grassAlt: new THREE.MeshStandardMaterial({ color: 0x69b46e, roughness: 0.9 }),
  edge: new THREE.MeshStandardMaterial({ color: 0x234235, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x5c6761, roughness: 0.8 }),
  stoneTop: new THREE.MeshStandardMaterial({
    color: 0x87928a,
    roughness: 0.75,
  }),
  crystal: new THREE.MeshStandardMaterial({
    color: 0x6ff2d5,
    emissive: 0x1bc5b1,
    emissiveIntensity: 0.8,
    roughness: 0.24,
    metalness: 0.08,
  }),
  water: new THREE.MeshStandardMaterial({
    color: 0x214e58,
    transparent: true,
    opacity: 0.58,
    roughness: 0.4,
  }),
};

const tileGeometry = new THREE.BoxGeometry(TILE, 0.28, TILE);
const blockGeometry = new THREE.BoxGeometry(TILE, 0.9, TILE);
const crystalGeometry = new THREE.OctahedronGeometry(0.23, 0);

const width = MAP[0].length;
const depth = MAP.length;
const offsetX = (width - 1) / 2;
const offsetZ = (depth - 1) / 2;

const blocked = new Set<string>();
const crystals = new Map<string, CrystalMesh>();
const enemies: Enemy[] = [];
let start: GridPosition = { x: 0, z: 0 };
const enemyStarts: GridPosition[] = [];
let distanceTravelled = 0;
let collected = 0;
let lastFrameTime = 0;

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clickPoint = new THREE.Vector3();
const pressedMoveKeys = new Set<string>();

function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

function worldPos(x: number, z: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3((x - offsetX) * TILE, y, (z - offsetZ) * TILE);
}

function createTile(x: number, z: number, kind: string): void {
  const isAlt = (x + z) % 2 === 0;
  const tile = new THREE.Mesh(
    tileGeometry,
    isAlt ? materials.grass : materials.grassAlt,
  );
  tile.position.copy(worldPos(x, z, -0.16));
  tile.castShadow = false;
  tile.receiveShadow = true;
  world.add(tile);

  const edge = new THREE.Mesh(tileGeometry, materials.edge);
  edge.scale.set(0.96, 1.4, 0.96);
  edge.position.copy(worldPos(x, z, -0.42));
  edge.receiveShadow = true;
  world.add(edge);

  if (kind === '#') {
    blocked.add(tileKey(x, z));
    const block = new THREE.Mesh(blockGeometry, materials.stone);
    block.position.copy(worldPos(x, z, 0.28));
    block.castShadow = true;
    block.receiveShadow = true;
    world.add(block);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.08, 0.84),
      materials.stoneTop,
    );
    cap.position.copy(worldPos(x, z, 0.78));
    cap.castShadow = true;
    world.add(cap);
  }
}

function createCrystal(x: number, z: number): void {
  const crystal = new THREE.Mesh(
    crystalGeometry,
    materials.crystal,
  ) as unknown as CrystalMesh;
  crystal.position.copy(worldPos(x, z, 0.36));
  crystal.rotation.set(0.35, 0.2, 0);
  crystal.castShadow = true;
  crystal.userData.homeY = crystal.position.y;
  crystal.userData.gridX = x;
  crystal.userData.gridZ = z;
  crystals.set(tileKey(x, z), crystal);
  world.add(crystal);
}

function createWater(): void {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(7.8, 72),
    materials.water,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.65;
  water.receiveShadow = true;
  scene.add(water);
}

createWater();

for (let z = 0; z < MAP.length; z += 1) {
  for (let x = 0; x < MAP[z].length; x += 1) {
    const kind = MAP[z][x];
    createTile(x, z, kind);

    if (kind === 'P') {
      start = { x, z };
    }

    if (kind === 'E') {
      enemyStarts.push({ x, z });
    }

    if (kind === 'C') {
      createCrystal(x, z);
    }
  }
}

const player = new Player(PLAYER_RADIUS, PLAYER_SPEED);
world.add(player.object);

for (const enemyStart of enemyStarts) {
  const enemy = new TrainingDummyEnemy();
  enemy.reset(worldPos(enemyStart.x, enemyStart.z, 0));
  enemies.push(enemy);
  world.add(enemy.object);
}

const totalCrystals = crystals.size;

function updateHud(): void {
  scoreEl.textContent = `${collected} / ${totalCrystals}`;
  distanceEl.textContent = `${distanceTravelled.toFixed(1)}`;
}

function resetGame(): void {
  pressedMoveKeys.clear();
  distanceTravelled = 0;
  collected = 0;
  player.reset(worldPos(start.x, start.z, 0));

  enemies.forEach((enemy, index) => {
    const enemyStart = enemyStarts[index];
    enemy.reset(worldPos(enemyStart.x, enemyStart.z, 0));
  });

  for (const crystal of crystals.values()) {
    crystal.visible = true;
    crystal.scale.setScalar(1);
  }

  toastEl.textContent = 'Use WASD or arrow keys to move. Left click to attack.';
  updateHud();
}

function worldToGrid(position: THREE.Vector3): GridPosition {
  return {
    x: position.x / TILE + offsetX,
    z: position.z / TILE + offsetZ,
  };
}

function circleIntersectsTile(
  circleX: number,
  circleZ: number,
  tileX: number,
  tileZ: number,
): boolean {
  const closestX = THREE.MathUtils.clamp(circleX, tileX - 0.5, tileX + 0.5);
  const closestZ = THREE.MathUtils.clamp(circleZ, tileZ - 0.5, tileZ + 0.5);
  const distanceX = circleX - closestX;
  const distanceZ = circleZ - closestZ;

  return (
    distanceX * distanceX + distanceZ * distanceZ <
    PLAYER_RADIUS * PLAYER_RADIUS
  );
}

function hasCollision(position: THREE.Vector3): boolean {
  const gridPosition = worldToGrid(position);
  const minX = -0.5 + PLAYER_RADIUS;
  const minZ = -0.5 + PLAYER_RADIUS;
  const maxX = width - 0.5 - PLAYER_RADIUS;
  const maxZ = depth - 0.5 - PLAYER_RADIUS;

  if (
    gridPosition.x < minX ||
    gridPosition.z < minZ ||
    gridPosition.x > maxX ||
    gridPosition.z > maxZ
  ) {
    return true;
  }

  for (const key of blocked) {
    const [tileX, tileZ] = key.split(',').map(Number);

    if (circleIntersectsTile(gridPosition.x, gridPosition.z, tileX, tileZ)) {
      return true;
    }
  }

  return false;
}

function collectCurrentTile(): void {
  const playerGridPosition = worldToGrid(player.position);

  for (const crystal of crystals.values()) {
    if (!crystal.visible) {
      continue;
    }

    const dx = playerGridPosition.x - crystal.userData.gridX;
    const dz = playerGridPosition.z - crystal.userData.gridZ;

    if (dx * dx + dz * dz > CRYSTAL_PICKUP_RADIUS * CRYSTAL_PICKUP_RADIUS) {
      continue;
    }

    crystal.visible = false;
    collected += 1;
    toastEl.textContent =
      collected === totalCrystals
        ? 'All crystals collected. The island is humming.'
        : 'Crystal gathered.';
    updateHud();
  }
}

function updateMovement(deltaSeconds: number): void {
  const direction = getHeldMoveDirection();
  const result = player.move(
    direction,
    deltaSeconds,
    (position) => !hasCollision(position),
  );

  if (result.blocked && direction.lengthSq() > 0) {
    toastEl.textContent = 'That path is blocked.';
    return;
  }

  distanceTravelled += result.travelled;
  collectCurrentTile();
  updateHud();
}

function setPointerFromEvent(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function attackToward(point: THREE.Vector3): void {
  if (player.attackToward(point)) {
    toastEl.textContent = 'Slash!';
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);

  if (raycaster.ray.intersectPlane(groundPlane, clickPoint)) {
    attackToward(clickPoint);
  }
}

const keyMoves = new Map([
  ['ArrowUp', [-1, -1]],
  ['KeyW', [-1, -1]],
  ['ArrowDown', [1, 1]],
  ['KeyS', [1, 1]],
  ['ArrowLeft', [-1, 1]],
  ['KeyA', [-1, 1]],
  ['ArrowRight', [1, -1]],
  ['KeyD', [1, -1]],
]);

function getHeldMoveDirection(): THREE.Vector3 {
  const direction = new THREE.Vector3(0, 0, 0);

  for (const code of pressedMoveKeys) {
    const keyMove = keyMoves.get(code);

    if (!keyMove) {
      continue;
    }

    direction.x += keyMove[0];
    direction.z += keyMove[1];
  }

  direction.x = Math.sign(direction.x);
  direction.z = Math.sign(direction.z);

  return direction;
}

window.addEventListener('keydown', (event) => {
  if (!keyMoves.has(event.code)) {
    return;
  }

  event.preventDefault();
  pressedMoveKeys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  pressedMoveKeys.delete(event.code);
});

window.addEventListener('blur', () => {
  pressedMoveKeys.clear();
});

canvas.addEventListener('pointerdown', handlePointerDown);
resetButton.addEventListener('click', resetGame);

function resize(): void {
  const widthPx = window.innerWidth;
  const heightPx = window.innerHeight;
  renderer.setSize(widthPx, heightPx, false);

  const aspect = widthPx / heightPx;
  const zoom = widthPx < 680 ? 5.7 : 6.4;
  camera.left = -zoom * aspect;
  camera.right = zoom * aspect;
  camera.top = zoom;
  camera.bottom = -zoom;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();
resetGame();

function animate(time: number): void {
  const seconds = time * 0.001;
  const deltaSeconds = Math.min(0.05, seconds - (lastFrameTime || seconds));
  lastFrameTime = seconds;

  updateMovement(deltaSeconds);
  player.update({ deltaSeconds, elapsedSeconds: seconds });

  for (const crystal of crystals.values()) {
    if (!crystal.visible) {
      continue;
    }

    crystal.rotation.y += 0.025;
    crystal.position.y =
      crystal.userData.homeY +
      Math.sin(seconds * 2.8 + crystal.position.x) * 0.07;
  }

  for (const enemy of enemies) {
    enemy.update({ deltaSeconds, elapsedSeconds: seconds });
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

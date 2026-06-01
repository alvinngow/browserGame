import * as THREE from 'three';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/enemies/Enemy.js';
import { TrainingDummyEnemy } from './entities/enemies/TrainingDummyEnemy.js';
import {
  getPointerNdc,
  getRequiredElement,
  listenToWindow,
  resize,
} from './utils/window.js';
import { MovementInput } from './utils/movement.js';
import { generateWorld } from './utils/world.js';

const canvas = getRequiredElement<HTMLCanvasElement>('#game');
const scoreEl = getRequiredElement<HTMLElement>('#score');
const distanceEl = getRequiredElement<HTMLElement>('#moves');
const toastEl = getRequiredElement<HTMLElement>('#toast');
const resetButton = getRequiredElement<HTMLButtonElement>('#reset');

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

const generatedWorld = generateWorld(MAP, scene);
const { blocked, crystals, depth, enemyStarts, group: world, start, width } =
  generatedWorld;
const enemies: Enemy[] = [];
let distanceTravelled = 0;
let collected = 0;
let lastFrameTime = 0;

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clickPoint = new THREE.Vector3();
const movementInput = new MovementInput();

const player = new Player(PLAYER_RADIUS, PLAYER_SPEED);
world.add(player.object);

for (const enemyStart of enemyStarts) {
  const enemy = new TrainingDummyEnemy();
  enemy.reset(generatedWorld.worldPos(enemyStart.x, enemyStart.z, 0));
  enemies.push(enemy);
  world.add(enemy.object);
}

const totalCrystals = crystals.size;

function updateHud(): void {
  scoreEl.textContent = `${collected} / ${totalCrystals}`;
  distanceEl.textContent = `${distanceTravelled.toFixed(1)}`;
}

function resetGame(): void {
  movementInput.clear();
  distanceTravelled = 0;
  collected = 0;
  player.reset(generatedWorld.worldPos(start.x, start.z, 0));

  enemies.forEach((enemy, index) => {
    const enemyStart = enemyStarts[index];
    enemy.reset(generatedWorld.worldPos(enemyStart.x, enemyStart.z, 0));
  });

  for (const crystal of crystals.values()) {
    crystal.visible = true;
    crystal.scale.setScalar(1);
  }

  toastEl.textContent = 'Use WASD or arrow keys to move. Left click to attack.';
  updateHud();
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
  const gridPosition = generatedWorld.worldToGrid(position);
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
  const playerGridPosition = generatedWorld.worldToGrid(player.position);

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
  const direction = movementInput.getDirection();
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
  const pointer = getPointerNdc(event, renderer.domElement);
  raycaster.setFromCamera(pointer, camera);

  if (raycaster.ray.intersectPlane(groundPlane, clickPoint)) {
    attackToward(clickPoint);
  }
}

listenToWindow('keydown', (event) => {
  if (!movementInput.isMovementKey(event.code)) {
    return;
  }

  event.preventDefault();
  movementInput.press(event.code);
});

listenToWindow('keyup', (event) => {
  movementInput.release(event.code);
});

listenToWindow('blur', () => {
  movementInput.clear();
});

canvas.addEventListener('pointerdown', handlePointerDown);
resetButton.addEventListener('click', resetGame);

listenToWindow('resize', () => resize(renderer, camera));
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

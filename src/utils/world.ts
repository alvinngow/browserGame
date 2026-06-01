import * as THREE from 'three';

export type GridPosition = {
  x: number;
  z: number;
};

export type CrystalMesh = THREE.Mesh & {
  userData: {
    homeY: number;
    gridX: number;
    gridZ: number;
  };
};

export type GeneratedWorld = {
  blocked: Set<string>;
  crystals: Map<string, CrystalMesh>;
  depth: number;
  enemyStarts: GridPosition[];
  group: THREE.Group;
  start: GridPosition;
  width: number;
  worldPos: (x: number, z: number, y?: number) => THREE.Vector3;
  worldToGrid: (position: THREE.Vector3) => GridPosition;
};

const TILE = 1;

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

export function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function generateWorld(map: string[], scene: THREE.Scene): GeneratedWorld {
  const group = new THREE.Group();
  const width = map[0].length;
  const depth = map.length;
  const offsetX = (width - 1) / 2;
  const offsetZ = (depth - 1) / 2;
  const blocked = new Set<string>();
  const crystals = new Map<string, CrystalMesh>();
  const enemyStarts: GridPosition[] = [];
  let start: GridPosition = { x: 0, z: 0 };

  const worldPos = (x: number, z: number, y = 0): THREE.Vector3 =>
    new THREE.Vector3((x - offsetX) * TILE, y, (z - offsetZ) * TILE);

  const worldToGrid = (position: THREE.Vector3): GridPosition => ({
    x: position.x / TILE + offsetX,
    z: position.z / TILE + offsetZ,
  });

  createWater(scene);
  scene.add(group);

  for (let z = 0; z < map.length; z += 1) {
    for (let x = 0; x < map[z].length; x += 1) {
      const kind = map[z][x];
      createTile({ blocked, group, kind, worldPos, x, z });

      if (kind === 'P') {
        start = { x, z };
      }

      if (kind === 'E') {
        enemyStarts.push({ x, z });
      }

      if (kind === 'C') {
        createCrystal({ crystals, group, worldPos, x, z });
      }
    }
  }

  return {
    blocked,
    crystals,
    depth,
    enemyStarts,
    group,
    start,
    width,
    worldPos,
    worldToGrid,
  };
}

function createTile(options: {
  blocked: Set<string>;
  group: THREE.Group;
  kind: string;
  worldPos: (x: number, z: number, y?: number) => THREE.Vector3;
  x: number;
  z: number;
}): void {
  const { blocked, group, kind, worldPos, x, z } = options;
  const isAlt = (x + z) % 2 === 0;
  const tile = new THREE.Mesh(
    tileGeometry,
    isAlt ? materials.grass : materials.grassAlt,
  );
  tile.position.copy(worldPos(x, z, -0.16));
  tile.castShadow = false;
  tile.receiveShadow = true;
  group.add(tile);

  const edge = new THREE.Mesh(tileGeometry, materials.edge);
  edge.scale.set(0.96, 1.4, 0.96);
  edge.position.copy(worldPos(x, z, -0.42));
  edge.receiveShadow = true;
  group.add(edge);

  if (kind !== '#') {
    return;
  }

  blocked.add(tileKey(x, z));

  const block = new THREE.Mesh(blockGeometry, materials.stone);
  block.position.copy(worldPos(x, z, 0.28));
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.08, 0.84),
    materials.stoneTop,
  );
  cap.position.copy(worldPos(x, z, 0.78));
  cap.castShadow = true;
  group.add(cap);
}

function createCrystal(options: {
  crystals: Map<string, CrystalMesh>;
  group: THREE.Group;
  worldPos: (x: number, z: number, y?: number) => THREE.Vector3;
  x: number;
  z: number;
}): void {
  const { crystals, group, worldPos, x, z } = options;
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
  group.add(crystal);
}

function createWater(scene: THREE.Scene): void {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(7.8, 72),
    materials.water,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.65;
  water.receiveShadow = true;
  scene.add(water);
}

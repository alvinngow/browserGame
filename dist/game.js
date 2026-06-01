import * as THREE from "three";
function getElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
const canvas = getElement("#game");
const scoreEl = getElement("#score");
const distanceEl = getElement("#moves");
const toastEl = getElement("#toast");
const resetButton = getElement("#reset");
const TILE = 1;
const PLAYER_RADIUS = 0.28;
const PLAYER_SPEED = 3.1;
const CRYSTAL_PICKUP_RADIUS = 0.42;
const MAP = [
    "....#....",
    "..C...C..",
    ".##..#...",
    "....P..C.",
    ".C..##...",
    "...C.....",
    "..#...##.",
    ".C....C..",
    "....#....",
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
    powerPreference: "high-performance",
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
    stoneTop: new THREE.MeshStandardMaterial({ color: 0x87928a, roughness: 0.75 }),
    player: new THREE.MeshStandardMaterial({ color: 0xf6c555, roughness: 0.44 }),
    playerTrim: new THREE.MeshStandardMaterial({ color: 0x273f37, roughness: 0.55 }),
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
const shadowGeometry = new THREE.CircleGeometry(0.34, 28);
const playerBodyGeometry = new THREE.SphereGeometry(0.34, 24, 20);
const playerHatGeometry = new THREE.ConeGeometry(0.28, 0.4, 24);
const swipeGeometry = createSwipeGeometry();
const width = MAP[0].length;
const depth = MAP.length;
const offsetX = (width - 1) / 2;
const offsetZ = (depth - 1) / 2;
const blocked = new Set();
const crystals = new Map();
let start = { x: 0, z: 0 };
let distanceTravelled = 0;
let collected = 0;
let bobClock = 0;
let lastFrameTime = 0;
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clickPoint = new THREE.Vector3();
const attack = {
    active: false,
    elapsed: 0,
    duration: 0.24,
    cooldown: 0.12,
    cooldownRemaining: 0,
};
const pressedMoveKeys = new Set();
function tileKey(x, z) {
    return `${x},${z}`;
}
function worldPos(x, z, y = 0) {
    return new THREE.Vector3((x - offsetX) * TILE, y, (z - offsetZ) * TILE);
}
function createTile(x, z, kind) {
    const isAlt = (x + z) % 2 === 0;
    const tile = new THREE.Mesh(tileGeometry, isAlt ? materials.grass : materials.grassAlt);
    tile.position.copy(worldPos(x, z, -0.16));
    tile.castShadow = false;
    tile.receiveShadow = true;
    world.add(tile);
    const edge = new THREE.Mesh(tileGeometry, materials.edge);
    edge.scale.set(0.96, 1.4, 0.96);
    edge.position.copy(worldPos(x, z, -0.42));
    edge.receiveShadow = true;
    world.add(edge);
    if (kind === "#") {
        blocked.add(tileKey(x, z));
        const block = new THREE.Mesh(blockGeometry, materials.stone);
        block.position.copy(worldPos(x, z, 0.28));
        block.castShadow = true;
        block.receiveShadow = true;
        world.add(block);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.84), materials.stoneTop);
        cap.position.copy(worldPos(x, z, 0.78));
        cap.castShadow = true;
        world.add(cap);
    }
}
function createCrystal(x, z) {
    const crystal = new THREE.Mesh(crystalGeometry, materials.crystal);
    crystal.position.copy(worldPos(x, z, 0.36));
    crystal.rotation.set(0.35, 0.2, 0);
    crystal.castShadow = true;
    crystal.userData.homeY = crystal.position.y;
    crystal.userData.gridX = x;
    crystal.userData.gridZ = z;
    crystals.set(tileKey(x, z), crystal);
    world.add(crystal);
}
function createWater() {
    const water = new THREE.Mesh(new THREE.CircleGeometry(7.8, 72), materials.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.65;
    water.receiveShadow = true;
    scene.add(water);
}
function createPlayer() {
    const group = new THREE.Group();
    const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({
        color: 0x07100e,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow);
    const body = new THREE.Mesh(playerBodyGeometry, materials.player);
    body.position.y = 0.44;
    body.castShadow = true;
    group.add(body);
    const hat = new THREE.Mesh(playerHatGeometry, materials.playerTrim);
    hat.position.y = 0.86;
    hat.castShadow = true;
    group.add(hat);
    const eyeGeometry = new THREE.SphereGeometry(0.035, 10, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x10231d });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.11, 0.52, 0.31);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.11;
    group.add(leftEye, rightEye);
    return group;
}
function createSwipeGeometry() {
    const vertices = [];
    const indices = [];
    const segments = 18;
    const arc = Math.PI * 0.88;
    const innerRadius = 0.42;
    const outerRadius = 1.05;
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = -arc / 2 + arc * t;
        const outerX = Math.sin(angle) * outerRadius;
        const outerZ = Math.cos(angle) * outerRadius;
        const innerX = Math.sin(angle) * innerRadius;
        const innerZ = Math.cos(angle) * innerRadius;
        vertices.push(outerX, 0, outerZ, innerX, 0, innerZ);
    }
    for (let i = 0; i < segments; i += 1) {
        const start = i * 2;
        indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
function createSwipeEffect() {
    const group = new THREE.Group();
    const main = new THREE.Mesh(swipeGeometry, new THREE.MeshBasicMaterial({
        color: 0xfff0a6,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
    }));
    const glow = new THREE.Mesh(swipeGeometry, new THREE.MeshBasicMaterial({
        color: 0x62f7dc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
    }));
    main.position.y = 0.48;
    glow.position.y = 0.46;
    glow.scale.setScalar(1.12);
    group.add(glow, main);
    group.visible = false;
    return group;
}
createWater();
for (let z = 0; z < MAP.length; z += 1) {
    for (let x = 0; x < MAP[z].length; x += 1) {
        const kind = MAP[z][x];
        createTile(x, z, kind);
        if (kind === "P") {
            start = { x, z };
        }
        if (kind === "C") {
            createCrystal(x, z);
        }
    }
}
const player = createPlayer();
world.add(player);
const swipeEffect = createSwipeEffect();
world.add(swipeEffect);
const totalCrystals = crystals.size;
function updateHud() {
    scoreEl.textContent = `${collected} / ${totalCrystals}`;
    distanceEl.textContent = `${distanceTravelled.toFixed(1)}`;
}
function resetGame() {
    pressedMoveKeys.clear();
    distanceTravelled = 0;
    collected = 0;
    player.position.copy(worldPos(start.x, start.z, 0));
    player.rotation.y = 0;
    swipeEffect.visible = false;
    attack.active = false;
    attack.elapsed = 0;
    attack.cooldownRemaining = 0;
    for (const crystal of crystals.values()) {
        crystal.visible = true;
        crystal.scale.setScalar(1);
    }
    toastEl.textContent = "Use WASD or arrow keys to move. Left click to attack.";
    updateHud();
}
function worldToGrid(position) {
    return {
        x: position.x / TILE + offsetX,
        z: position.z / TILE + offsetZ,
    };
}
function circleIntersectsTile(circleX, circleZ, tileX, tileZ) {
    const closestX = THREE.MathUtils.clamp(circleX, tileX - 0.5, tileX + 0.5);
    const closestZ = THREE.MathUtils.clamp(circleZ, tileZ - 0.5, tileZ + 0.5);
    const distanceX = circleX - closestX;
    const distanceZ = circleZ - closestZ;
    return distanceX * distanceX + distanceZ * distanceZ < PLAYER_RADIUS * PLAYER_RADIUS;
}
function hasCollision(position) {
    const gridPosition = worldToGrid(position);
    const minX = -0.5 + PLAYER_RADIUS;
    const minZ = -0.5 + PLAYER_RADIUS;
    const maxX = width - 0.5 - PLAYER_RADIUS;
    const maxZ = depth - 0.5 - PLAYER_RADIUS;
    if (gridPosition.x < minX ||
        gridPosition.z < minZ ||
        gridPosition.x > maxX ||
        gridPosition.z > maxZ) {
        return true;
    }
    for (const key of blocked) {
        const [tileX, tileZ] = key.split(",").map(Number);
        if (circleIntersectsTile(gridPosition.x, gridPosition.z, tileX, tileZ)) {
            return true;
        }
    }
    return false;
}
function moveAxis(deltaX, deltaZ) {
    const nextPosition = player.position.clone();
    nextPosition.x += deltaX;
    nextPosition.z += deltaZ;
    if (hasCollision(nextPosition)) {
        return false;
    }
    player.position.copy(nextPosition);
    return true;
}
function collectCurrentTile() {
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
                ? "All crystals collected. The island is humming."
                : "Crystal gathered.";
        updateHud();
    }
}
function updateMovement(deltaSeconds) {
    const direction = getHeldMoveDirection();
    if (direction.lengthSq() === 0) {
        return;
    }
    direction.normalize();
    const distance = PLAYER_SPEED * deltaSeconds;
    const movementX = direction.x * distance;
    const movementZ = direction.z * distance;
    const previousPosition = player.position.clone();
    moveAxis(movementX, 0);
    moveAxis(0, movementZ);
    const travelled = previousPosition.distanceTo(player.position);
    if (travelled === 0) {
        toastEl.textContent = "That path is blocked.";
        return;
    }
    distanceTravelled += travelled;
    player.rotation.y = Math.atan2(direction.x, direction.z);
    collectCurrentTile();
    updateHud();
}
function setPointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}
function faceWorldPoint(point) {
    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition);
    const direction = point.clone().sub(playerWorldPosition);
    direction.y = 0;
    if (direction.lengthSq() < 0.0001) {
        return;
    }
    player.rotation.y = Math.atan2(direction.x, direction.z);
}
function attackToward(point) {
    if (attack.cooldownRemaining > 0) {
        return;
    }
    faceWorldPoint(point);
    attack.active = true;
    attack.elapsed = 0;
    attack.cooldownRemaining = attack.duration + attack.cooldown;
    swipeEffect.visible = true;
    swipeEffect.position.copy(player.position);
    swipeEffect.rotation.y = player.rotation.y;
    toastEl.textContent = "Slash!";
}
function handlePointerDown(event) {
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
function updateAttack(deltaSeconds) {
    if (attack.cooldownRemaining > 0) {
        attack.cooldownRemaining = Math.max(0, attack.cooldownRemaining - deltaSeconds);
    }
    if (!attack.active) {
        return;
    }
    attack.elapsed += deltaSeconds;
    const progress = Math.min(attack.elapsed / attack.duration, 1);
    const fade = Math.sin(progress * Math.PI);
    const scale = 0.72 + progress * 0.52;
    swipeEffect.position.copy(player.position);
    swipeEffect.rotation.y = player.rotation.y - 0.68 + progress * 1.36;
    swipeEffect.scale.set(scale, 1, scale);
    const [glow, main] = swipeEffect.children;
    glow.material.opacity = 0.24 * fade;
    main.material.opacity = 0.74 * fade;
    if (progress >= 1) {
        attack.active = false;
        swipeEffect.visible = false;
    }
}
const keyMoves = new Map([
    ["ArrowUp", [0, -1]],
    ["KeyW", [0, -1]],
    ["ArrowDown", [0, 1]],
    ["KeyS", [0, 1]],
    ["ArrowLeft", [-1, 0]],
    ["KeyA", [-1, 0]],
    ["ArrowRight", [1, 0]],
    ["KeyD", [1, 0]],
]);
function getHeldMoveDirection() {
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
window.addEventListener("keydown", (event) => {
    if (!keyMoves.has(event.code)) {
        return;
    }
    event.preventDefault();
    pressedMoveKeys.add(event.code);
});
window.addEventListener("keyup", (event) => {
    pressedMoveKeys.delete(event.code);
});
window.addEventListener("blur", () => {
    pressedMoveKeys.clear();
});
canvas.addEventListener("pointerdown", handlePointerDown);
resetButton.addEventListener("click", resetGame);
function resize() {
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
window.addEventListener("resize", resize);
resize();
resetGame();
function animate(time) {
    const seconds = time * 0.001;
    const deltaSeconds = Math.min(0.05, seconds - (lastFrameTime || seconds));
    lastFrameTime = seconds;
    bobClock += deltaSeconds;
    updateMovement(deltaSeconds);
    player.position.y = Math.sin(bobClock * 4.5) * 0.035;
    for (const crystal of crystals.values()) {
        if (!crystal.visible) {
            continue;
        }
        crystal.rotation.y += 0.025;
        crystal.position.y = crystal.userData.homeY + Math.sin(seconds * 2.8 + crystal.position.x) * 0.07;
    }
    updateAttack(deltaSeconds);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

import * as THREE from "three";
import { EntityUpdateContext, GameEntity } from "./GameEntity.js";

type AttackState = {
  active: boolean;
  elapsed: number;
  duration: number;
  cooldown: number;
  cooldownRemaining: number;
};

export type MovementResult = {
  blocked: boolean;
  travelled: number;
};

export type CanOccupyPosition = (position: THREE.Vector3) => boolean;

export class Player extends GameEntity {
  private readonly speed: number;
  private readonly swipeEffect: THREE.Group;
  private readonly attack: AttackState = {
    active: false,
    elapsed: 0,
    duration: 0.24,
    cooldown: 0.12,
    cooldownRemaining: 0,
  };
  private bobClock = 0;

  constructor(radius: number, speed: number) {
    const object = createPlayerModel();
    super(object, radius);

    this.speed = speed;
    this.swipeEffect = createSwipeEffect();
    this.object.add(this.swipeEffect);
  }

  override reset(position: THREE.Vector3): void {
    super.reset(position);
    this.bobClock = 0;
    this.swipeEffect.visible = false;
    this.attack.active = false;
    this.attack.elapsed = 0;
    this.attack.cooldownRemaining = 0;
  }

  move(
    direction: THREE.Vector3,
    deltaSeconds: number,
    canOccupyPosition: CanOccupyPosition,
  ): MovementResult {
    if (direction.lengthSq() === 0) {
      return { blocked: false, travelled: 0 };
    }

    const normalizedDirection = direction.clone().normalize();
    const distance = this.speed * deltaSeconds;
    const previousPosition = this.position.clone();

    this.moveAxis(normalizedDirection.x * distance, 0, canOccupyPosition);
    this.moveAxis(0, normalizedDirection.z * distance, canOccupyPosition);

    const travelled = previousPosition.distanceTo(this.position);

    if (travelled > 0) {
      this.faceDirection(normalizedDirection);
    }

    return { blocked: travelled === 0, travelled };
  }

  attackToward(point: THREE.Vector3): boolean {
    if (this.attack.cooldownRemaining > 0) {
      return false;
    }

    const direction = point.clone().sub(this.position);
    direction.y = 0;
    this.faceDirection(direction);

    this.attack.active = true;
    this.attack.elapsed = 0;
    this.attack.cooldownRemaining = this.attack.duration + this.attack.cooldown;
    this.swipeEffect.visible = true;
    this.swipeEffect.rotation.y = 0;
    this.swipeEffect.scale.setScalar(1);

    return true;
  }

  override update(context: EntityUpdateContext): void {
    this.bobClock += context.deltaSeconds;
    this.position.y = Math.sin(this.bobClock * 4.5) * 0.035;
    this.updateAttack(context.deltaSeconds);
  }

  private moveAxis(
    deltaX: number,
    deltaZ: number,
    canOccupyPosition: CanOccupyPosition,
  ): boolean {
    const nextPosition = this.position.clone();
    nextPosition.x += deltaX;
    nextPosition.z += deltaZ;

    if (!canOccupyPosition(nextPosition)) {
      return false;
    }

    this.setPosition(nextPosition);
    return true;
  }

  private updateAttack(deltaSeconds: number): void {
    if (this.attack.cooldownRemaining > 0) {
      this.attack.cooldownRemaining = Math.max(
        0,
        this.attack.cooldownRemaining - deltaSeconds,
      );
    }

    if (!this.attack.active) {
      return;
    }

    this.attack.elapsed += deltaSeconds;
    const progress = Math.min(this.attack.elapsed / this.attack.duration, 1);
    const fade = Math.sin(progress * Math.PI);
    const scale = 0.72 + progress * 0.52;

    this.swipeEffect.rotation.y = -0.68 + progress * 1.36;
    this.swipeEffect.scale.set(scale, 1, scale);

    const [glow, main] = this.swipeEffect.children as Array<
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    >;
    glow.material.opacity = 0.24 * fade;
    main.material.opacity = 0.74 * fade;

    if (progress >= 1) {
      this.attack.active = false;
      this.swipeEffect.visible = false;
    }
  }
}

function createPlayerModel(): THREE.Group {
  const group = new THREE.Group();
  const shadowGeometry = new THREE.CircleGeometry(0.34, 28);
  const bodyGeometry = new THREE.SphereGeometry(0.34, 24, 20);
  const hatGeometry = new THREE.ConeGeometry(0.28, 0.4, 24);
  const playerMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6c555,
    roughness: 0.44,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x273f37,
    roughness: 0.55,
  });

  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x07100e,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);

  const body = new THREE.Mesh(bodyGeometry, playerMaterial);
  body.position.y = 0.44;
  body.castShadow = true;
  group.add(body);

  const hat = new THREE.Mesh(hatGeometry, trimMaterial);
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

function createSwipeEffect(): THREE.Group {
  const group = new THREE.Group();
  const swipeGeometry = createSwipeGeometry();
  const main = new THREE.Mesh(
    swipeGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xfff0a6,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const glow = new THREE.Mesh(
    swipeGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x62f7dc,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  main.position.y = 0.48;
  glow.position.y = 0.46;
  glow.scale.setScalar(1.12);
  group.add(glow, main);
  group.visible = false;

  return group;
}

function createSwipeGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
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
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

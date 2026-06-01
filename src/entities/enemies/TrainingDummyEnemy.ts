import * as THREE from "three";
import { EntityUpdateContext } from "../GameEntity.js";
import { Enemy } from "./Enemy.js";

export class TrainingDummyEnemy extends Enemy {
  private homeY = 0;

  constructor() {
    super(createTrainingDummyModel(), {
      maxHealth: 3,
      radius: 0.32,
    });
  }

  override reset(position: THREE.Vector3): void {
    super.reset(position);
    this.homeY = position.y;
  }

  override update(context: EntityUpdateContext): void {
    if (!this.isAlive) {
      return;
    }

    this.object.rotation.y = Math.sin(context.elapsedSeconds * 1.8) * 0.2;
    this.position.y = this.homeY + Math.sin(context.elapsedSeconds * 3) * 0.035;
  }
}

function createTrainingDummyModel(): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xc86f46,
    roughness: 0.72,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x26342f,
    roughness: 0.85,
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({
      color: 0x07100e,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.24, 16), trimMaterial);
  base.position.y = 0.14;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 8, 16), bodyMaterial);
  body.position.y = 0.58;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111715 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMaterial);
  leftEye.position.set(-0.08, 0.7, 0.2);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.08;
  group.add(leftEye, rightEye);

  return group;
}

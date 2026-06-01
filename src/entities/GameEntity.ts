import * as THREE from "three";

export type EntityUpdateContext = {
  deltaSeconds: number;
  elapsedSeconds: number;
};

export abstract class GameEntity {
  readonly object: THREE.Group;
  readonly radius: number;

  protected constructor(object: THREE.Group, radius: number) {
    this.object = object;
    this.radius = radius;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  setPosition(position: THREE.Vector3): void {
    this.object.position.copy(position);
  }

  faceDirection(direction: THREE.Vector3): void {
    if (direction.lengthSq() < 0.0001) {
      return;
    }

    this.object.rotation.y = Math.atan2(direction.x, direction.z);
  }

  reset(position: THREE.Vector3): void {
    this.setPosition(position);
    this.object.rotation.set(0, 0, 0);
  }

  abstract update(context: EntityUpdateContext): void;
}

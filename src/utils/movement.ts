import * as THREE from 'three';

const cameraRelativeKeyMoves = new Map<string, readonly [number, number]>([
  ['ArrowUp', [-1, -1]],
  ['KeyW', [-1, -1]],
  ['ArrowDown', [1, 1]],
  ['KeyS', [1, 1]],
  ['ArrowLeft', [-1, 1]],
  ['KeyA', [-1, 1]],
  ['ArrowRight', [1, -1]],
  ['KeyD', [1, -1]],
]);

export class MovementInput {
  private readonly pressedKeys = new Set<string>();

  isMovementKey(code: string): boolean {
    return cameraRelativeKeyMoves.has(code);
  }

  press(code: string): void {
    if (this.isMovementKey(code)) {
      this.pressedKeys.add(code);
    }
  }

  release(code: string): void {
    this.pressedKeys.delete(code);
  }

  clear(): void {
    this.pressedKeys.clear();
  }

  getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, 0);

    for (const code of this.pressedKeys) {
      const keyMove = cameraRelativeKeyMoves.get(code);

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
}

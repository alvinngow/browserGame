import * as THREE from "three";
import { EntityUpdateContext, GameEntity } from "../GameEntity.js";

export type EnemyConfig = {
  maxHealth: number;
  radius: number;
};

export abstract class Enemy extends GameEntity {
  readonly maxHealth: number;
  protected health: number;

  protected constructor(object: THREE.Group, config: EnemyConfig) {
    super(object, config.radius);
    this.maxHealth = config.maxHealth;
    this.health = config.maxHealth;
  }

  get isAlive(): boolean {
    return this.health > 0;
  }

  takeDamage(amount: number): void {
    if (!this.isAlive) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.object.visible = this.isAlive;
  }

  override reset(position: THREE.Vector3): void {
    super.reset(position);
    this.health = this.maxHealth;
    this.object.visible = true;
  }

  abstract override update(context: EntityUpdateContext): void;
}

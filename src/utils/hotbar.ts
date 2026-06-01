export class Hotbar {
  private readonly slots: HTMLElement[];
  private selectedSlot = 1;

  constructor(slots: HTMLElement[]) {
    this.slots = slots;
    this.select(1);
  }

  isHotbarKey(code: string): boolean {
    return /^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code);
  }

  selectFromKey(code: string): number | null {
    if (!this.isHotbarKey(code)) {
      return null;
    }

    const slot = Number(code[code.length - 1]);
    this.select(slot);

    return slot;
  }

  select(slot: number): void {
    if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
      return;
    }

    this.selectedSlot = slot;

    for (const slotElement of this.slots) {
      const isActive = slotElement.dataset.slot === String(this.selectedSlot);
      slotElement.classList.toggle('is-active', isActive);
      slotElement.setAttribute('aria-pressed', String(isActive));
    }
  }
}

export function getHotbarSlots(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.hotbar-slot'));
}

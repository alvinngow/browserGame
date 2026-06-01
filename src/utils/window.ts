import * as THREE from 'three';

export function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

export function getPointerNdc(
  event: PointerEvent,
  element: HTMLElement,
): THREE.Vector2 {
  const rect = element.getBoundingClientRect();

  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  );
}

export function getWindowSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function listenToWindow<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
): () => void {
  window.addEventListener(type, listener);

  return () => window.removeEventListener(type, listener);
}

export function resize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera,
): void {
  const { width: widthPx, height: heightPx } = getWindowSize();
  renderer.setSize(widthPx, heightPx, false);

  const aspect = widthPx / heightPx;
  const zoom = widthPx < 680 ? 5.7 : 6.4;
  camera.left = -zoom * aspect;
  camera.right = zoom * aspect;
  camera.top = zoom;
  camera.bottom = -zoom;
  camera.updateProjectionMatrix();
}

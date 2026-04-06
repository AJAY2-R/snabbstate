import { VNode } from "../vnode";

export type EffectCallback = () => void | (() => void);

export interface RenderEffect {
  callback: EffectCallback;
  cleanup?: () => void;
  deps?: any[];
  type: "effect" | "layoutEffect";
}

export type HooksContext = {
  hookStates: any[];
  hookIndex: number;
  /** Batched update — coalesces multiple setState calls per tick into one re-render */
  update: () => void;
  /** Synchronous immediate patch — use sparingly (e.g. critical layout corrections) */
  _syncUpdate: () => void;
  /** Returns true while the component is inserted in the DOM */
  isMounted: () => boolean;
  /** Register a one-time callback that fires after the component mounts */
  onMounted: (cb: () => void) => void;
  /** Register a callback that fires when the component is destroyed */
  onUnmounted: (cb: () => void) => void;
  vNode: () => VNode;
  // Effect queues
  effects: RenderEffect[];
  layoutEffects: RenderEffect[];
  // Internal
  _scheduleEffect: (effect: RenderEffect) => void;
  _scheduleLayoutEffect: (effect: RenderEffect) => void;
};

export interface ComponentInstance {
  vnode: VNode;
  update(): void;
  destroy(): void;
}

export type IUseState<T> = [T, (value: T) => void];
export type ComponentProps<T> = T & { children?: VNode[] };
export type ComponentFn<T> = (
  props: ComponentProps<T>,
  ctx: HooksContext
) => VNode;

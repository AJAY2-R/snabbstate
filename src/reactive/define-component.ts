import { init } from "../init";
import { attributesModule } from "../modules/attributes";
import { classModule } from "../modules/class";
import { datasetModule } from "../modules/dataset";
import { eventListenersModule } from "../modules/eventlisteners";
import { propsModule } from "../modules/props";
import { styleModule } from "../modules/style";
import { VNode } from "../vnode";
import type {
  ComponentFn,
  ComponentInstance,
  ComponentProps,
  RenderEffect,
  HooksContext
} from "./models";

export const patch = init([
  classModule,
  propsModule,
  styleModule,
  eventListenersModule,
  datasetModule,
  attributesModule
]);

// Shallow equality for props comparison — avoids re-renders when parent creates
// a new object with the same values on every render.
function shallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function defineComponent<T>(
  componentFn: ComponentFn<T>,
  displayName?: string
) {
  const _name = displayName ?? componentFn.name ?? "AnonymousComponent";
  return function createInstance(
    initialProps: ComponentProps<T>,
    ...children: VNode[]
  ): ComponentInstance {
    if (!initialProps) {
      initialProps = {} as ComponentProps<T>;
    }
    initialProps.children = children;

    let currentProps = initialProps;

    let oldVNode: VNode | null = null;
    let mounted = false;
    let isUpdating = false;
    let updateScheduled = false;

    const mountCallbacks: (() => void)[] = [];
    const unmountCallbacks: (() => void)[] = [];
    let destroyed = false;

    let pendingEffects: RenderEffect[] = [];
    let pendingLayoutEffects: RenderEffect[] = [];

    const elementNode = () => oldVNode!;

    const flushLayoutEffects = () => {
      const effects = pendingLayoutEffects;
      pendingLayoutEffects = [];

      effects.forEach((effect) => {
        if (effect.cleanup) {
          effect.cleanup();
        }
        const cleanup = effect.callback();
        if (typeof cleanup === "function") {
          effect.cleanup = cleanup;
        }
      });
    };

    const flushEffects = () => {
      if (pendingEffects.length === 0) return;
      const effects = pendingEffects;
      pendingEffects = [];
      queueMicrotask(() => {
        if (!mounted) return;
        effects.forEach((effect) => {
          if (effect.cleanup) effect.cleanup();
          const cleanup = effect.callback();
          if (typeof cleanup === "function") effect.cleanup = cleanup;
        });
      });
    };

    const doUpdate = () => {
      if (isUpdating) return;
      isUpdating = true;
      ctx.hookIndex = 0;
      ctx.effects = [];
      ctx.layoutEffects = [];
      try {
        const newVNode = componentFn(currentProps, ctx);
        if (!oldVNode)
          throw new Error(`[${_name}] oldVNode is null during update`);
        if (newVNode.data) {
          (newVNode.data as any)._componentProps = currentProps;
          (newVNode.data as any)._componentUpdateProps = updatePropsAndSchedule;
        }
        oldVNode = patch(oldVNode, newVNode);
        flushLayoutEffects();
        flushEffects();
      } catch (err) {
        console.error(`[${_name}] render error:`, err);
      } finally {
        isUpdating = false;
      }
    };

    const scheduleUpdate = () => {
      if (updateScheduled || isUpdating) return;
      updateScheduled = true;
      queueMicrotask(() => {
        updateScheduled = false;
        if (mounted) doUpdate();
      });
    };

    const updatePropsAndSchedule = (newProps: ComponentProps<T>) => {
      if (
        shallowEqual(
          currentProps as Record<string, unknown>,
          newProps as Record<string, unknown>
        )
      )
        return;
      currentProps = newProps;
      if (mounted) scheduleUpdate();
    };

    const ctx: HooksContext = {
      hookStates: [],
      hookIndex: 0,
      effects: [],
      layoutEffects: [],

      update: scheduleUpdate,
      _syncUpdate: doUpdate,
      isMounted: () => mounted,

      onMounted(cb) {
        mountCallbacks.push(cb);
      },

      onUnmounted(cb) {
        unmountCallbacks.push(cb);
      },

      vNode: elementNode,

      _scheduleEffect(effect: RenderEffect) {
        pendingEffects.push(effect);
      },

      _scheduleLayoutEffect(effect: RenderEffect) {
        pendingLayoutEffects.push(effect);
      }
    };

    ctx.hookIndex = 0;
    let vnode: VNode;
    try {
      vnode = componentFn(currentProps, ctx);
    } catch (err) {
      console.error(`[${_name}] initial render error:`, err);
      vnode = { sel: "div", data: {}, children: [] } as unknown as VNode;
    }

    const originalHook = vnode.data?.hook ?? {};
    vnode.data = vnode.data ?? {};

    (vnode.data as any)._componentProps = currentProps;
    (vnode.data as any)._componentUpdateProps = updatePropsAndSchedule;

    const cleanupAll = () => {
      [...ctx.effects, ...ctx.layoutEffects].forEach((effect) => {
        if (effect.cleanup) {
          effect.cleanup();
          effect.cleanup = undefined;
        }
      });
      pendingEffects = [];
      pendingLayoutEffects = [];
    };

    const performDestroy = () => {
      if (destroyed) return;
      destroyed = true;
      cleanupAll();
      unmountCallbacks.forEach((cb) => cb());
      mounted = false;
      oldVNode = null;
    };

    vnode.data.hook = {
      ...originalHook,
      insert(insertVnode) {
        originalHook.insert?.(insertVnode);
        if (!mounted) {
          mounted = true;
          oldVNode = insertVnode;
          flushLayoutEffects();
          flushEffects();
          queueMicrotask(() => mountCallbacks.forEach((cb) => cb()));
        }
      },
      update(oldVnode, newVnode) {
        const newProps = (newVnode.data as any)?._componentProps as
          | ComponentProps<T>
          | undefined;
        const liveUpdater: ((p: ComponentProps<T>) => void) | undefined = (
          oldVnode.data as any
        )?._componentUpdateProps;
        if (newProps !== undefined && liveUpdater) {
          liveUpdater(newProps);
          (newVnode.data as any)._componentUpdateProps = liveUpdater;
        }
        originalHook.update?.(oldVnode, newVnode);
      },
      destroy(destroyVnode) {
        originalHook.destroy?.(destroyVnode);
        performDestroy();
      },
      remove(removeVnode, removeCallback) {
        originalHook.remove?.(removeVnode, removeCallback);
        cleanupAll();
        removeCallback();
      }
    };

    oldVNode = vnode;

    return {
      vnode,
      update: doUpdate,
      destroy: performDestroy
    };
  };
}

export type ComponentRenderer<T> = (
  props: ComponentProps<T>,
  ...children: VNode[]
) => VNode;

export function render<T>(componentFn: ComponentFn<T>): ComponentRenderer<T> {
  const createInstance = defineComponent(componentFn);
  return function renderInstance(
    props: ComponentProps<T>,
    ...children: VNode[]
  ): VNode {
    const instance = createInstance(props, ...children);
    return instance.vnode;
  };
}

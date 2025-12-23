import { classModule } from "../modules/class";
import { propsModule } from "../modules/props";
import { styleModule } from "../modules/style";
import { eventListenersModule } from "../modules/eventlisteners";
import { init } from "../init";
import { VNode } from "../vnode";
import { HooksContext } from "./hooks-context";

export const patch = init([
  classModule,
  propsModule,
  styleModule,
  eventListenersModule
]);

interface ComponentInstance {
  ctx: HooksContext;
  vnode: VNode;
  update(): void;
  destroy(): void;
}
export type ComponentFn<TProps> = (props: TProps, ctx: HooksContext) => VNode;

type ControlledHooksContext = HooksContext & {
  __updateScheduled?: boolean; // internal control flag
};

export function defineComponent<TProps>(componentFn: ComponentFn<TProps>) {
  return function createInstance(props: TProps): ComponentInstance {
    let oldVNode: VNode | null = null;
    let isMounted = false;
    let isRendering = false;
    let pendingUpdate = false;
    let preventPatch = false;

    const elementNode = () => {
      return vnode;
    };

    const ctx = {
      hookStates: [],
      hookIndex: 0,
      __updateScheduled: false,
      update() {
        if (preventPatch) {
          return;
        }
        if (isRendering) {
          pendingUpdate = true;
          return;
        }

        if (!isMounted) {
          pendingUpdate = true;
          return;
        }

        isRendering = true;
        ctx.hookIndex = 0;

        try {
          const newVNode = componentFn(props, ctx);
          oldVNode = patch(oldVNode as VNode, newVNode);
        } finally {
          isRendering = false;
        }

        if (pendingUpdate) {
          pendingUpdate = false;
          ctx.update();
        }
      },
      vNode: elementNode,
      preventPatch(state = true) {
        preventPatch = state;
      }
    } as ControlledHooksContext;

    ctx.hookIndex = 0;
    const vnode = componentFn(props, ctx);
    oldVNode = vnode;

    isMounted = true;

    if (pendingUpdate) {
      pendingUpdate = false;
      queueMicrotask(() => ctx.update());
    }

    return {
      vnode,
      ctx,
      update: ctx.update,
      destroy: () => {
        oldVNode = null;
        isMounted = false;
      }
    };
  };
}

export function render<TProps>(componentFn: ComponentFn<TProps>) {
  const createInstance = defineComponent(componentFn);
  return function renderInstance(props: TProps): VNode {
    const instance = createInstance(props);
    return instance.vnode;
  };
}

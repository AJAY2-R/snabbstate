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
  vnode: VNode;
  update(): void;
  destroy(): void;
}
export type ComponentFn<TProps> = (props: TProps, ctx: HooksContext) => VNode;

export function defineComponent<TProps>(componentFn: ComponentFn<TProps>) {
  return function createInstance(props: TProps): ComponentInstance {
    let oldVNode: VNode | null = null;
    const elementNode = () => {
      return vnode;
    };
    const ctx: HooksContext = {
      hookStates: [],
      hookIndex: 0,
      update() {
        ctx.hookIndex = 0;
        const newVNode = componentFn(props, ctx);
        if (!oldVNode) throw new Error("Old VNode is null during update");
        oldVNode = patch(oldVNode, newVNode);
      },
      vNode: elementNode
    };
    const vnode = componentFn(props, ctx);
    oldVNode = vnode;
    return {
      vnode,
      update: ctx.update,
      destroy: () => {
        oldVNode = null;
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


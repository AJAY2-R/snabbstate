import { Hooks } from "./hooks";
import { AttachData } from "./helpers/attachto";
import { VNodeStyle } from "./modules/style";
import { On } from "./modules/eventlisteners";
import { Attrs } from "./modules/attributes";
import { Classes } from "./modules/class";
import { Props } from "./modules/props";
import { Dataset } from "./modules/dataset";
import { DirectiveRegistry } from "./modules/directive";

export type Key = PropertyKey;

export interface VNode {
  sel: string | undefined;
  data: VNodeData | undefined;
  children: Array<VNode | string> | undefined;
  elm: Node | undefined;
  text: string | undefined;
  key: Key | undefined;
  directives?: Record<string, any>;
}

export interface VNodeData<VNodeProps = Props> {
  props?: VNodeProps;
  attrs?: Attrs;
  class?: Classes;
  className?: string;
  style?: VNodeStyle;
  dataset?: Dataset;
  on?: On;
  attachData?: AttachData;
  hook?: Hooks;
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: any[]; // for thunks
  is?: string; // for custom elements v1
  directives?: Record<string, any>; // for custom directives
  [key: string]: any; // for any other 3rd party module
}

export function vnode(
  sel: string | undefined,
  data: any | undefined,
  children: Array<VNode | string> | undefined,
  text: string | undefined,
  elm: Element | DocumentFragment | Text | undefined
): VNode {
  const key = data === undefined ? undefined : data.key;
  const directives: Record<string, any> = {};
  initializeDirectives(data, directives);
  return { sel, data, children, text, elm, key, directives };
}

function initializeDirectives(data: any, directives: Record<string, any>) {
  Object.keys(data || {}).forEach(key => {
    const directive = DirectiveRegistry.get(key);
    if (directive) {
      directives[key] = directive;
    }
  });
}


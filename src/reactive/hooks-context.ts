import { VNode } from "../vnode";

export type HooksContext = {
  hookStates: any[];
  hookIndex: number;
  update: () => void;
  vNode: () => VNode;
};

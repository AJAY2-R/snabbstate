import { VNode, VNodeData } from "../vnode";
import { Module } from "./module";

export type Classes = Record<string, boolean>;

function updateClass(oldVnode: VNode, vnode: VNode): void {
  let cur: any;
  let name: string;
  const elm: Element = vnode.elm as Element;
  let oldClass = (oldVnode.data as VNodeData).class;
  let klass = (vnode.data as VNodeData).class;
  let oldClassName = (oldVnode.data as VNodeData).className || "";
  let className = (vnode.data as VNodeData).className || "";

  if (!oldClass && !klass && !oldClassName && !className) return;
  if (oldClass === klass && oldClassName === className) return;
  oldClass = oldClass || {};
  klass = klass || {};

  for (name in oldClass) {
    if (oldClass[name] && !Object.prototype.hasOwnProperty.call(klass, name)) {
      // was `true` and now not provided
      elm.classList.remove(name);
    }
  }
  for (name in klass) {
    cur = klass[name];
    if (cur !== oldClass[name]) {
      (elm.classList as any)[cur ? "add" : "remove"](name);
    }
  }
  if (className !== oldClassName) {
    elm.classList.remove(
      ...oldClassName.split(" ").filter((c) => c.length > 0)
    );
    elm.classList.add(...className.split(" ").filter((c) => c.length > 0));
  }
}

export const classModule: Module = { create: updateClass, update: updateClass };

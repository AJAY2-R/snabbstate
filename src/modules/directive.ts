import { VNode } from "../vnode";
import { Class } from "../helpers/class";

export class DirectiveRegistry {
    private static directives: Map<string, IDirective> = new Map();
    public static register(name: string, directive: IDirective) {
        if (this.directives.has(name)) {
            throw new Error(`Directive with name ${name} already exists`);
        }
        this.directives.set(name, directive);
    }
    public static get(name: string): IDirective | undefined {
        return this.directives.get(name);
    }
}

export interface IDirective<T = unknown> {
    init?(vnode: VNode): void;
    create?(value: T, oldVNode: VNode, newVNode: VNode): void;
    update?(value: T, oldVNode: VNode, newVNode: VNode): void;
    destroy?(vnode: VNode): void;
    remove?(vnode: VNode, removeCallback: () => void): void;
}

export abstract class Directive<T> implements IDirective<T> {
}

export function directive(name: string) {
    return function (target: Class<IDirective>) {
        DirectiveRegistry.register(name, new target());
    };
}


export const directiveModules = {
    init: (vnode: VNode) => {
        invokeDirectives(vnode, directive => {
            directive.init?.(vnode);
        });
    },
    create: (oldVNode: VNode, newVNode: VNode) => {
        invokeDirectives(newVNode, (directive, value) => {
            directive.create?.(value, oldVNode, newVNode);
        });
    },
    update: (oldVNode: VNode, newVNode: VNode) => {
        invokeDirectives(newVNode, (directive, value) => {
            directive.update?.(value, oldVNode, newVNode);
        });
    },
    destroy: (vnode: VNode) => {
        invokeDirectives(vnode, (directive, value) => {
            directive.destroy?.(vnode);
        });
    },
    remove: (vnode: VNode, removeCallback: () => void) => {
        invokeDirectives(vnode, (directive, value) => {
            directive.remove?.(vnode, removeCallback);
        });
        removeCallback();
    }
}

function invokeDirectives(node: VNode, fn: (directive: IDirective, value: unknown) => void) {
    const directives = node.directives || {};
    Object.keys(directives).forEach(key => {
        const directive = directives[key] as IDirective;
        const value = node.data?.[key];
        fn(directive, value);
    });
    return directives;
}

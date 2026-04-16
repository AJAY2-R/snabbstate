import { Hooks } from "../hooks";
export class DirectiveRegistry {
    private static directives: Map<string, IDirective>;
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

export interface IDirective extends Hooks {
}


export abstract class Directive implements IDirective {
}

export type Class<T> = new (...args: any[]) => T;

export function directive(name: string, directive: Class<IDirective>) {
    DirectiveRegistry.register(name, new directive());
}

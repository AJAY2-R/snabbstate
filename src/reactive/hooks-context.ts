import type { HooksContext } from "./models";

const currentHooksContextStack: HooksContext[] = [];

export function pushCurrentHooksContext(ctx: HooksContext): void {
  currentHooksContextStack.push(ctx);
}

export function popCurrentHooksContext(): void {
  currentHooksContextStack.pop();
}

export function getCurrentHooksContext(): HooksContext {
  const ctx = currentHooksContextStack[currentHooksContextStack.length - 1];
  if (!ctx) {
    throw new Error("Hooks can only be called during component render.");
  }
  return ctx;
}

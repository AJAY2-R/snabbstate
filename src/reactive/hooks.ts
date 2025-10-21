import { HooksContext } from "./hooks-context";

export type IUseState<T> = [T, (value: T) => void];

/**
 * useState hook
 * Provides a stateful value and a setter function for updating that value.
 * - Persists state across renders for a component instance.
 * - Triggers a component update when the setter is called.
 * @param ctx HooksContext for the current component instance.
 * @param initial Initial state value.
 * @returns [state, setState] tuple.
 */
export function useState<T>(ctx: HooksContext, initial: T): IUseState<T> {
  const index = ctx.hookIndex;
  if (ctx.hookStates[index] === undefined) ctx.hookStates[index] = initial;
  const value = ctx.hookStates[index];
  const set = (value: T) => {
    ctx.hookStates[index] = value;
    ctx.update();
  };

  ctx.hookIndex++;
  return [value, set];
}

/**
 * useEffect hook
 * Runs a side-effect after rendering and optionally cleans up before the next effect or unmount.
 * - Accepts a callback that may return a cleanup function.
 * - Runs only when dependencies change (if provided).
 * @param ctx HooksContext for the current component instance.
 * @param callback Function to run after render; may return a cleanup function.
 * @param deps Optional array of dependencies to control when the effect runs.
 */
export function useEffect(
  ctx: HooksContext,
  callback: () => void | (() => void),
  deps?: any[]
) {
  const index = ctx.hookIndex;
  const old = ctx.hookStates[index] || { deps: undefined, cleanup: undefined };
  const hasChanged =
    !deps || !old.deps || deps.some((d, i) => d !== old.deps[i]);

  if (hasChanged) {
    old.cleanup?.();

    queueMicrotask(() => {
      const cleanup = callback();
      old.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    });

    old.deps = deps;
    ctx.hookStates[index] = old;
  }
  ctx.hookIndex++;
}

/**
 * useRef hook
 * Returns a mutable ref object whose .current property is initialized to the given value.
 * - The ref object persists for the lifetime of the component instance.
 * - Useful for storing values that do not cause re-renders when changed.
 * @param ctx HooksContext for the current component instance.
 * @param initial Initial value for the ref's .current property.
 * @returns Ref object with a .current property.
 */
export function useRef<T>(ctx: HooksContext, initial: T | null) {
  const index = ctx.hookIndex;
  if (!ctx.hookStates[index]) ctx.hookStates[index] = { current: initial };
  const ref = ctx.hookStates[index];
  ctx.hookIndex++;
  return ref;
}

/**
 * useMemo hook
 * Memoizes a computed value and only recomputes it when dependencies change.
 * - Avoids expensive calculations on every render.
 * @param ctx HooksContext for the current component instance.
 * @param factory Function that returns the value to memoize.
 * @param deps Optional array of dependencies to control when the value is recomputed.
 * @returns Memoized value.
 */
export function useMemo<T>(
  ctx: HooksContext,
  factory: () => T,
  deps?: any[]
): T {
  const index = ctx.hookIndex;
  const old = ctx.hookStates[index] || { value: undefined, deps: undefined };
  const hasChanged =
    !deps || !old.deps || deps.some((d, i) => d !== old.deps[i]);

  if (hasChanged) {
    old.value = factory();
    old.deps = deps;
    ctx.hookStates[index] = old;
  }

  ctx.hookIndex++;
  return old.value;
}

/**
 * useForceUpdate hook
 * Forces the component to re-render by calling its update method.
 * - Useful for triggering a render outside of normal state changes.
 * @param ctx HooksContext for the current component instance.
 */
export function useForceUpdate(ctx: HooksContext) {
  ctx.update();
}

/**
 * useCallback hook
 * Memoizes a callback function and only recreates it when dependencies change.
 * - Useful for passing stable function references to child components.
 * @param ctx HooksContext for the current component instance.
 * @param fn Callback function to memoize.
 * @param deps Optional array of dependencies to control when the callback is recomputed.
 * @returns Memoized callback function.
 */
export function useCallback<T extends (...args: any[]) => any>(
  ctx: HooksContext,
  fn: T,
  deps?: unknown[]
): T {
  return useMemo(ctx, () => fn, deps);
}

export function useElementRef<T extends HTMLElement | null>(
  ctx: HooksContext,
  id: string
): { current: T } {
  const ref = useRef<T>(ctx, null);
  useEffect(ctx, () => {
    ref.current = (ctx.vNode()?.elm as HTMLElement)?.querySelector(
      `#${id}`
    ) as T;
  });
  return ref;
}

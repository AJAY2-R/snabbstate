import { type HooksContext, type RenderEffect } from "./models";

export type SetStateAction<T> = T | ((prev: T) => T);
export type IUseState<T> = [T, (value: SetStateAction<T>) => void];

export function useState<T>(
  ctx: HooksContext,
  initial: T | (() => T)
): IUseState<T> {
  const index = ctx.hookIndex;

  if (ctx.hookStates[index] === undefined) {
    ctx.hookStates[index] =
      typeof initial === "function" ? (initial as () => T)() : initial;
  }

  const setState = (action: SetStateAction<T>) => {
    const prev = ctx.hookStates[index];
    const next =
      typeof action === "function" ? (action as (prev: T) => T)(prev) : action;

    if (Object.is(prev, next)) return;

    ctx.hookStates[index] = next;
    ctx.update();
  };

  const value = ctx.hookStates[index] as T;

  ctx.hookIndex++;
  return [value, setState];
}

/**
 * useEffect hook
 * Runs asynchronously after render (in microtask)
 * - Use for side effects that don't need to block painting
 * - Examples: data fetching, subscriptions, timers
 */
export function useEffect(
  ctx: HooksContext,
  callback: () => void | (() => void),
  deps?: any[]
) {
  const index = ctx.hookIndex;
  const old = ctx.hookStates[index];

  // Check if this is first run or deps changed
  const hasChanged =
    !old ||
    !old.deps ||
    !deps ||
    deps.some((d, i) => !Object.is(d, old.deps[i]));

  if (hasChanged) {
    // Store effect for execution
    const effect: RenderEffect = {
      callback,
      cleanup: old?.cleanup,
      deps: deps ? [...deps] : undefined,
      type: "effect"
    };

    ctx.hookStates[index] = effect;
    ctx.effects.push(effect);
    ctx._scheduleEffect(effect);
  } else if (old) {
    // No change, keep existing effect
    ctx.effects.push(old);
  }

  ctx.hookIndex++;
}

/**
 * useLayoutEffect hook
 * Runs synchronously after DOM mutations but before browser paint
 * - Use for DOM measurements and synchronous DOM updates
 * - Blocks painting, so use sparingly
 * - Examples: measuring elements, synchronizing scroll position
 */
export function useLayoutEffect(
  ctx: HooksContext,
  callback: () => void | (() => void),
  deps?: any[]
) {
  const index = ctx.hookIndex;
  const old = ctx.hookStates[index];

  // Check if this is first run or deps changed
  const hasChanged =
    !old ||
    !old.deps ||
    !deps ||
    deps.some((d, i) => !Object.is(d, old.deps[i]));

  if (hasChanged) {
    // Store effect for execution
    const effect: RenderEffect = {
      callback,
      cleanup: old?.cleanup,
      deps: deps ? [...deps] : undefined,
      type: "layoutEffect"
    };

    ctx.hookStates[index] = effect;
    ctx.layoutEffects.push(effect);
    ctx._scheduleLayoutEffect(effect);
  } else if (old) {
    // No change, keep existing effect
    ctx.layoutEffects.push(old);
  }

  ctx.hookIndex++;
}

/**
 * useRef hook
 * Returns a mutable ref object whose .current property persists across renders
 */
export function useRef<T>(
  ctx: HooksContext,
  initial: T | null
): { current: T | null } {
  const index = ctx.hookIndex;
  if (!ctx.hookStates[index]) {
    ctx.hookStates[index] = { current: initial };
  }
  const ref = ctx.hookStates[index];
  ctx.hookIndex++;
  return ref as { current: T | null };
}

/**
 * useMemo hook
 * Memoizes a computed value and only recomputes it when dependencies change
 */
export function useMemo<T>(
  ctx: HooksContext,
  factory: () => T,
  deps?: any[]
): T {
  const index = ctx.hookIndex;
  const old = ctx.hookStates[index] || { value: undefined, deps: undefined };
  const hasChanged =
    !deps || !old.deps || deps.some((d, i) => !Object.is(d, old.deps[i]));

  if (hasChanged) {
    old.value = factory();
    old.deps = deps;
    ctx.hookStates[index] = old;
  }

  ctx.hookIndex++;
  return old.value;
}

/**
 * useCallback hook
 * Memoizes a callback function and only recreates it when dependencies change
 */
export function useCallback<T extends (...args: any[]) => any>(
  ctx: HooksContext,
  fn: T,
  deps?: unknown[]
): T {
  return useMemo(ctx, () => fn, deps);
}

/**
 * useForceUpdate hook
 * Forces the component to re-render
 */
export function useForceUpdate(ctx: HooksContext) {
  ctx.update();
}

/**
 * useElementRef hook
 * Provides a ref to access DOM elements directly
 * - Use with Snabbdom hooks to assign the element
 */
export function useElementRef<T extends HTMLElement | null>(
  ctx: HooksContext,
  id?: string
): { current: T } {
  const ref = useRef<T>(ctx, null);

  useLayoutEffect(ctx, () => {
    const elm = ctx.vNode()?.elm as HTMLElement;
    ref.current = id ? (elm.querySelector(`#${id}`) as T) : (elm as T);
  }, [ctx.vNode(), id]);

  return ref as { current: T };
}

/**
 * useReducer hook
 * Manages state using a reducer function
 */
export function useReducer<State, Action>(
  ctx: HooksContext,
  reducer: (state: State, action: Action) => State,
  initialArg: State | (() => State),
  init?: (arg: State | (() => State)) => State
): [State, (action: Action) => void] {
  const index = ctx.hookIndex;

  if (!ctx.hookStates[index]) {
    const initialState =
      typeof init === "function"
        ? init(initialArg)
        : typeof initialArg === "function"
          ? (initialArg as () => State)()
          : initialArg;

    ctx.hookStates[index] = {
      state: initialState,
      dispatch: (action: Action) => {
        const current = ctx.hookStates[index];
        const newState = reducer(current.state, action);
        if (!Object.is(current.state, newState)) {
          current.state = newState;
          ctx.update();
        }
      }
    };
  }

  const { state, dispatch } = ctx.hookStates[index];
  ctx.hookIndex++;
  return [state, dispatch];
}

/**
 * usePrevious hook
 * Stores the previous value of a variable
 */
export function usePrevious<T>(ctx: HooksContext, value: T): T | undefined {
  const ref = useRef<T | undefined>(ctx, undefined);
  useEffect(ctx, () => {
    ref.current = value;
  }, [value]);
  return ref.current as T | undefined;
}

/**
 * useSignal hook
 * Signal-like API on top of useState
 */
export function useSignal<T>(ctx: HooksContext, initial: T) {
  const [value, setValue] = useState<T>(ctx, initial);
  return {
    get value() {
      return value;
    },
    set value(newValue: T) {
      setValue(newValue);
    }
  };
}

/**
 * useImperativeHandle hook
 * Exposes a custom instance value to parent via ref
 */
export function useImperativeHandle<T>(
  ctx: HooksContext,
  ref: ((instance: T | undefined) => void) | undefined,
  createHandle: () => T,
  deps?: any[]
) {
  const handle = useMemo(ctx, createHandle, deps);

  useLayoutEffect(ctx, () => {
    if (ref) {
      ref(handle);
    }
    return () => {
      if (ref) {
        ref(undefined);
      }
    };
  }, [ref, handle]);
}

/**
 * useId hook
 * Generates a unique ID that's stable across renders
 */
let globalIdCounter = 0;

export function useId(ctx: HooksContext): string {
  const index = ctx.hookIndex;

  if (!ctx.hookStates[index]) {
    ctx.hookStates[index] = `id-${++globalIdCounter}`;
  }

  const id = ctx.hookStates[index];
  ctx.hookIndex++;
  return id;
}

/**
 * useSyncExternalStore hook
 * Subscribes to external store updates
 */
export function useSyncExternalStore<T>(
  ctx: HooksContext,
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T
): T {
  const [state, setState] = useState(ctx, getSnapshot);

  useLayoutEffect(ctx, () => {
    // Check if snapshot changed during render
    const currentSnapshot = getSnapshot();
    if (!Object.is(currentSnapshot, state)) {
      setState(currentSnapshot);
    }

    // Subscribe to future changes
    const unsubscribe = subscribe(() => {
      setState(getSnapshot());
    });

    return unsubscribe;
  }, [subscribe, getSnapshot]);

  return state;
}

/**
 * useDeferredValue hook
 * Returns a deferred version of the value (updates with lower priority)
 * Note: This is a simplified version without true scheduling
 */
export function useDeferredValue<T>(ctx: HooksContext, value: T): T {
  const [deferredValue, setDeferredValue] = useState(ctx, value);

  useEffect(ctx, () => {
    // Defer update to next tick
    const timeoutId = setTimeout(() => {
      setDeferredValue(value);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [value]);

  return deferredValue;
}

/**
 * useTransition hook (simplified)
 * Marks updates as non-urgent (transitions)
 * Note: This is a simplified version without true concurrent mode
 */
export function useTransition(
  ctx: HooksContext
): [boolean, (callback: () => void) => void] {
  const [isPending, setIsPending] = useState(ctx, false);

  const startTransition = (callback: () => void) => {
    setIsPending(true);

    // Execute transition in next tick
    setTimeout(() => {
      callback();
      setIsPending(false);
    }, 0);
  };

  return [isPending, startTransition];
}

/**
 * useWatch
 * Like useEffect but skips the initial render and always receives both the
 * previous and current values. Ideal for responding to specific value changes
 * without the boilerplate of tracking "was this the first render?".
 *
 * @example
 * useWatch(ctx, items.length, (next, prev) => {
 *     console.log(`List grew from ${prev} to ${next}`);
 * });
 */
export function useWatch<T>(
  ctx: HooksContext,
  value: T,
  callback: (newValue: T, oldValue: T) => void | (() => void)
): void {
  const index = ctx.hookIndex;
  ctx.hookIndex++;

  type WatchState = { prevValue: T; cleanup?: () => void };

  if (!ctx.hookStates[index]) {
    // First render — record initial value, never fire the callback
    ctx.hookStates[index] = { prevValue: value } as WatchState;
    return;
  }

  const state = ctx.hookStates[index] as WatchState;
  const prevValue = state.prevValue;
  state.prevValue = value;

  if (Object.is(prevValue, value)) return;

  // Schedule as an async effect so it always runs after the DOM has updated
  const effect: RenderEffect = {
    callback: () => {
      if (state.cleanup) {
        state.cleanup();
        state.cleanup = undefined;
      }
      const result = callback(value, prevValue);
      if (typeof result === "function") state.cleanup = result;
    },
    cleanup: undefined,
    deps: undefined,
    type: "effect"
  };
  ctx.effects.push(effect);
  ctx._scheduleEffect(effect);
}

/**
 * useEvent
 * Returns a stable function reference that always delegates to the latest
 * version of the handler. Prevents stale-closure bugs in event listeners
 * without triggering re-renders when the handler changes.
 *
 * @example
 * const handleClick = useEvent(ctx, () => console.log(count));
 * // handleClick identity is stable; always logs latest `count`
 */
export function useEvent<T extends (...args: any[]) => any>(
  ctx: HooksContext,
  handler: T
): T {
  const handlerRef = useRef<T>(ctx, handler);
  // Always point to the latest handler without causing a re-render
  handlerRef.current = handler;
  // The wrapper never changes identity (empty deps)
  return useMemo(
    ctx,
    () => ((...args: Parameters<T>) => handlerRef.current!(...args)) as T,
    []
  );
}

/**
 * useDebounce
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Useful for search inputs, resize handlers, etc.
 */
export function useDebounce<T>(ctx: HooksContext, value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(ctx, value);

  useEffect(ctx, () => {
    const id = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useThrottle
 * Returns a throttled copy of `value` that updates at most once every `limit` ms.
 */
export function useThrottle<T>(ctx: HooksContext, value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState(ctx, value);
  const lastRan = useRef<number>(ctx, 0);

  useEffect(ctx, () => {
    const elapsed = Date.now() - (lastRan.current ?? 0);
    if (elapsed >= limit) {
      lastRan.current = Date.now();
      setThrottledValue(value);
    } else {
      const id = setTimeout(() => {
        lastRan.current = Date.now();
        setThrottledValue(value);
      }, limit - elapsed);
      return () => clearTimeout(id);
    }
  }, [value, limit]);

  return throttledValue;
}

/**
 * onMounted
 * Registers a one-time callback that fires after the component is inserted
 * into the DOM. The callback is registered only on the first render.
 */
export function onMounted(ctx: HooksContext, cb: () => void): void {
  const index = ctx.hookIndex;
  ctx.hookIndex++;
  if (!ctx.hookStates[index]) {
    ctx.hookStates[index] = true;
    ctx.onMounted(cb);
  }
}

// /**
//  * onUnmounted
//  * Registers a callback that fires when the component is destroyed.
//  * The callback is registered only on the first render.
//  */
// export function onUnmounted(ctx: HooksContext, cb: () => void): void {
//     const index = ctx.hookIndex;
//     ctx.hookIndex++;
//     if (!ctx.hookStates[index]) {
//         ctx.hookStates[index] = true;
//         ctx.onUnmounted(cb);
//     }
// }

/**
 * useIsMounted
 * Returns a stable function that reports whether the component is currently
 * mounted. Useful in async effects to guard against updating after unmount.
 *
 * @example
 * const isMounted = useIsMounted(ctx);
 * useEffect(ctx, () => {
 *     fetchData().then(data => { if (isMounted()) setState(data); });
 * }, []);
 */
export function useIsMounted(ctx: HooksContext): () => boolean {
  return ctx.isMounted;
}

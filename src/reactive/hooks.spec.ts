/**
 * Unit tests for every hook in hooks.ts
 *
 * All tests that require DOM side-effects (insert / destroy lifecycle hooks)
 * mount the component via the same wrapper-parent strategy used in
 * defineComponent.spec.ts so that the `insert` hook always fires.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  type ComponentFn,
  type ComponentProps,
  type HooksContext
} from "./models.js";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
  usePrevious,
  useId,
  useImperativeHandle,
  useWatch,
  useEvent,
  useDebounce,
  useThrottle,
  onMounted,
  useIsMounted
} from "./hooks.js";
import { defineComponent, jsx, patch, VNode } from "../../build/index.js";

// ── test helpers ──────────────────────────────────────────────────────────────

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));
async function flushAll(n = 4) {
  for (let i = 0; i < n; i++) await flushMicrotasks();
}

function mountComponent<T>(fn: ComponentFn<T>, props: T) {
  const factory = defineComponent(fn);
  const inst = factory(props as ComponentProps<T>);
  const host = document.createElement("div");
  document.body.appendChild(host);
  patch(host, jsx("div", {}, [inst.vnode as VNode]));
  return {
    inst,
    host,
    cleanup() {
      inst.destroy();
      host.remove();
    }
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useState
// ═══════════════════════════════════════════════════════════════════════════════

describe("useState", () => {
  it("returns the initial value", () => {
    let captured = -1;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v] = useState(ctx, 42);
      captured = v;
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(captured).toBe(42);
  });

  it("accepts a factory function for lazy initialisation", () => {
    let captured = -1;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v] = useState(ctx, () => 100);
      captured = v;
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(captured).toBe(100);
  });

  it("updates state and triggers a batched re-render", async () => {
    let count = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      count = v;
      return jsx("div", {}, [`${v}`]);
    };
    const { cleanup } = mountComponent(fn, {});
    setter(7);
    await flushAll();
    expect(count).toBe(7);
    cleanup();
  });

  it("supports the functional-update form (prev => next)", async () => {
    let count = 0;
    let setter!: (fn: (p: number) => number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState<number>(ctx, 10);
      setter = set as typeof setter;
      count = v;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter((prev) => prev + 5);
    await flushAll();
    expect(count).toBe(15);
    cleanup();
  });

  it("skips re-render when new value is Object.is-equal to current", async () => {
    let renders = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [, set] = useState(ctx, 1);
      setter = set;
      renders++;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const before = renders;
    setter(1); // same value → no re-render
    await flushAll();
    expect(renders).toBe(before);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useRef
// ═══════════════════════════════════════════════════════════════════════════════

describe("useRef", () => {
  it("persists its value across re-renders", async () => {
    let refCapture: { current: number | null } | null = null;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ctxRef = ctx;
      refCapture = useRef<number>(ctx, 0);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    refCapture!.current = 99;
    ctxRef!._syncUpdate(); // re-render without touching the ref
    expect(refCapture!.current).toBe(99); // mutation survived
    cleanup();
  });

  it("is mutable", () => {
    let refCapture: { current: number | null } | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      refCapture = useRef<number>(ctx, 0);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    refCapture!.current = 42;
    expect(refCapture!.current).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useMemo
// ═══════════════════════════════════════════════════════════════════════════════

describe("useMemo", () => {
  it("returns the computed value", () => {
    let result = 0;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      result = useMemo(ctx, () => 6 * 7, []);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(result).toBe(42);
  });

  it("recomputes when deps change", async () => {
    let result = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [f, setF] = useState(ctx, 2);
      setter = setF;
      result = useMemo(ctx, () => f * 10, [f]);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(3);
    await flushAll();
    expect(result).toBe(30);
    cleanup();
  });

  it("does NOT recompute when deps are unchanged (empty [])", async () => {
    let factoryCallCount = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [, set] = useState(ctx, 0);
      setter = set;
      useMemo(ctx, () => {
        factoryCallCount++;
        return 1;
      }, []);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(1);
    await flushAll(); // re-render
    setter(2);
    await flushAll(); // re-render again
    expect(factoryCallCount).toBe(1); // computed only once
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useCallback
// ═══════════════════════════════════════════════════════════════════════════════

describe("useCallback", () => {
  it("returns the same function reference when deps are unchanged", async () => {
    const refs: ((...args: unknown[]) => unknown)[] = [];
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ctxRef = ctx;
      refs.push(useCallback(ctx, () => {}, []));
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    ctxRef!._syncUpdate(); // second render
    expect(refs[0]).toBe(refs[1]);
    cleanup();
  });

  it("recreates the function when deps change", async () => {
    const refs: ((...args: unknown[]) => unknown)[] = [];
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      refs.push(useCallback(ctx, () => v, [v]));
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(1);
    await flushAll();
    expect(refs[0]).not.toBe(refs[1]);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useEffect
// ═══════════════════════════════════════════════════════════════════════════════

describe("useEffect", () => {
  it("runs after mount (scheduled as microtask, not synchronous)", async () => {
    const spy = vi.fn();
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useEffect(ctx, spy, []);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    // Not yet called — it's queued in a microtask
    expect(spy).not.toHaveBeenCalled();
    await flushAll();
    expect(spy).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("runs exactly once for empty deps, regardless of re-renders", async () => {
    const spy = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [, set] = useState(ctx, 0);
      setter = set;
      useEffect(ctx, spy, []);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    setter(1);
    await flushAll();
    setter(2);
    await flushAll();
    expect(spy).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("re-runs when a dep changes between renders", async () => {
    const spy = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useEffect(ctx, spy, [v]);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    setter(1);
    await flushAll();
    expect(spy).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("calls the cleanup function before re-running the effect", async () => {
    const effectCleanup = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useEffect(ctx, () => effectCleanup, [v]);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    setter(1);
    await flushAll();
    expect(effectCleanup).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls the cleanup function when the component is destroyed", async () => {
    const effectCleanup = vi.fn();
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useEffect(ctx, () => effectCleanup, []);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    await flushAll();
    inst.destroy();
    expect(effectCleanup).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not run effects after the component is destroyed", async () => {
    const spy = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useEffect(ctx, spy, [v]);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    // Destroy before the pending mount-effect microtask fires.
    // The implementation guards flushEffects with `if (!mounted) return`,
    // so the initial effect must NOT run at all.
    inst.destroy();
    setter(1);
    await flushAll();
    // Neither the initial mount effect nor the post-destroy re-render
    // effect should have ran.
    expect(spy).not.toHaveBeenCalled();
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useLayoutEffect
// ═══════════════════════════════════════════════════════════════════════════════

describe("useLayoutEffect", () => {
  it("runs synchronously during mount (before async useEffect)", async () => {
    const order: string[] = [];
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useLayoutEffect(ctx, () => {
        order.push("layout");
      }, []);
      useEffect(ctx, () => {
        order.push("effect");
      }, []);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    // layout runs synchronously inside insert → already in order
    expect(order).toContain("layout");
    expect(order).not.toContain("effect"); // async, not yet
    await flushAll();
    expect(order).toEqual(["layout", "effect"]);
    cleanup();
  });

  it("calls cleanup before re-running on deps change", async () => {
    const layoutCleanup = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useLayoutEffect(ctx, () => layoutCleanup, [v]);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(1);
    await flushAll();
    expect(layoutCleanup).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useReducer
// ═══════════════════════════════════════════════════════════════════════════════

describe("useReducer", () => {
  type CountAction =
    | { type: "inc" }
    | { type: "dec" }
    | { type: "set"; value: number };
  const countReducer = (s: number, a: CountAction): number => {
    if (a.type === "inc") return s + 1;
    if (a.type === "dec") return s - 1;
    if (a.type === "set") return a.value;
    return s;
  };

  it("initialises with the provided state", () => {
    let state = -1;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      [state] = useReducer(ctx, countReducer, 10);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(state).toBe(10);
  });

  it("dispatches actions and re-renders", async () => {
    let state = 0;
    let dispatch!: (a: CountAction) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [s, d] = useReducer(ctx, countReducer, 0);
      state = s;
      dispatch = d;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    dispatch({ type: "inc" });
    await flushAll();
    expect(state).toBe(1);
    dispatch({ type: "set", value: 99 });
    await flushAll();
    expect(state).toBe(99);
    cleanup();
  });

  it("skips re-render when the reduced state is unchanged", async () => {
    let renders = 0;
    let dispatch!: (a: CountAction) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      renders++;
      const [, d] = useReducer(ctx, countReducer, 5);
      dispatch = d;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const before = renders;
    dispatch({ type: "set", value: 5 }); // same value
    await flushAll();
    expect(renders).toBe(before);
    cleanup();
  });

  it("supports a lazy initialiser function", () => {
    let state = -1;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      [state] = useReducer(ctx, countReducer, () => 42);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(state).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   usePrevious
// ═══════════════════════════════════════════════════════════════════════════════

describe("usePrevious", () => {
  it("returns undefined on first render", () => {
    let prev: number | undefined = 123;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      prev = usePrevious(ctx, 1);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(prev).toBeUndefined();
  });

  it("returns the value from the previous render after re-render", async () => {
    let prev: number | undefined;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 1);
      setter = set;
      prev = usePrevious(ctx, v);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll(); // settle initial effects
    setter(2);
    await flushAll();
    expect(prev).toBe(1);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useId
// ═══════════════════════════════════════════════════════════════════════════════

describe("useId", () => {
  it("returns a non-empty string", () => {
    let id = "";
    const fn: ComponentFn<{}> = (_p, ctx) => {
      id = useId(ctx);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(id).toBeTruthy();
  });

  it("is stable across re-renders", () => {
    const ids: string[] = [];
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ctxRef = ctx;
      ids.push(useId(ctx));
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    ctxRef!._syncUpdate();
    expect(ids[0]).toBe(ids[1]);
    cleanup();
  });

  it("is unique across different component instances", () => {
    const ids: string[] = [];
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ids.push(useId(ctx));
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    mountComponent(fn, {}).cleanup();
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useImperativeHandle
// ═══════════════════════════════════════════════════════════════════════════════

describe("useImperativeHandle", () => {
  it("calls the ref callback with the created handle object", async () => {
    const ref = vi.fn();
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useImperativeHandle(ctx, ref, () => ({ doThing: () => 42 }), []);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    expect(ref).toHaveBeenCalledWith(
      expect.objectContaining({ doThing: expect.any(Function) })
    );
    cleanup();
  });

  it("calls ref with undefined on cleanup (when component is destroyed)", async () => {
    const ref = vi.fn();
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useImperativeHandle(ctx, ref, () => ({ x: 1 }), []);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    await flushAll();
    inst.destroy();
    expect(ref).toHaveBeenCalledWith(undefined);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useWatch
// ═══════════════════════════════════════════════════════════════════════════════

describe("useWatch", () => {
  it("does NOT fire on the initial render", async () => {
    const spy = vi.fn();
    const fn: ComponentFn<{}> = (_p, ctx) => {
      useWatch(ctx, 0, spy);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    expect(spy).not.toHaveBeenCalled();
    cleanup();
  });

  it("fires with (newValue, oldValue) when value changes", async () => {
    const spy = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 1);
      setter = set;
      useWatch(ctx, v, spy);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(2);
    await flushAll();
    expect(spy).toHaveBeenCalledExactlyOnceWith(2, 1);
    cleanup();
  });

  it("fires again for each subsequent change", async () => {
    const spy = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useWatch(ctx, v, spy);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(1);
    await flushAll();
    setter(2);
    await flushAll();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 1, 0);
    expect(spy).toHaveBeenNthCalledWith(2, 2, 1);
    cleanup();
  });

  it("does NOT fire when value is unchanged (Object.is)", async () => {
    const spy = vi.fn();
    let setter!: (v: string) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, "hello");
      setter = set;
      useWatch(ctx, v, spy);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter("hello"); // same value — useState already skips the re-render
    await flushAll();
    expect(spy).not.toHaveBeenCalled();
    cleanup();
  });

  it("runs cleanup returned from the callback before the next invocation", async () => {
    const watchCleanup = vi.fn();
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      useWatch(ctx, v, () => watchCleanup);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(1);
    await flushAll();
    setter(2);
    await flushAll();
    // cleanup from the first watch callback ran before the second invocation
    expect(watchCleanup).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useEvent
// ═══════════════════════════════════════════════════════════════════════════════

describe("useEvent", () => {
  it("returns a stable function reference across re-renders", () => {
    const refs: ((...args: unknown[]) => unknown)[] = [];
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ctxRef = ctx;
      refs.push(useEvent(ctx, () => {}));
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    ctxRef!._syncUpdate(); // force second render
    expect(refs[0]).toBe(refs[1]);
    cleanup();
  });

  it("always delegates to the latest handler (no stale closure)", async () => {
    let stableHandler: (() => number) | null = null;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      stableHandler = useEvent(ctx, () => v);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter(99);
    await flushAll();
    // stableHandler identity is the same reference as captured on first render,
    // but it returns the latest value
    expect(stableHandler!()).toBe(99);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useDebounce
// ═══════════════════════════════════════════════════════════════════════════════

describe("useDebounce", () => {
  it("returns the initial value synchronously", () => {
    let out = "";
    const fn: ComponentFn<{}> = (_p, ctx) => {
      out = useDebounce(ctx, "hello", 200);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(out).toBe("hello");
  });

  it("delays value propagation by the specified ms", async () => {
    vi.useFakeTimers();
    let output = "";
    let setter!: (v: string) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, "initial");
      setter = set;
      output = useDebounce(ctx, v, 300);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter("changed");
    await flushAll();
    expect(output).toBe("initial"); // not yet
    await vi.runAllTimersAsync();
    await flushAll();
    expect(output).toBe("changed");
    vi.useRealTimers();
    cleanup();
  });

  it("resets the timer when value changes rapidly", async () => {
    vi.useFakeTimers();
    let output = "";
    let setter!: (v: string) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, "a");
      setter = set;
      output = useDebounce(ctx, v, 200);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    setter("b");
    await flushAll();
    setter("c");
    await flushAll();
    setter("d");
    await flushAll();
    await vi.runAllTimersAsync();
    await flushAll();
    expect(output).toBe("d"); // only last value
    vi.useRealTimers();
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useThrottle
// ═══════════════════════════════════════════════════════════════════════════════

describe("useThrottle", () => {
  it("returns the initial value synchronously", () => {
    let out = 0;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      out = useThrottle(ctx, 42, 100);
      return jsx("div", {});
    };
    mountComponent(fn, {}).cleanup();
    expect(out).toBe(42);
  });

  it("updates value immediately when limit has elapsed", async () => {
    vi.useFakeTimers();
    let output = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 1);
      setter = set;
      output = useThrottle(ctx, v, 100);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    // Advance time past the limit so the next update counts as "elapsed"
    await vi.advanceTimersByTimeAsync(200);
    setter(2);
    await flushAll();
    await vi.runAllTimersAsync();
    await flushAll();
    expect(output).toBe(2);
    vi.useRealTimers();
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   onMounted / onUnmounted convenience hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe("onMounted / onUnmounted hooks", () => {
  it("onMounted fires once after DOM insertion", async () => {
    const spy = vi.fn();
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      ctxRef = ctx;
      onMounted(ctx, spy);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    await flushAll();
    // Force two more re-renders — callback should NOT re-register
    ctxRef!._syncUpdate();
    ctxRef!._syncUpdate();
    await flushAll();
    expect(spy).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   useIsMounted
// ═══════════════════════════════════════════════════════════════════════════════

describe("useIsMounted", () => {
  it("returns false before mount, true after, false after destroy", () => {
    let isMountedFn: (() => boolean) | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      isMountedFn = useIsMounted(ctx);
      return jsx("div", {});
    };

    const factory = defineComponent(fn);
    const inst = factory({} as ComponentProps<{}>);
    expect(isMountedFn!()).toBe(false); // not yet in DOM

    const host = document.createElement("div");
    document.body.appendChild(host);
    patch(host, jsx("div", {}, [inst.vnode as VNode]));
    expect(isMountedFn!()).toBe(true); // now in DOM

    inst.destroy();
    expect(isMountedFn!()).toBe(false); // destroyed
    host.remove();
  });

  it("guards async work after unmount", async () => {
    let capturedFn: (() => boolean) | null = null;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      // Capture the stable isMounted reference — this simulates how you'd
      // use it inside an async effect: fetch().then(() => { if (isMounted()) setState(...) })
      capturedFn = useIsMounted(ctx);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    await flushAll();

    expect(capturedFn!()).toBe(true); // component is alive

    inst.destroy(); // simulate parent removing the component

    // The captured function — like a closure inside a fetch callback — can
    // now safely check whether an update is still safe to apply.
    expect(capturedFn!()).toBe(false); // correctly reports dead
    cleanup();
  });
});

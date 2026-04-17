/**
 * Unit tests for defineComponent / render
 *
 * Mount strategy
 * ──────────────
 * Snabbdom calls a vnode's `insert` hook only when it creates a *new* DOM
 * element (as opposed to updating an existing one).  To guarantee that, we
 * wrap the component vnode inside a fresh parent vnode and patch that parent
 * into an empty host element whose tag differs from the component's root
 * selector.  The component vnode is therefore always a *new child* →
 * Snabbdom creates its element → `insert` hook fires → `mounted = true`. ✓
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  type ComponentFn,
  type ComponentProps,
  type HooksContext
} from "./models.js";
import { useState, useEffect } from "./hooks.js";
import { getCurrentHooksContext } from "./hooks-context.js";
import { jsx } from "../jsx.js";
import { defineComponent, patch, component } from "./define-component.js";
import { VNode } from "../vnode.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Flush all pending microtask queues (layered to ensure multi-tick settling) */
const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));
async function flushAll(rounds = 4) {
  for (let i = 0; i < rounds; i++) await flushMicrotasks();
}

/**
 * Mounts `fn(props)` into a real jsdom element.
 * Uses a wrapper div so that the component vnode is always a *new* child →
 * guarantees the `insert` hook fires synchronously inside `patch()`.
 */
function mountComponent<T>(fn: ComponentFn<T>, props: T) {
  const factory = defineComponent(fn);
  const inst = factory(props as ComponentProps<T>);

  const host = document.createElement("div");
  document.body.appendChild(host);
  // Wrapping makes inst.vnode a new child → insert hook fires
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

// ── cleanup after every test ──────────────────────────────────────────────────
afterEach(() => {
  document.body.innerHTML = "";
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 1 – Initial render
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › initial render", () => {
  it("returns a vnode with the expected selector", () => {
    const fn: ComponentFn<{}> = () => jsx("article", {});
    const inst = defineComponent(fn)({} as ComponentProps<{}>);
    expect(inst.vnode.sel).toBe("article");
  });

  it("stamps _componentProps onto vnode.data", () => {
    const fn: ComponentFn<{ x: number }> = ({ x }) => jsx("div", {}, [`${x}`]);
    const inst = defineComponent(fn)({ x: 99 } as ComponentProps<{
      x: number;
    }>);
    expect(
      (inst.vnode.data as Record<string, unknown>)._componentProps
    ).toMatchObject({ x: 99 });
  });

  it("stamps _componentUpdateProps (function) onto vnode.data", () => {
    const fn: ComponentFn<{}> = () => jsx("div", {});
    const inst = defineComponent(fn)({} as ComponentProps<{}>);
    expect(
      typeof (inst.vnode.data as Record<string, unknown>)._componentUpdateProps
    ).toBe("function");
  });

  it("handles null props without throwing", () => {
    const fn: ComponentFn<{}> = () => jsx("div", {});
    expect(() =>
      defineComponent(fn)(null as unknown as ComponentProps<{}>)
    ).not.toThrow();
  });

  it("catches initial render errors and logs them (does not throw)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => { });
    const fn: ComponentFn<{}> = () => {
      throw new Error("kaboom");
    };
    expect(() =>
      defineComponent(fn, [], "CrashTest")({} as ComponentProps<{}>)
    ).not.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("CrashTest"),
      expect.any(Error)
    );
    spy.mockRestore();
  });

  it("includes displayName in error messages", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => { });
    const fn: ComponentFn<{}> = () => {
      throw new Error("x");
    };
    defineComponent(fn, [], "MyWidget")({} as ComponentProps<{}>);
    expect((spy.mock.calls[0] as string[])[0]).toContain("MyWidget");
    spy.mockRestore();
  });

  it("isMounted() is false before DOM insertion", () => {
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      return jsx("div", {});
    };
    defineComponent(fn)({} as ComponentProps<{}>);
    expect(ctxRef!.isMounted()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 2 – Mounting
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › mounting", () => {
  it("isMounted() becomes true after DOM insertion", () => {
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    expect(ctxRef!.isMounted()).toBe(true);
    cleanup();
  });

  it("onMounted callbacks are queued (not fired synchronously)", async () => {
    const cb = vi.fn();
    const fn: ComponentFn<{}> = (_p) => {
      getCurrentHooksContext().onMounted(cb);
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    // Still inside the same synchronous call stack – microtask hasn't run yet
    expect(cb).not.toHaveBeenCalled();
    await flushAll();
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("onMounted fires exactly once even after multiple re-renders", async () => {
    const cb = vi.fn();
    const fn: ComponentFn<{}> = (_p) => {
      getCurrentHooksContext().onMounted(cb);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    await flushAll();
    inst.update(); // sync re-render
    inst.update();
    await flushAll();
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 3 – Synchronous update (_syncUpdate / inst.update)
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › _syncUpdate", () => {
  it("re-renders immediately without waiting for a microtask", () => {
    let renderCount = 0;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      renderCount++;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const before = renderCount;
    ctxRef!._syncUpdate();
    // Incremented synchronously — no await needed
    expect(renderCount).toBe(before + 1);
    cleanup();
  });

  it("catches re-render errors without throwing", () => {
    let crash = false;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      if (crash) throw new Error("re-render boom");
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const spy = vi.spyOn(console, "error").mockImplementation(() => { });
    crash = true;
    expect(() => ctxRef!._syncUpdate()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 4 – Batched update (ctx.update)
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › batched updates", () => {
  it("coalesces multiple ctx.update() calls into one re-render per tick", async () => {
    let renderCount = 0;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      renderCount++;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const before = renderCount;

    // Schedule 5 updates in the same tick
    ctxRef!.update();
    ctxRef!.update();
    ctxRef!.update();
    ctxRef!.update();
    ctxRef!.update();
    await flushAll();

    expect(renderCount).toBe(before + 1); // exactly one extra render
    cleanup();
  });

  it("batches updates across multiple components in the same tick", async () => {
    let renderCountA = 0;
    let ctxA: HooksContext | null = null;
    const fnA: ComponentFn<{}> = (_p) => {
      ctxA = getCurrentHooksContext();
      renderCountA++;
      return jsx("div", {}, ["A"]);
    };

    let renderCountB = 0;
    let ctxB: HooksContext | null = null;
    const fnB: ComponentFn<{}> = (_p) => {
      ctxB = getCurrentHooksContext();
      renderCountB++;
      return jsx("div", {}, ["B"]);
    };

    const compA = mountComponent(fnA, {});
    const compB = mountComponent(fnB, {});
    const baselineA = renderCountA;
    const baselineB = renderCountB;

    ctxA!.update();
    ctxA!.update();
    ctxA!.update();
    ctxB!.update();
    ctxB!.update();
    ctxB!.update();

    await flushAll();

    expect(renderCountA).toBe(baselineA + 1);
    expect(renderCountB).toBe(baselineB + 1);

    compA.cleanup();
    compB.cleanup();
  });

  it("does not re-render after destroy()", async () => {
    let renderCount = 0;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      renderCount++;
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    inst.destroy();
    const before = renderCount;
    ctxRef!.update();
    await flushAll();
    expect(renderCount).toBe(before);
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 5 – Props propagation via _componentUpdateProps
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › props propagation", () => {
  it("re-renders with new props when values change", async () => {
    let lastLabel = "";
    const fn: ComponentFn<{ label: string }> = ({ label }) => {
      lastLabel = label;
      return jsx("div", {}, [label]);
    };
    const inst = defineComponent(fn)({ label: "a" } as ComponentProps<{
      label: string;
    }>);
    const host = document.createElement("div");
    document.body.appendChild(host);
    patch(host, jsx("div", {}, [inst.vnode as VNode]));
    await flushAll();

    const updater = (inst.vnode.data as Record<string, unknown>)
      ._componentUpdateProps as (p: unknown) => void;
    const current = (inst.vnode.data as Record<string, unknown>)
      ._componentProps as Record<string, unknown>;
    updater({ ...current, label: "b" });
    await flushAll();

    expect(lastLabel).toBe("b");
    host.remove();
  });

  it("skips re-render when props are shallowly equal (same reference)", async () => {
    let renderCount = 0;
    const fn: ComponentFn<{ x: number }> = ({ x }) => {
      renderCount++;
      return jsx("div", {}, [`${x}`]);
    };
    const inst = defineComponent(fn)({ x: 1 } as ComponentProps<{ x: number }>);
    const host = document.createElement("div");
    document.body.appendChild(host);
    patch(host, jsx("div", {}, [inst.vnode as VNode]));
    await flushAll();

    const before = renderCount;
    const updater = (inst.vnode.data as Record<string, unknown>)
      ._componentUpdateProps as (p: unknown) => void;
    // Pass the exact same props object — shallowEqual short-circuits on reference
    const sameProps = (inst.vnode.data as Record<string, unknown>)
      ._componentProps;
    updater(sameProps);
    await flushAll();

    expect(renderCount).toBe(before);
    host.remove();
  });

  it("propagates updater through vnode.data after internal re-render", async () => {
    let lastVal = 0;
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{ n: number }> = ({ n }) => {
      ctxRef = getCurrentHooksContext();
      lastVal = n;
      return jsx("div", {}, [`${n}`]);
    };
    const inst = defineComponent(fn)({ n: 1 } as ComponentProps<{ n: number }>);
    const host = document.createElement("div");
    document.body.appendChild(host);
    patch(host, jsx("div", {}, [inst.vnode as VNode]));
    await flushAll();

    // Trigger an internal re-render first (via _syncUpdate)
    ctxRef!._syncUpdate();
    await flushAll();

    // Now push new props — updater should still work
    const updater = (inst.vnode.data as Record<string, unknown>)
      ._componentUpdateProps as (p: unknown) => void;
    const current = (inst.vnode.data as Record<string, unknown>)
      ._componentProps as Record<string, unknown>;
    updater({ ...current, n: 99 });
    await flushAll();

    expect(lastVal).toBe(99);
    host.remove();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 6 – Destruction & cleanup
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › destroy", () => {
  it("sets isMounted() to false", () => {
    let ctxRef: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p) => {
      ctxRef = getCurrentHooksContext();
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    inst.destroy();
    expect(ctxRef!.isMounted()).toBe(false);
    cleanup();
  });

  it("fires onUnmounted callbacks on destroy()", async () => {
    const cb = vi.fn();
    const fn: ComponentFn<{}> = (_p) => {
      getCurrentHooksContext().onUnmounted(cb);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    inst.destroy();
    await flushAll();
    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("runs effect cleanups when destroying", async () => {
    const effectCleanup = vi.fn();
    const fn: ComponentFn<{}> = (_p) => {
      useEffect(() => effectCleanup, []);
      return jsx("div", {});
    };
    const { inst, cleanup } = mountComponent(fn, {});
    await flushAll(); // let effect run
    inst.destroy();
    expect(effectCleanup).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("allows multiple destroy() calls without errors", () => {
    const fn: ComponentFn<{}> = () => jsx("div", {});
    const { inst, cleanup } = mountComponent(fn, {});
    expect(() => {
      inst.destroy();
      inst.destroy();
    }).not.toThrow();
    cleanup();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 7 – component() shorthand
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › component() shorthand", () => {
  it("returns a VNode directly without an explicit instance", () => {
    const MyComp = component<{ text: string }>(({ text }) => jsx("p", {}, [text]));
    const vnode = MyComp({ text: "hello" });
    expect(vnode.sel).toBe("p");
  });

  it("vnode carries _componentProps and _componentUpdateProps", () => {
    const MyComp = component<{ n: number }>(({ n }) => jsx("span", {}, [`${n}`]));
    const vnode = MyComp({ n: 7 });
    const data = vnode.data as Record<string, unknown>;
    expect(data._componentProps).toMatchObject({ n: 7 });
    expect(typeof data._componentUpdateProps).toBe("function");
  });

  it("children passed to component() are available via props.children", () => {
    let capturedChildren: VNode[] | undefined;
    const MyComp = component<{}>((props) => {
      capturedChildren = props.children;
      return jsx("div", {});
    });
    const child = jsx("span", {}, ["child"]);
    MyComp({}, child);
    expect(capturedChildren).toContainEqual(child);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   SECTION 8 – setState integration (smoke-test with useState)
// ═══════════════════════════════════════════════════════════════════════════════

describe("defineComponent › useState integration", () => {
  it("state change triggers a re-render and reflects new value", async () => {
    let displayed = 0;
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p) => {
      const [v, set] = useState(0);
      setter = set;
      displayed = v;
      return jsx("div", {}, [`${v}`]);
    };
    const { cleanup } = mountComponent(fn, {});
    setter(42);
    await flushAll();
    expect(displayed).toBe(42);
    cleanup();
  });

  it("multiple setState calls batch into one re-render", async () => {
    let renderCount = 0;
    let setA!: (v: number) => void;
    let setB!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p) => {
      renderCount++;
      const [, sA] = useState(0);
      const [, sB] = useState(0);
      setA = sA;
      setB = sB;
      return jsx("div", {});
    };
    const { cleanup } = mountComponent(fn, {});
    const before = renderCount;
    setA(1);
    setB(2);
    await flushAll();
    expect(renderCount).toBe(before + 1);
    cleanup();
  });
});

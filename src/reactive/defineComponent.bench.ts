/**
 * Performance benchmarks for defineComponent and hooks.
 *
 * Run with:  npm run bench
 *
 * Each `bench()` block is executed many times by Vitest's harness which reports
 * mean / median / p75 / p99 / p999 nanosecond timings.  Results are printed to
 * the console — no assertions are made (timing thresholds are machine-dependent
 * and would produce flaky CI failures).
 *
 * Benchmark categories:
 *   1. Factory & instance creation (no DOM)
 *   2. Full mount + destroy cycle
 *   3. Synchronous re-render (_syncUpdate)
 *   4. Batched re-render (ctx.update / microtask)
 *   5. Bulk instantiation (100 / 500 components)
 *   6. Props shallow-equality fast-path
 *   7. Hook-heavy components (20 hooks per render)
 *   8. useState rapid state updates
 */

import { describe, bench, beforeAll, afterAll } from "vitest";
import {
  type ComponentFn,
  type ComponentProps,
  type HooksContext
} from "./models.js";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useReducer
} from "./hooks.js";
import { jsx } from "../../build/jsx.js";
import { defineComponent, patch, render, VNode } from "../../build/index.js";

// ── shared helpers ────────────────────────────────────────────────────────────

/** Mount a component and return the instance + host element. */
function mount<T>(fn: ComponentFn<T>, props: T) {
  const factory = defineComponent(fn);
  const inst = factory(props as ComponentProps<T>);
  const host = document.createElement("div");
  document.body.appendChild(host);
  patch(host, jsx("div", {}, [inst.vnode as VNode]));
  return { inst, host };
}

function unmount(m: ReturnType<typeof mount>) {
  m.inst.destroy();
  m.host.remove();
}

const waitMicrotask = () => new Promise<void>((r) => queueMicrotask(r));

let sharedHost: HTMLDivElement;
beforeAll(() => {
  sharedHost = document.createElement("div");
  document.body.appendChild(sharedHost);
});
afterAll(() => {
  sharedHost.remove();
});

// ═══════════════════════════════════════════════════════════════════════════════
//   1 – Factory & instance creation (pure JS, no DOM)
// ═══════════════════════════════════════════════════════════════════════════════

describe("factory & instance creation", () => {
  const simpleFn: ComponentFn<{ n: number }> = ({ n }) =>
    jsx("div", {}, [`${n}`]);

  bench("defineComponent() — create factory only", () => {
    defineComponent(simpleFn);
  });

  bench("factory() — create instance (no DOM)", () => {
    const factory = defineComponent(simpleFn);
    factory({ n: 1 } as ComponentProps<{ n: number }>);
  });

  bench("render() shorthand (factory + instance in one call)", () => {
    const comp = render<{ n: number }>(({ n }) => jsx("span", {}, [`${n}`]));
    comp({ n: 42 });
  });

  bench("create instance with displayName", () => {
    const factory = defineComponent(simpleFn, "BenchComponent");
    factory({ n: 1 } as ComponentProps<{ n: number }>);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   2 – Full mount + destroy cycle
// ═══════════════════════════════════════════════════════════════════════════════

describe("mount + destroy cycle", () => {
  bench("simple component (no hooks)", () => {
    const fn: ComponentFn<{}> = () => jsx("div", {}, ["hello"]);
    const m = mount(fn, {});
    unmount(m);
  });

  bench("component with 5 hooks", () => {
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v] = useState(ctx, 0);
      const r = useRef(ctx, null);
      const memo = useMemo(ctx, () => v * 2, [v]);
      useEffect(ctx, () => {}, []);
      useCallback(ctx, () => memo, [memo]);
      void r;
      return jsx("div", {}, [`${v}`]);
    };
    const m = mount(fn, {});
    unmount(m);
  });

  bench("component with useReducer", () => {
    type A = { type: "inc" };
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [s] = useReducer(ctx, (state: number, _a: A) => state + 1, 0);
      return jsx("div", {}, [`${s}`]);
    };
    const m = mount(fn, {});
    unmount(m);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   3 – Synchronous re-renders (_syncUpdate)
// ═══════════════════════════════════════════════════════════════════════════════

describe("synchronous re-render (_syncUpdate)", () => {
  bench("single _syncUpdate on simple component", () => {
    let ctx: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, c) => {
      ctx = c;
      return jsx("div", {});
    };
    const m = mount(fn, {});
    ctx!._syncUpdate();
    unmount(m);
  });

  bench("10× _syncUpdate on simple component", () => {
    let ctx: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, c) => {
      ctx = c;
      return jsx("div", {});
    };
    const m = mount(fn, {});
    for (let i = 0; i < 10; i++) ctx!._syncUpdate();
    unmount(m);
  });

  bench("_syncUpdate on hook-heavy component (useMemo × 5)", () => {
    let ctx: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, c) => {
      ctx = c;
      useMemo(c, () => 1, []);
      useMemo(c, () => 2, []);
      useMemo(c, () => 3, []);
      useMemo(c, () => 4, []);
      useMemo(c, () => 5, []);
      return jsx("div", {});
    };
    const m = mount(fn, {});
    ctx!._syncUpdate();
    unmount(m);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   4 – Batched update (microtask coalescing)
// ═══════════════════════════════════════════════════════════════════════════════

describe("batched re-render (ctx.update microtask)", () => {
  bench("5 ctx.update() calls → 1 actual render (awaited)", async () => {
    let ctx: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, c) => {
      ctx = c;
      return jsx("div", {});
    };
    const m = mount(fn, {});
    for (let i = 0; i < 5; i++) ctx!.update();
    await waitMicrotask();
    await waitMicrotask();
    unmount(m);
  });

  bench(
    "10 setState calls → 1 render (batching via scheduleUpdate)",
    async () => {
      let setter!: (v: number) => void;
      const fn: ComponentFn<{}> = (_p, ctx) => {
        const [, set] = useState(ctx, 0);
        setter = set;
        return jsx("div", {});
      };
      const m = mount(fn, {});
      for (let i = 0; i < 10; i++) setter(i);
      await waitMicrotask();
      await waitMicrotask();
      unmount(m);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
//   5 – Bulk instantiation
// ═══════════════════════════════════════════════════════════════════════════════

describe("bulk instantiation", () => {
  bench("instantiate 100 simple components (no mount)", () => {
    const factory = defineComponent<{}>((_p) => jsx("span", {}, ["item"]));
    for (let i = 0; i < 100; i++) {
      factory({} as ComponentProps<{}>);
    }
  });

  bench("instantiate 500 simple components (no mount)", () => {
    const factory = defineComponent<{}>((_p) => jsx("span", {}, ["item"]));
    for (let i = 0; i < 500; i++) {
      factory({} as ComponentProps<{}>);
    }
  });

  bench("mount + destroy 50 components", () => {
    const fn: ComponentFn<{ i: number }> = ({ i }) => jsx("li", {}, [`${i}`]);
    const mounted: ReturnType<typeof mount>[] = [];
    for (let i = 0; i < 50; i++) mounted.push(mount(fn, { i }));
    for (const m of mounted) unmount(m);
  });

  bench("mount + destroy 100 components", () => {
    const fn: ComponentFn<{ i: number }> = ({ i }) => jsx("li", {}, [`${i}`]);
    const mounted: ReturnType<typeof mount>[] = [];
    for (let i = 0; i < 100; i++) mounted.push(mount(fn, { i }));
    for (const m of mounted) unmount(m);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   6 – Props shallow-equality fast-path
// ═══════════════════════════════════════════════════════════════════════════════

describe("props shallow-equality fast-path", () => {
  bench("10 calls with identical props → 0 re-renders (awaited)", async () => {
    const fn: ComponentFn<{ x: number; y: string }> = ({ x, y }) =>
      jsx("div", {}, [`${x}${y}`]);
    const factory = defineComponent(fn);
    const inst = factory({ x: 1, y: "a" } as ComponentProps<{
      x: number;
      y: string;
    }>);
    const host = document.createElement("div");
    document.body.appendChild(host);
    patch(host, jsx("div", {}, [inst.vnode as VNode]));

    const updater = (inst.vnode.data as Record<string, unknown>)
      ._componentUpdateProps as (p: unknown) => void;
    const same = (inst.vnode.data as Record<string, unknown>)._componentProps;
    for (let i = 0; i < 10; i++) updater(same); // same reference → shallowEqual true
    await waitMicrotask();

    inst.destroy();
    host.remove();
  });

  bench(
    "10 calls with new-but-equal objects → 0 re-renders (awaited)",
    async () => {
      const fn: ComponentFn<{ x: number; y: string }> = ({ x, y }) =>
        jsx("div", {}, [`${x}${y}`]);
      const factory = defineComponent(fn);
      const inst = factory({ x: 1, y: "a" } as ComponentProps<{
        x: number;
        y: string;
      }>);
      const host = document.createElement("div");
      document.body.appendChild(host);
      patch(host, jsx("div", {}, [inst.vnode as VNode]));

      const updater = (inst.vnode.data as Record<string, unknown>)
        ._componentUpdateProps as (p: unknown) => void;
      const current = (inst.vnode.data as Record<string, unknown>)
        ._componentProps as Record<string, unknown>;
      // New objects with identical values — shallowEqual does key-level comparison
      for (let i = 0; i < 10; i++) updater({ ...current });
      await waitMicrotask();

      inst.destroy();
      host.remove();
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
//   7 – Hook-heavy rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("hook-heavy component renders", () => {
  bench("initial render with 20 useState hooks", () => {
    const fn: ComponentFn<{}> = (_p, ctx) => {
      for (let i = 0; i < 20; i++) useState(ctx, i);
      return jsx("div", {});
    };
    defineComponent(fn)({} as ComponentProps<{}>);
  });

  bench("initial render with 20 useMemo hooks", () => {
    const fn: ComponentFn<{}> = (_p, ctx) => {
      for (let i = 0; i < 20; i++) useMemo(ctx, () => i * i, [i]);
      return jsx("div", {});
    };
    defineComponent(fn)({} as ComponentProps<{}>);
  });

  bench("initial render with 20 useRef hooks", () => {
    const fn: ComponentFn<{}> = (_p, ctx) => {
      for (let i = 0; i < 20; i++) useRef(ctx, i);
      return jsx("div", {});
    };
    defineComponent(fn)({} as ComponentProps<{}>);
  });

  bench("_syncUpdate with 20 useMemo hooks (all deps unchanged)", () => {
    let ctx: HooksContext | null = null;
    const fn: ComponentFn<{}> = (_p, c) => {
      ctx = c;
      for (let i = 0; i < 20; i++) useMemo(c, () => i * i, []);
      return jsx("div", {});
    };
    const m = mount(fn, {});
    for (let i = 0; i < 5; i++) ctx!._syncUpdate(); // memos should all hit cache
    unmount(m);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   8 – useState rapid update cycles
// ═══════════════════════════════════════════════════════════════════════════════

describe("useState rapid update cycles", () => {
  bench("10 sequential setState → re-render cycles (awaited)", async () => {
    let setter!: (v: number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState(ctx, 0);
      setter = set;
      return jsx("div", {}, [`${v}`]);
    };
    const m = mount(fn, {});
    for (let i = 1; i <= 10; i++) {
      setter(i);
      await waitMicrotask();
      await waitMicrotask();
    }
    unmount(m);
  });

  bench("functional updater — prev => prev + 1, 10×", async () => {
    let setter!: (fn: (p: number) => number) => void;
    const fn: ComponentFn<{}> = (_p, ctx) => {
      const [v, set] = useState<number>(ctx, 0);
      setter = set as typeof setter;
      return jsx("div", {}, [`${v}`]);
    };
    const m = mount(fn, {});
    for (let i = 0; i < 10; i++) {
      setter((p) => p + 1);
      await waitMicrotask();
      await waitMicrotask();
    }
    unmount(m);
  });
});

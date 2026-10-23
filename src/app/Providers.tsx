"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/lib/store/store";

/**
 * Redux store for the filter state on the list/browse screens.
 *
 * Mounted per-route rather than in the root layout: creating a Redux store salts its
 * internal action types with Math.random(), which fails the prerender under Cache
 * Components. Keeping it off the global chrome lets every other route ship a static shell,
 * and only the three screens that actually read filters pay for it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => makeStore());

  return <Provider store={store}>{children}</Provider>;
}

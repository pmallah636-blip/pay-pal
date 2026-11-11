"use client";

import { useEffect, useState } from "react";
import { DEMO_WORKSPACE_EVENT } from "./workspace-types";
import { createDefaultWorkspaceState, readDemoWorkspaceState } from "./workspace-store";
import type { DemoWorkspaceState } from "./workspace-types";

export function useDemoWorkspace(): DemoWorkspaceState {
  // Deterministic initial render for prerender/hydration; browser-local state hydrates after mount.
  const [state, setState] = useState<DemoWorkspaceState>(() => createDefaultWorkspaceState());

  useEffect(() => {
    const refresh = () => setState(readDemoWorkspaceState());
    refresh();
    window.addEventListener(DEMO_WORKSPACE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DEMO_WORKSPACE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return state;
}


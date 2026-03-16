import { create } from "zustand";

interface DemoStore {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
}

const urlParams = new URLSearchParams(window.location.search);
const initialDemoMode = urlParams.get("demo") === "true";

export const useDemoStore = create<DemoStore>((set) => ({
  isDemoMode: initialDemoMode,
  setDemoMode: (enabled) => set({ isDemoMode: enabled }),
}));

/** Non-React helper for use in invoke wrapper and transports */
export function getDemoMode(): boolean {
  return useDemoStore.getState().isDemoMode;
}

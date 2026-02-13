import { create } from "zustand";

interface DemoStore {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
}

export const useDemoStore = create<DemoStore>((set) => ({
  isDemoMode: false,
  setDemoMode: (enabled) => set({ isDemoMode: enabled }),
}));

/** Non-React helper for use in invoke wrapper and transports */
export function getDemoMode(): boolean {
  return useDemoStore.getState().isDemoMode;
}

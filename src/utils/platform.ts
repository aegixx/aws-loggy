const detectIsMac = (): boolean => {
  if (typeof navigator === "undefined") return true;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    "";
  if (platform) return /mac/i.test(platform);
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent ?? "");
};

export const IS_MAC = detectIsMac();

export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

export const shortcut = (key: string): string =>
  IS_MAC ? `${MOD_KEY}${key}` : `${MOD_KEY}+${key}`;

export {};

declare global {
  interface Window {
    molty?: {
      getApiBase: () => Promise<string>;
      getLoginItemSettings?: () => Promise<{ openAtLogin: boolean }>;
      setLoginItemSettings?: (openAtLogin: boolean) => Promise<{ openAtLogin: boolean }>;
    };
  }
}

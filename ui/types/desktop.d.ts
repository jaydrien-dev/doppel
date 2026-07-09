/**
 * Native desktop API injected by the Electron preload script.
 * Only present when the web app is running inside the Doppel desktop app.
 */
interface DoppelDesktop {
  isDesktop: true;
  notify: (title: string, body: string) => void;
  platform: () => Promise<"darwin" | "win32" | "linux">;
  getLaunchAtStartup: () => Promise<boolean>;
  setLaunchAtStartup: (enabled: boolean) => Promise<void>;
}

declare global {
  interface Window {
    doppelDesktop?: DoppelDesktop;
  }
}

export {};

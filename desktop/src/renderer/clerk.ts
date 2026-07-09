// Auth is handled by Clerk via a popup in the main process.
// The renderer calls getAuth()/signIn() via IPC.

interface AuthInfo {
  userId: string;
  firstName: string;
  lastName: string;
}

declare global {
  interface Window {
    doppelDesktop: {
      getAuth: () => Promise<AuthInfo | null>;
      signIn: () => Promise<AuthInfo | null>;
      submitCredentials: (email: string, password: string) => Promise<{ error?: string }>;
      notify: (title: string, body: string) => void;
      platform: () => Promise<string>;
      getLaunchAtStartup: () => Promise<boolean>;
      setLaunchAtStartup: (enabled: boolean) => Promise<void>;
      isDesktop: boolean;
    };
  }
}

export {};

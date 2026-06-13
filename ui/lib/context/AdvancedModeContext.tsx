"use client";

import { createContext, useContext, useState, useEffect } from "react";

const ADV_KEY = "doppel_advanced_mode";

type AdvancedModeContextType = {
  advanced: boolean;
  toggle: () => void;
};

const AdvancedModeContext = createContext<AdvancedModeContextType>({
  advanced: false,
  toggle: () => {},
});

export function AdvancedModeProvider({ children }: { children: React.ReactNode }) {
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    try { setAdvanced(localStorage.getItem(ADV_KEY) === "1"); } catch { /* non-fatal */ }
  }, []);

  const toggle = () => {
    setAdvanced((v) => {
      const next = !v;
      try { localStorage.setItem(ADV_KEY, next ? "1" : "0"); } catch { /* non-fatal */ }
      return next;
    });
  };

  return (
    <AdvancedModeContext.Provider value={{ advanced, toggle }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  return useContext(AdvancedModeContext);
}

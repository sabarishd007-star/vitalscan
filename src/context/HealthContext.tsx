/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type HealthData = {
  heartRate: number | null;
  bloodPressure: string | null;
  oxygen: number | null;
  respirationRate: number | null;
  stress: string;
  healthScore: number | null;
  risk: string;
};

type HealthContextType = {
  healthData: HealthData;
  setHealthData: React.Dispatch<React.SetStateAction<HealthData>>;
};

const HealthContext = createContext<HealthContextType | undefined>(undefined);

export function HealthProvider({ children }: { children: ReactNode }) {
  const [healthData, setHealthData] = useState<HealthData>({
    heartRate: null,
    bloodPressure: null,
    oxygen: null,
    respirationRate: null,
    stress: "Unknown",
    healthScore: null,
    risk: "Unknown",
  });

  return (
    <HealthContext.Provider value={{ healthData, setHealthData }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const context = useContext(HealthContext);

  if (!context) {
    throw new Error("useHealth must be used inside HealthProvider");
  }

  return context;
}

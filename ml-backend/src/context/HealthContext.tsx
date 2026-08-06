/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type HealthData = {
  heartRate: number;
  bloodPressure: string;
  oxygen: number;
  stress: string;
  healthScore: number;
  risk: string;
};

type HealthContextType = {
  healthData: HealthData;
  setHealthData: React.Dispatch<React.SetStateAction<HealthData>>;
};

const HealthContext = createContext<HealthContextType | undefined>(undefined);

export function HealthProvider({ children }: { children: ReactNode }) {
  const [healthData, setHealthData] = useState<HealthData>({
    heartRate: 78,
    bloodPressure: "120/80",
    oxygen: 98,
    stress: "Low",
    healthScore: 92,
    risk: "Low",
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

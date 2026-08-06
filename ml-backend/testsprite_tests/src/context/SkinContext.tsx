/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { SkinAnalysisResult } from "../utils/skinEngine";
import type { SkinRecommendations } from "../utils/skinRecommendations";

export interface SkinData {
  result: SkinAnalysisResult | null;
  recommendations: SkinRecommendations | null;
}

type SkinContextType = {
  skinData: SkinData;
  setSkinData: React.Dispatch<React.SetStateAction<SkinData>>;
};

const SkinContext = createContext<SkinContextType | undefined>(undefined);

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skinData, setSkinData] = useState<SkinData>({
    result: null,
    recommendations: null,
  });

  return (
    <SkinContext.Provider value={{ skinData, setSkinData }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  const context = useContext(SkinContext);
  if (!context) {
    throw new Error("useSkin must be used inside SkinProvider");
  }
  return context;
}

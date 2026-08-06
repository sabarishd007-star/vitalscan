import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { HealthProvider } from "./context/HealthContext";
import { AuthProvider } from "./context/AuthContext";
import { SkinProvider } from "./context/SkinContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HealthProvider>
          <SkinProvider>
            <App />
          </SkinProvider>
        </HealthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
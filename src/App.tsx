import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineBanner from "./components/OfflineBanner";
import Home from "./pages/Home";
import About from "./pages/About";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import SkinScan from "./pages/SkinScan";
import SkinDashboard from "./pages/SkinDashboard";
import SkinReport from "./pages/SkinReport";
import SkinHistory from "./pages/SkinHistory";
import ProfilePage from "./pages/Profile";

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/about" element={<About />} />
        <Route path="/skin-scan" element={<ProtectedRoute><SkinScan /></ProtectedRoute>} />
        <Route path="/skin-dashboard" element={<ProtectedRoute><SkinDashboard /></ProtectedRoute>} />
        <Route path="/skin-report" element={<ProtectedRoute><SkinReport /></ProtectedRoute>} />
        <Route path="/skin-history" element={<ProtectedRoute><SkinHistory /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/scan" element={<Navigate to="/skin-scan" replace />} />
        <Route path="/dashboard" element={<Navigate to="/skin-dashboard" replace />} />
        <Route path="/report" element={<Navigate to="/skin-report" replace />} />
        <Route path="/history" element={<Navigate to="/skin-history" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;

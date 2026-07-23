import { Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Dashboard from "./pages/Dashboard";
import Report from "./pages/Report";
import About from "./pages/About";
import Login from "./pages/Login";
import Register from "./pages/Register";

import ReportHistory from "./pages/ReportHistory";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/report" element={<Report />} />
        <Route path="/history" element={<ReportHistory />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
}

export default App;
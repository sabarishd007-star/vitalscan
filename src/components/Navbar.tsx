import { Link, useNavigate } from "react-router-dom";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { signOut } from "../services/authService";

export default function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  async function handleLogout() {
    try { await signOut(); navigate("/login"); }
    catch (error) { console.error("Logout failed:", error); }
  }
  return (
    <nav className="bg-gradient-to-r from-pink-600 to-violet-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-8 py-4">
        <h1 className="text-2xl font-bold"><Link to="/">VitalScan SkinCare</Link></h1>
        <div className="flex items-center gap-6 font-semibold">
          <Link to="/" className="hover:text-pink-100">Home</Link>
          <Link to="/skin-scan" className="hover:text-pink-100">Skin Analysis</Link>
          <Link to="/skin-dashboard" className="hover:text-pink-100">Dashboard</Link>
          <Link to="/skin-history" className="hover:text-pink-100">History</Link>
          <Link to="/about" className="hover:text-pink-100">About</Link>
          {user ? (
            <div className="flex items-center gap-4 border-l border-white/30 pl-6">
              <span className="flex items-center gap-1.5 text-sm bg-white/15 px-3 py-1.5 rounded-full font-medium"><UserIcon size={16} />{user.displayName || user.email?.split("@")[0]}</span>
              <button onClick={handleLogout} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-xl text-sm font-bold transition shadow"><LogOut size={16} />Logout</button>
            </div>
          ) : <Link to="/login" className="bg-white hover:bg-pink-50 text-pink-700 px-4 py-1.5 rounded-xl font-bold transition shadow">Login</Link>}
        </div>
      </div>
    </nav>
  );
}

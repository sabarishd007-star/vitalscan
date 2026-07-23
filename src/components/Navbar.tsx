
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signOut } from "../services/authService";
import { LogOut, User as UserIcon } from "lucide-react";

export default function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <nav className="bg-blue-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-8 py-4">

        <h1 className="text-2xl font-bold">
          <Link to="/">🩺 VitalScan AI</Link>
        </h1>

        <div className="flex items-center gap-6 font-semibold">

          <Link to="/" className="hover:text-yellow-300">
            Home
          </Link>

          <Link to="/scan" className="hover:text-yellow-300">
            Scan
          </Link>

          <Link to="/dashboard" className="hover:text-yellow-300">
            Dashboard
          </Link>

          <Link to="/report" className="hover:text-yellow-300">
            Report
          </Link>

          <Link to="/about" className="hover:text-yellow-300">
            About
          </Link>

          {user ? (
            <div className="flex items-center gap-4 border-l border-blue-500 pl-6">
              <span className="flex items-center gap-1.5 text-sm bg-blue-800/60 px-3 py-1.5 rounded-full font-medium">
                <UserIcon size={16} />
                {user.displayName || user.email?.split("@")[0]}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-xl text-sm font-bold transition shadow"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="bg-yellow-400 hover:bg-yellow-500 text-blue-950 px-4 py-1.5 rounded-xl font-bold transition shadow"
            >
              Login
            </Link>
          )}

        </div>
      </div>
    </nav>
  );
}
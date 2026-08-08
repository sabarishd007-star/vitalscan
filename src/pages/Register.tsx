import { useState } from "react";
import { signUp } from "../services/authService";
import { Link, useLocation, useNavigate } from "react-router-dom";

type FirebaseError = { code?: string; message?: string };

function getFirebaseError(error: unknown): FirebaseError {
  return typeof error === "object" && error !== null ? error as FirebaseError : {};
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(email, password, displayName);
      alert("Registration Successful! Check your email for a verification link.");
      navigate("/login", { replace: true, state: location.state });
    } catch (error: unknown) {
      const err = getFirebaseError(error);
      if (err?.code === "auth/email-already-in-use") {
        setError("This email address is already registered. Please login.");
      } else if (err?.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError(err?.message || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-500 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">
          Create Account
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center text-red-600 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={register} className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            value={displayName}
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <input
            type="email"
            placeholder="Email Address"
            value={email}
            required
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password (6+ characters)"
            value={password}
            required
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-60"
          >
            {loading ? "Creating Account..." : "Register"}
          </button>
        </form>

        <p className="text-center mt-6 text-gray-600 text-sm">
          Already have an account?{" "}
          <Link to="/login" state={location.state} className="text-blue-600 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

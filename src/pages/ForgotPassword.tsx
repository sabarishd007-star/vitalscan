import { useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineMailOpen } from "react-icons/hi";
import { resetPassword } from "../services/authService";

type FirebaseError = { code?: string; message?: string };

function getFirebaseError(error: unknown): FirebaseError {
  return typeof error === "object" && error !== null ? error as FirebaseError : {};
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (error: unknown) {
      const err = getFirebaseError(error);
      if (err?.code === "auth/user-not-found") {
        setError("No account found with this email. Please register first.");
      } else if (err?.code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else {
        setError(err?.message || "Could not send the reset email. Try again later.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-500 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl mb-4">
            <HiOutlineMailOpen />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Check your inbox</h2>
          <p className="text-gray-600 mt-3 text-sm">
            If an account exists for <span className="font-semibold text-blue-600">{email}</span>,
            we've sent a password reset link. Follow it to choose a new password.
          </p>
          <Link
            to="/login"
            className="mt-6 block w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition shadow-lg"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-500 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2 text-center text-blue-600">Reset Password</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Enter your account email and we'll send you a reset link.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center text-red-600 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            required
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </form>

        <p className="text-center mt-6 text-gray-600 text-sm">
          Remembered it?{" "}
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

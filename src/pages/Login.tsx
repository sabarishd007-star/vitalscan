import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn, signInWithGoogle, sendVerificationEmail, signOut } from "../services/authService";
import { FcGoogle } from "react-icons/fc";
import { HiOutlineMailOpen } from "react-icons/hi";
import type { User } from "firebase/auth";

type FirebaseError = { code?: string; message?: string };

function getFirebaseError(error: unknown): FirebaseError {
  return typeof error === "object" && error !== null ? error as FirebaseError : {};
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState("");
  const [unverifiedUserObj, setUnverifiedUserObj] = useState<User | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnverifiedEmail(null);
    setResendStatus("");
    setLoading(true);
    try {
      const credential = await signIn(email, password);
      const user = credential.user;

      // Check if email is verified
      if (!user.emailVerified) {
        setUnverifiedEmail(user.email);
        setUnverifiedUserObj(user);
        // Block access & sign out immediately
        await signOut();
        return;
      }

      navigate("/dashboard");
    } catch (error: unknown) {
      const err = getFirebaseError(error);
      if (err?.code === "auth/invalid-credential") {
        setError("Incorrect email or password. Please check your details or create an account.");
      } else if (err?.code === "auth/user-not-found") {
        setError("No account found with this email. Please register first.");
      } else if (err?.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (err?.code === "auth/too-many-requests") {
        setError("Access temporarily disabled due to many failed attempts. Try again later.");
      } else {
        setError(err?.message || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (error: unknown) {
      const err = getFirebaseError(error);
      if (err?.code === "auth/popup-closed-by-user") {
        setError("Google sign-in was cancelled.");
      } else if (err?.code === "auth/operation-not-allowed") {
        setError("Google sign-in is not enabled in Firebase Console.");
      } else {
        setError("Failed to sign in with Google. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendEmail() {
    if (!unverifiedUserObj) return;
    try {
      await sendVerificationEmail(unverifiedUserObj);
      setResendStatus("Verification email resent! Check your inbox.");
    } catch {
      setResendStatus("Failed to resend verification email. Try again later.");
    }
  }

  if (unverifiedEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-500 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl mb-4 flex items-center justify-center">
            <HiOutlineMailOpen />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Email Not Verified</h2>
          <p className="text-gray-600 mt-3 text-sm">
            Your email address <span className="font-semibold text-blue-600">{unverifiedEmail}</span> is not verified yet.
          </p>
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm font-medium">
            Check your email &amp; verify, then log in.
          </div>

          {resendStatus && (
            <p className="mt-3 text-xs text-blue-600 font-semibold">{resendStatus}</p>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleResendEmail}
              className="w-full border border-blue-600 text-blue-600 hover:bg-blue-50 py-3 rounded-xl font-bold transition"
            >
              Resend Verification Email
            </button>
            <button
              onClick={() => {
                setUnverifiedEmail(null);
                setUnverifiedUserObj(null);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition shadow-lg"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-500 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md">

        <h1 className="text-4xl font-bold text-center text-blue-600">
          🩺 VitalScan
        </h1>

        <p className="text-center text-gray-500 mt-2">
          Sign in to continue
        </p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center text-red-600 text-sm font-medium">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>

          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Login"}
          </button>

        </form>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="px-3 text-gray-400 text-xs font-semibold uppercase">Or</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-xl font-semibold transition shadow-sm disabled:opacity-60"
        >
          <FcGoogle className="text-2xl" />
          Continue with Google
        </button>

        <div className="text-center mt-6">
          <Link
            to="/register"
            className="text-blue-600 font-semibold hover:underline"
          >
            Create New Account
          </Link>
        </div>

      </div>
    </div>
  );
}

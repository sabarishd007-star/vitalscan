import { auth } from "../firebase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export type EmergencyContact = {
  name: string;
  relationship?: string | null;
  phone?: string | null;
};

export type Profile = {
  displayName?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  emergencyContacts?: EmergencyContact[];
  healthTargets?: string[];
  notificationRules?: Record<string, boolean>;
  reportOptions?: Record<string, boolean>;
};

function userIdHeader(): Record<string, string> {
  const uid = auth.currentUser?.uid;
  return uid ? { "X-User-Id": uid } : {};
}

export async function getProfile() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/profile`, {
      headers: userIdHeader(),
    });
    if (res.status === 404) return { data: null as Profile | null, error: null };
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return { data: data as Profile, error: null };
  } catch (err) {
    console.error("Could not fetch profile from backend:", err);
    return { data: null as Profile | null, error: err as Error };
  }
}

export async function saveProfile(profile: Profile) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...userIdHeader(),
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return { data: data as Profile, error: null };
  } catch (err) {
    console.error("Could not save profile to backend:", err);
    return { data: null, error: err as Error };
  }
}

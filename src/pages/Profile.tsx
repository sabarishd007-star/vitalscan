import { useEffect, useState } from "react";
import {
  Loader2,
  PhoneCall,
  Plus,
  Save,
  Settings2,
  Stethoscope,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { updateUserProfile } from "../services/authService";
import {
  getProfile,
  saveProfile,
  type EmergencyContact,
  type Profile,
} from "../services/profileService";

const SEX_OPTIONS = ["female", "male", "other", "prefer not to say"];
const ACTIVITY_OPTIONS = ["sedentary", "light", "moderate", "active", "very active"];

const inputClass =
  "w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white";

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-3xl shadow-lg p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="bg-pink-100 text-pink-600 p-2.5 rounded-2xl">{icon}</span>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function TextList({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft("");
  }
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 bg-pink-600 hover:bg-pink-700 text-white px-4 rounded-xl font-bold transition"
          aria-label={`Add ${label}`}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {values.map((value) => (
          <span
            key={value}
            className="flex items-center gap-1.5 bg-pink-50 text-pink-700 border border-pink-200 px-3 py-1.5 rounded-full text-sm font-medium"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="hover:text-pink-900"
              aria-label={`Remove ${value}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition relative shrink-0 ${checked ? "bg-pink-600" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [healthTargets, setHealthTargets] = useState<string[]>([]);
  const [notifications, setNotifications] = useState({ email: true, sms: false, push: true });
  const [anonymize, setAnonymize] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await getProfile();
      if (!active) return;
      if (data) {
        setDisplayName(data.displayName ?? user?.displayName ?? "");
        setDateOfBirth(data.dateOfBirth ?? "");
        setSex(data.sex ?? "");
        setHeightCm(data.heightCm ? String(data.heightCm) : "");
        setWeightKg(data.weightKg ? String(data.weightKg) : "");
        setActivityLevel(data.activityLevel ?? "");
        setConditions(data.conditions ?? []);
        setMedications(data.medications ?? []);
        setAllergies(data.allergies ?? []);
        setEmergencyContacts(data.emergencyContacts ?? []);
        setHealthTargets(data.healthTargets ?? []);
        setNotifications({
          email: data.notificationRules?.email ?? true,
          sms: data.notificationRules?.sms ?? false,
          push: data.notificationRules?.push ?? true,
        });
        setAnonymize(data.reportOptions?.anonymize ?? true);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  function updateContact(index: number, field: keyof EmergencyContact, value: string) {
    setEmergencyContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const profile: Profile = {
      displayName: displayName.trim() || null,
      dateOfBirth: dateOfBirth || null,
      sex: sex || null,
      heightCm: heightCm ? Number(heightCm) : null,
      weightKg: weightKg ? Number(weightKg) : null,
      activityLevel: activityLevel || null,
      conditions,
      medications,
      allergies,
      emergencyContacts,
      healthTargets,
      notificationRules: notifications,
      reportOptions: { anonymize },
    };
    try {
      const { error } = await saveProfile(profile);
      if (error) throw error;
      if (displayName.trim()) await updateUserProfile(displayName.trim());
      setMessage({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      console.error(err);
      setMessage({ kind: "err", text: "Could not save profile. Is the backend running?" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
      >
        <Loader2 className="animate-spin text-white" size={40} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-16"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
    >
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <header className="text-center mb-2">
          <h1 className="text-3xl font-bold text-white">Your Profile</h1>
          <p className="text-white/70 mt-1">
            {user?.email} — these details personalize your analysis and reports.
          </p>
        </header>

        {message && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-medium text-center ${
              message.kind === "ok"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <SectionCard icon={<UserIcon size={22} />} title="Identity" subtitle="How we address you and your basic details.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="md:col-span-2 block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Full Name</span>
              <input
                className={inputClass}
                value={displayName}
                placeholder="Your name"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Date of Birth</span>
              <input
                className={inputClass}
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Sex</span>
              <select className={inputClass} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">Prefer not to say</option>
                {SEX_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Height (cm)</span>
              <input
                className={inputClass}
                type="number"
                min="30"
                max="300"
                value={heightCm}
                placeholder="e.g. 170"
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Weight (kg)</span>
              <input
                className={inputClass}
                type="number"
                min="1"
                max="500"
                value={weightKg}
                placeholder="e.g. 65"
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">Activity Level</span>
              <select className={inputClass} value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
                <option value="">Not specified</option>
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          </div>
        </SectionCard>

        <SectionCard
          icon={<Stethoscope size={22} />}
          title="Clinical History"
          subtitle="Conditions, medications and allergies help contextualize your results."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TextList label="Conditions" values={conditions} placeholder="e.g. asthma" onChange={setConditions} />
            <TextList label="Medications" values={medications} placeholder="e.g. inhaler" onChange={setMedications} />
            <TextList label="Allergies" values={allergies} placeholder="e.g. penicillin" onChange={setAllergies} />
          </div>
        </SectionCard>

        <SectionCard
          icon={<PhoneCall size={22} />}
          title="Emergency Contacts"
          subtitle="Someone to notify in an urgent situation."
        >
          {emergencyContacts.length === 0 && (
            <p className="text-sm text-gray-400 mb-4">No emergency contacts added yet.</p>
          )}
          <div className="space-y-3">
            {emergencyContacts.map((contact, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                <input
                  className={inputClass}
                  placeholder="Name"
                  value={contact.name}
                  onChange={(e) => updateContact(index, "name", e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Relationship"
                  value={contact.relationship ?? ""}
                  onChange={(e) => updateContact(index, "relationship", e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Phone"
                  value={contact.phone ?? ""}
                  onChange={(e) => updateContact(index, "phone", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setEmergencyContacts((prev) => prev.filter((_, i) => i !== index))}
                  className="justify-self-start md:justify-self-end text-red-500 hover:text-red-700 font-medium text-sm flex items-center gap-1"
                >
                  <X size={16} /> Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEmergencyContacts((prev) => [...prev, { name: "", relationship: "", phone: "" }])}
            className="mt-4 flex items-center gap-1.5 text-pink-600 hover:text-pink-800 font-semibold text-sm"
          >
            <Plus size={16} /> Add Emergency Contact
          </button>
        </SectionCard>

        <SectionCard
          icon={<Settings2 size={22} />}
          title="Preferences"
          subtitle="Goals and how we deliver your results."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TextList label="Health Targets" values={healthTargets} placeholder="e.g. better sleep" onChange={setHealthTargets} />
            <div>
              <span className="block text-sm font-semibold text-gray-700 mb-1">Notifications</span>
              <Toggle label="Email updates" checked={notifications.email} onChange={(v) => setNotifications((p) => ({ ...p, email: v }))} />
              <Toggle label="SMS alerts" checked={notifications.sms} onChange={(v) => setNotifications((p) => ({ ...p, sms: v }))} />
              <Toggle label="Push notifications" checked={notifications.push} onChange={(v) => setNotifications((p) => ({ ...p, push: v }))} />
            </div>
          </div>
          <div className="mt-6">
            <span className="block text-sm font-semibold text-gray-700 mb-1">Reports</span>
            <Toggle
              label="Anonymize my reports by default"
              checked={anonymize}
              onChange={setAnonymize}
            />
          </div>
        </SectionCard>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-700 hover:to-violet-700 text-white py-4 rounded-2xl font-bold text-lg transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          {saving ? "Saving..." : "Save Profile"}
        </button>

        <p className="text-center text-white/50 text-xs">
          Your profile is stored securely against your account and used only to personalize analysis.
        </p>
      </div>
    </div>
  );
}

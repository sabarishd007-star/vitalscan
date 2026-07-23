type HealthCardProps = {
  title: string;
  value: string;
  icon: string;
  color: string;
};

export default function HealthCard({
  title,
  value,
  icon,
  color,
}: HealthCardProps) {
  return (
    <div className={`${color} rounded-2xl p-6 shadow-lg`}>
      <div className="text-5xl mb-4">{icon}</div>

      <h2 className="text-xl font-bold">{title}</h2>

      <p className="text-3xl font-semibold mt-3">{value}</p>
    </div>
  );
}
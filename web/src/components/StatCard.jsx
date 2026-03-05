/**
 * StatCard — consistent KPI display across pages.
 * Semantic icon/color mapping:
 * - Cost: CurrencyDollarIcon, primary
 * - Tokens: CircleStackIcon, blue (input) / purple (output or total)
 * - Sessions: UserGroupIcon, blue
 * - Running: PlayIcon, green
 * - Idle: ClockIcon, yellow
 * - Attention/Errors: ExclamationTriangleIcon, red
 */
export default function StatCard({ label, sublabel, value, icon: _icon, color: _color }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 sm:p-4 md:p-5 shadow-card">
      <div className="flex flex-col">
        <p className="text-xs sm:text-sm text-dark-400 mb-0.5 sm:mb-1 font-medium">{label}</p>
        {sublabel && (
          <p className="text-[10px] sm:text-xs text-dark-500 mb-1.5 sm:mb-2">{sublabel}</p>
        )}
        <p className="text-xl sm:text-2xl font-bold text-dark-100">{value}</p>
      </div>
    </div>
  );
}

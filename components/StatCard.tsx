
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  colorClass: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, unit, icon, colorClass }) => {
  return (
    <div className="glass p-4 rounded-2xl flex items-center gap-4 hover:border-blue-500/50 transition-all duration-300">
      <div className={`p-3 rounded-xl ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-400 text-sm font-medium">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">{value}</span>
          <span className="text-slate-500 text-sm">{unit}</span>
        </div>
      </div>
    </div>
  );
};

export default StatCard;

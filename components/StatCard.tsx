
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  colorClass: string;
  onClick?: () => void;
  isActive?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, unit, icon, colorClass, onClick, isActive }) => {
  return (
    <div
      onClick={onClick}
      className={`
        glass p-4 rounded-2xl flex items-center gap-4 transition-all duration-300 cursor-pointer select-none
        ${isActive
          ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
          : 'hover:border-blue-500/50 hover:bg-slate-800/50'
        }
      `}
    >
      <div className={`p-3 rounded-xl transition-colors duration-300 ${isActive ? 'bg-blue-500 text-white' : colorClass}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-medium transition-colors ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
          {label}
        </p>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold transition-colors ${isActive ? 'text-white' : ''}`}>
            {value}
          </span>
          <span className={`text-sm transition-colors ${isActive ? 'text-blue-300' : 'text-slate-500'}`}>
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatCard;

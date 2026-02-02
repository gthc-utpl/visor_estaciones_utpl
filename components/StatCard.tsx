
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
        bg-white/80 p-4 rounded-2xl flex items-center gap-4 transition-all duration-300 cursor-pointer select-none border-2
        ${isActive
          ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-500/20 scale-105'
          : 'border-slate-200 hover:border-blue-400 hover:bg-gradient-to-br hover:from-slate-50 hover:to-blue-50 hover:shadow-md'
        }
      `}
    >
      <div className={`p-3 rounded-xl transition-all duration-300 ${isActive ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md' : colorClass}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-bold transition-colors uppercase tracking-wide ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
          {label}
        </p>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-black transition-colors ${isActive ? 'text-blue-600' : 'text-slate-800'}`}>
            {value}
          </span>
          <span className={`text-sm font-bold transition-colors ${isActive ? 'text-blue-500' : 'text-slate-500'}`}>
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatCard;

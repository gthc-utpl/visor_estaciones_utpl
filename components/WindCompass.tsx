import React from 'react';

interface WindCompassProps {
    degrees: number;
    speed: number;
    unit?: string;
}

const WindCompass: React.FC<WindCompassProps> = ({ degrees, speed, unit = 'km/h' }) => {
    return (
        <div className="flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 flex items-center justify-center border-4 border-slate-200 rounded-full bg-slate-50">
                {/* N/S/E/W markers */}
                <span className="absolute top-1 text-[8px] font-black text-slate-400">N</span>
                <span className="absolute bottom-1 text-[8px] font-black text-slate-400">S</span>
                <span className="absolute left-1 text-[8px] font-black text-slate-400">W</span>
                <span className="absolute right-1 text-[8px] font-black text-slate-400">E</span>

                {/* Arrow */}
                <div
                    className="absolute w-full h-full flex items-center justify-center transition-transform duration-500 ease-out"
                    style={{ transform: `rotate(${degrees}deg)` }}
                >
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[16px] border-b-slate-800 absolute top-2"></div>
                </div>

                {/* Center Value */}
                <div className="z-10 bg-white/90 px-1 py-0.5 rounded text-center backdrop-blur-sm">
                    <div className="text-xs font-black text-slate-800 leading-none">{speed}</div>
                    <div className="text-[7px] font-bold text-slate-500 leading-none">{unit}</div>
                </div>
            </div>
            <div className="mt-2 text-center">
                <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Viento {degrees}°
                </div>
            </div>
        </div>
    );
};

export default WindCompass;

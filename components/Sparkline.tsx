
import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { WeatherData } from '../types';

interface SparklineProps {
    data: WeatherData[];
    dataKey: keyof WeatherData;
    color?: string;
}

const Sparkline: React.FC<SparklineProps> = ({ data, dataKey, color = '#3b82f6' }) => {
    if (!data || data.length === 0) return <div className="h-full w-full bg-slate-50 rounded-lg"></div>;

    // Filtrar nulos y asegurar orden
    const cleanData = data
        .filter(d => d[dataKey] !== null && d[dataKey] !== undefined)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (cleanData.length < 2) return <div className="h-full w-full bg-slate-50 rounded-lg"></div>;

    const min = Math.min(...cleanData.map(d => d[dataKey] as number));
    const max = Math.max(...cleanData.map(d => d[dataKey] as number));
    const domainPadding = (max - min) * 0.1;

    return (
        <div className="w-full h-full opacity-80 hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cleanData}>
                    <defs>
                        <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <YAxis hide domain={[min - domainPadding, max + domainPadding]} />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#gradient-${dataKey})`}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default Sparkline;


import React, { useMemo } from 'react';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import { WeatherData } from '../types';

interface RainfallChartProps {
    data: WeatherData[];
    dataKey: keyof WeatherData;
    color: string;
    label: string;
    unit?: string;
}

const RainfallChart: React.FC<RainfallChartProps> = ({ data, dataKey, color, label, unit = '' }) => {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const collapsed = data.reduce((acc: Record<string, WeatherData>, curr) => {
            const ts = curr.timestamp;
            if (!acc[ts]) {
                acc[ts] = { ...curr };
            } else {
                (Object.keys(curr) as (keyof WeatherData)[]).forEach(key => {
                    const val = curr[key];
                    if (val !== null && val !== undefined && (acc[ts][key] === null || acc[ts][key] === undefined)) {
                        (acc[ts] as any)[key] = val;
                    }
                });
            }
            return acc;
        }, {} as Record<string, WeatherData>);

        const sorted = (Object.values(collapsed) as WeatherData[]).sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        return sorted.map((d) => {
            const dateObj = new Date(d.timestamp);
            const ts = dateObj.getTime();
            return {
                ...d,
                timestampNum: ts,
                timeLabel: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                fullTime: dateObj.toLocaleString('es-EC', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: true
                }),
                value: d[dataKey]
            };
        });
    }, [data, dataKey]);

    if (chartData.length === 0) {
        return (
            <div className="h-64 w-full flex items-center justify-center border-2 border-slate-200 rounded-3xl bg-slate-50">
                <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest italic animate-pulse">Sincronizando Telemetría...</p>
            </div>
        );
    }

    const values = chartData.map(d => d.value).filter(v => typeof v === 'number') as number[];
    const maxVal = values.length ? Math.max(...values) : 10;
    const margin = maxVal * 0.15 || 2;

    return (
        <div className="h-full w-full relative group select-none">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorRainfall" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} opacity={0.3} />

                    <XAxis
                        dataKey="timestampNum"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        stroke="#64748b"
                        fontSize={9}
                        tickLine={false}
                        axisLine={false}
                        padding={{ left: 0, right: 0 }}
                        tickFormatter={(unixTime) => {
                            const date = new Date(unixTime);
                            const totalDuration = chartData[chartData.length - 1].timestampNum - chartData[0].timestampNum;
                            const hoursDiff = totalDuration / (1000 * 60 * 60);

                            if (hoursDiff <= 24) {
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            } else if (hoursDiff <= 168) {
                                return date.toLocaleString('es-EC', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
                            } else if (hoursDiff <= 8760) {
                                return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
                            } else {
                                return date.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
                            }
                        }}
                        minTickGap={50}
                    />

                    <YAxis
                        stroke="#64748b"
                        fontSize={9}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        domain={[0, maxVal + margin]}
                        tickFormatter={(v) => `${v.toFixed(1)}${unit ? ' ' + unit : ''}`}
                    />

                    <Tooltip
                        isAnimationActive={true}
                        wrapperStyle={{ pointerEvents: 'none', outline: 'none' }}
                        cursor={{
                            fill: color,
                            opacity: 0.1
                        }}
                        contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.98)',
                            backdropFilter: 'blur(16px)',
                            border: '2px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '16px',
                            fontSize: '11px',
                            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2)',
                            padding: '12px'
                        }}
                        labelStyle={{ color: '#64748b', marginBottom: '6px', fontWeight: '800', textTransform: 'uppercase', fontSize: '9px' }}
                        labelFormatter={(_, items) => items[0]?.payload?.fullTime}
                        formatter={(value: any) => [
                            <span className="font-black text-slate-800 text-xl">{parseFloat(value).toFixed(2)}</span>,
                            <span className="text-[10px] uppercase font-black tracking-widest ml-2" style={{ color }}>{label}</span>
                        ]}
                    />

                    <Bar
                        dataKey="value"
                        fill="url(#colorRainfall)"
                        radius={[8, 8, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-out"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill="url(#colorRainfall)" />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RainfallChart;

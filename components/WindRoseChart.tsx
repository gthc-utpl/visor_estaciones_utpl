
import React, { useMemo } from 'react';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';
import { WeatherData } from '../types';

interface WindRoseChartProps {
    data: WeatherData[];
    color?: string;
}

const WindRoseChart: React.FC<WindRoseChartProps> = ({ data, color = '#8884d8' }) => {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const bins = {
            'N': 0, 'NE': 0, 'E': 0, 'SE': 0,
            'S': 0, 'SW': 0, 'W': 0, 'NW': 0
        };

        let total = 0;

        data.forEach(d => {
            const dir = d.windDirection;
            if (typeof dir !== 'number') return;

            total++;
            // Normalizar a 0-360
            const deg = (dir % 360 + 360) % 360;

            if (deg >= 337.5 || deg < 22.5) bins['N']++;
            else if (deg >= 22.5 && deg < 67.5) bins['NE']++;
            else if (deg >= 67.5 && deg < 112.5) bins['E']++;
            else if (deg >= 112.5 && deg < 157.5) bins['SE']++;
            else if (deg >= 157.5 && deg < 202.5) bins['S']++;
            else if (deg >= 202.5 && deg < 247.5) bins['SW']++;
            else if (deg >= 247.5 && deg < 292.5) bins['W']++;
            else if (deg >= 292.5 && deg < 337.5) bins['NW']++;
        });

        if (total === 0) return [];

        // Transformar a formato Recharts Radar
        return Object.entries(bins).map(([dir, count]) => ({
            direction: dir,
            frequency: parseFloat(((count / total) * 100).toFixed(1)), // Porcentaje
            fullMark: 100
        }));
    }, [data]);

    if (chartData.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs uppercase font-bold">
                Sin datos de viento
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                    dataKey="direction"
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                />
                <PolarRadiusAxis
                    angle={30}
                    domain={[0, 'auto']}
                    tick={false}
                    axisLine={false}
                />
                <Radar
                    name="Frecuencia %"
                    dataKey="frequency"
                    stroke={color}
                    fill={color}
                    fillOpacity={0.5}
                />
                <Tooltip
                    formatter={(value: number) => [`${value}%`, 'Frecuencia']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
};

export default WindRoseChart;

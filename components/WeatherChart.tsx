
import React, { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine
} from 'recharts';
import { WeatherData } from '../types';

interface WeatherChartProps {
  data: WeatherData[];
  dataKey: keyof WeatherData;
  color: string;
  label: string;
}

const WeatherChart: React.FC<WeatherChartProps> = ({ data, dataKey, color, label }) => {
  /**
   * PROCESAMIENTO DE DATOS PARA MÁXIMA PRECISIÓN:
   * Convertimos los datos a una serie numérica real para evitar el desfase de 'categorías'.
   */
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
        timestampNum: ts, // Valor numérico para el eje X (Precisión total)
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
      <div className="h-64 w-full flex items-center justify-center border border-slate-800 rounded-3xl bg-slate-900/20">
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic animate-pulse">Sincronizando Telemetría...</p>
      </div>
    );
  }

  const values = chartData.map(d => d.value).filter(v => typeof v === 'number') as number[];
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 10;
  const margin = (maxVal - minVal) * 0.15 || 2;

  return (
    <div className="h-full w-full relative group select-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          // Márgenes en cero para asegurar que las coordenadas del ratón coincidan con el área de dibujo
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`color-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.1} />

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

              // Lógica inteligente de formateo
              if (hoursDiff <= 24) {
                // Menos de 24h: Solo hora (14:30)
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              } else if (hoursDiff <= 168) { // 7 días
                // Semana actual: Dia + Hora (Lun 14:00)
                return date.toLocaleString('es-EC', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
              } else if (hoursDiff <= 8760) { // 365 días
                // Hasta 1 año: Dia + Mes (28 Ene)
                return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
              } else {
                // Más de un año: Mes + Año (Ene 2026)
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
            domain={[minVal - margin, maxVal + margin]}
            tickFormatter={(v) => v.toFixed(1)}
          />

          <Tooltip
            isAnimationActive={false}
            wrapperStyle={{ pointerEvents: 'none', outline: 'none' }}
            cursor={{
              stroke: color,
              strokeWidth: 2,
              strokeDasharray: '4 4',
              opacity: 0.8
            }}
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              fontSize: '11px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: '12px'
            }}
            labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontWeight: '800', textTransform: 'uppercase', fontSize: '9px' }}
            labelFormatter={(_, items) => items[0]?.payload?.fullTime}
            formatter={(value: any) => [
              <span className="font-black text-white text-xl">{parseFloat(value).toFixed(2)}</span>,
              <span className="text-[10px] uppercase font-black tracking-widest ml-2" style={{ color }}>{label}</span>
            ]}
          />

          <Area
            // 'linear' es clave para precisión: la línea es una ruta directa entre puntos sin oscilaciones
            type="linear"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            fillOpacity={1}
            fill={`url(#color-${String(dataKey)})`}
            isAnimationActive={false}
            connectNulls={true}
            // Puntos guía sutiles para indicar dónde hay registros reales
            dot={{
              r: 2,
              fill: color,
              strokeWidth: 0,
              fillOpacity: 0.2
            }}
            // Punto activo de seguimiento instantáneo
            // Fix: Remove isAnimationActive as it is not a valid property of ActiveDotProps in recharts
            activeDot={{
              r: 8,
              stroke: '#0f172a',
              strokeWidth: 3,
              fill: color
            }}
          />

          {chartData.length > 0 && (
            <ReferenceLine
              y={chartData[chartData.length - 1].value as number}
              stroke={color}
              strokeDasharray="3 3"
              opacity={0.1}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeatherChart;

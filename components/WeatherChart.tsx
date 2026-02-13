
import React, { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { WeatherData } from '../types';

interface WeatherChartProps {
  data: WeatherData[];
  dataKey: keyof WeatherData;
  color: string;
  label: string;
  unit?: string;
  secondaryData?: WeatherData[];
  secondaryLabel?: string;
  secondaryColor?: string;
  chartType?: 'line' | 'bar';
}

const WeatherChart: React.FC<WeatherChartProps> = ({
  data,
  dataKey,
  color,
  label,
  unit = '',
  secondaryData,
  secondaryLabel,
  secondaryColor = '#ff7300',
  chartType = 'line'
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    console.log(`📊 Processing Chart Data: ${data.length} records. Key: ${String(dataKey)}`);

    const collapsed = data.reduce((acc: Record<string, WeatherData>, curr) => {
      if (!curr.timestamp) return acc;
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
      const value = d[dataKey];

      // Para datos secundarios de comparación
      let secondaryValue = null;
      if (secondaryData && secondaryData.length > 0) {
        const match = secondaryData.find(sd => sd.timestamp === d.timestamp);
        if (match) {
          secondaryValue = match[dataKey];
        }
      }

      return {
        ...d,
        timestampNum: ts,
        timeLabel: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fullTime: dateObj.toLocaleString('es-EC', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true
        }),
        value: value,
        secondaryValue: secondaryValue
      };
    });
  }, [data, dataKey, secondaryData]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center border-2 border-slate-200 rounded-3xl bg-slate-50">
        <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest italic animate-pulse">Sincronizando Telemetría...</p>
      </div>
    );
  }

  const values = chartData.map(d => d.value).filter(v => typeof v === 'number') as number[];
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 10;
  const rawRange = rawMax - rawMin;

  // Smart Y-axis domain calculation
  // 1. Ensure a minimum visible range so flat data doesn't look microscopic
  // 2. Round to "nice" numbers for clean tick labels
  // 3. Handle special cases (rainfall always starts at 0)

  const getNiceStep = (range: number): number => {
    if (range <= 0.5) return 0.1;
    if (range <= 1) return 0.2;
    if (range <= 2) return 0.5;
    if (range <= 5) return 1;
    if (range <= 10) return 2;
    if (range <= 20) return 5;
    if (range <= 50) return 10;
    if (range <= 100) return 20;
    if (range <= 200) return 50;
    return Math.ceil(range / 5 / 10) * 10;
  };

  // Minimum range per variable type to avoid overly zoomed-in charts
  const isRainfall = chartType === 'bar';
  const minRange = isRainfall ? Math.max(1, rawMax * 0.2) : Math.max(2, rawRange * 0.5);
  const effectiveRange = Math.max(rawRange, minRange);
  const padding = effectiveRange * 0.15;

  const step = getNiceStep(effectiveRange + padding * 2);

  let domainMin: number;
  let domainMax: number;

  if (isRainfall) {
    // Rainfall: always start at 0
    domainMin = 0;
    domainMax = Math.ceil((rawMax + padding) / step) * step;
    if (domainMax <= 0) domainMax = step;
  } else {
    // Other variables: center around data with nice rounded bounds
    domainMin = Math.floor((rawMin - padding) / step) * step;
    domainMax = Math.ceil((rawMax + padding) / step) * step;
    // Ensure at least 2 steps of range
    if (domainMax - domainMin < step * 2) {
      const mid = (rawMin + rawMax) / 2;
      domainMin = Math.floor((mid - step) / step) * step;
      domainMax = domainMin + step * 4;
    }
  }

  // Determine decimal places for tick formatting
  const tickDecimals = step < 1 ? 1 : 0;

  const formatXAxis = (unixTime: number) => {
    if (chartData.length === 0) return '';
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
  };

  const commonTooltipProps = {
    isAnimationActive: true,
    wrapperStyle: { pointerEvents: 'none' as const, outline: 'none' },
    contentStyle: {
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      backdropFilter: 'blur(16px)',
      border: '2px solid rgba(59, 130, 246, 0.3)',
      borderRadius: '16px',
      fontSize: '11px',
      boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2)',
      padding: '12px'
    },
    labelFormatter: (_: any, items: any[]) => items[0]?.payload?.fullTime,
    formatter: (value: any, name: any, props: any) => {
      const isSecondary = props.stroke === secondaryColor || props.fill === secondaryColor;
      const title = isSecondary ? (secondaryLabel || 'Comparación') : label;
      const displayColor = isSecondary ? secondaryColor : color;

      return [
        <span key="value" className="font-black text-slate-800 text-xl">{typeof value === 'number' ? value.toFixed(2) : '--'}</span>,
        <span key="label" className="text-[10px] uppercase font-black tracking-widest ml-2" style={{ color: displayColor }}>{title}</span>
      ];
    }
  };

  return (
    <div className="h-full w-full relative group select-none">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} opacity={0.3} />

            <XAxis
              dataKey="timestampNum"
              type="number"
              domain={['dataMin', 'dataMax']}
              stroke="#64748b"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              padding={{ left: 10, right: 10 }}
              tickFormatter={formatXAxis}
              minTickGap={50}
            />

            <YAxis
              stroke="#64748b"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              width={50}
              domain={[domainMin, domainMax]}
              tickFormatter={(v) => `${v.toFixed(tickDecimals)}${unit ? ' ' + unit : ''}`}
              tickCount={6}
            />

            <Tooltip
              {...commonTooltipProps}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />

            <Legend
              verticalAlign="top"
              height={36}
              content={({ payload }) => (
                <div className="flex items-center justify-end gap-4 mb-2">
                  {payload?.map((entry, index) => (
                    <div key={`item-${index}`} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {entry.value === 'value' ? label : (secondaryLabel || 'Comparación')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            />

            <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} />
            {secondaryData && <Bar dataKey="secondaryValue" fill={secondaryColor} radius={[8, 8, 0, 0]} />}
          </BarChart>
        ) : (
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`color-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              {secondaryData && (
                <linearGradient id={`color-${String(dataKey)}-secondary`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={secondaryColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={secondaryColor} stopOpacity={0} />
                </linearGradient>
              )}
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
              tickFormatter={formatXAxis}
              minTickGap={50}
            />

            <YAxis
              stroke="#64748b"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              width={50}
              domain={[domainMin, domainMax]}
              tickFormatter={(v) => `${v.toFixed(tickDecimals)}${unit ? ' ' + unit : ''}`}
              tickCount={6}
            />

            <Tooltip
              {...commonTooltipProps}
              cursor={{
                stroke: color,
                strokeWidth: 2,
                strokeDasharray: '4 4',
                opacity: 0.8
              }}
            />

            <Legend
              verticalAlign="top"
              height={36}
              content={({ payload }) => (
                <div className="flex items-center justify-end gap-4 mb-2">
                  {payload?.map((entry, index) => (
                    <div key={`item-${index}`} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {entry.value === 'value' ? label : (secondaryLabel || 'Comparación')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              fill={`url(#color-${String(dataKey)})`}
              isAnimationActive={true}
              animationDuration={1000}
            />

            {secondaryData && (
              <Area
                type="monotone"
                dataKey="secondaryValue"
                stroke={secondaryColor}
                strokeWidth={3}
                fill={`url(#color-${String(dataKey)}-secondary)`}
                isAnimationActive={true}
                animationDuration={1000}
              />
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default WeatherChart;

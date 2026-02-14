import React, { useState, useEffect, useMemo } from 'react';
import {
    Thermometer, Droplets, Wind, Sun, Activity, Cloud, ArrowLeft, RefreshCw,
    TrendingUp, TrendingDown, Calendar, BarChart3, Loader2, ChevronDown
} from 'lucide-react';
import { fetchClimaRango, fetchActualClima, fetchStations } from '../services/api';
import { Station, WeatherData } from '../types';
import WeatherChart from './WeatherChart';

interface AdminDashboardProps {
    onBack: () => void;
}

// --- Funciones de cálculo de agregados ---

const calcDailyAggregates = (data: WeatherData[]) => {
    if (!data.length) return [];

    // Agrupar por día
    const byDay: Record<string, WeatherData[]> = {};
    data.forEach(d => {
        const day = d.timestamp.substring(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(d);
    });

    return Object.entries(byDay).map(([day, records]) => {
        const temps = records.map(r => r.temperature).filter((v): v is number => v !== null && v !== undefined);
        const humids = records.map(r => r.humidity).filter((v): v is number => v !== null && v !== undefined);
        const winds = records.map(r => r.windSpeed).filter((v): v is number => v !== null && v !== undefined);
        const rains = records.map(r => r.rainfall).filter((v): v is number => v !== null && v !== undefined);
        const radiations = records.map(r => r.solarRadiation).filter((v): v is number => v !== null && v !== undefined);
        const pressures = records.map(r => r.pressure).filter((v): v is number => v !== null && v !== undefined);
        const pm25s = records.map(r => r.pm25).filter((v): v is number => v !== null && v !== undefined);
        const pm10s = records.map(r => r.pm10).filter((v): v is number => v !== null && v !== undefined);

        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) : null;

        // Horas de sol: minutos con radiación > 120 W/m²
        const sunMinutes = radiations.filter(r => r > 120).length * 15; // cada registro = 15min aprox
        const sunHours = sunMinutes / 60;

        // GDD (Growing Degree Days) - Base 10°C
        const tMax = temps.length ? Math.max(...temps) : null;
        const tMin = temps.length ? Math.min(...temps) : null;
        const gdd = tMax !== null && tMin !== null ? Math.max(0, ((tMax + tMin) / 2) - 10) : null;

        // HDD/CDD (Heating/Cooling Degree Days) - Base 18°C
        const tAvg = avg(temps);
        const hdd = tAvg !== null ? Math.max(0, 18 - tAvg) : null;
        const cdd = tAvg !== null ? Math.max(0, tAvg - 18) : null;

        return {
            day,
            records: records.length,
            temp_max: tMax,
            temp_min: tMin,
            temp_avg: avg(temps),
            temp_range: tMax !== null && tMin !== null ? tMax - tMin : null,
            humidity_avg: avg(humids),
            humidity_max: humids.length ? Math.max(...humids) : null,
            humidity_min: humids.length ? Math.min(...humids) : null,
            wind_avg: avg(winds),
            wind_max: winds.length ? Math.max(...winds) : null, // Racha máxima
            rain_total: sum(rains),
            rain_max_intensity: rains.length ? Math.max(...rains) : null,
            rain_hours: rains.filter(r => r > 0).length,
            pressure_avg: avg(pressures),
            pressure_max: pressures.length ? Math.max(...pressures) : null,
            pressure_min: pressures.length ? Math.min(...pressures) : null,
            radiation_avg: avg(radiations),
            radiation_max: radiations.length ? Math.max(...radiations) : null,
            sun_hours: sunHours,
            pm25_avg: avg(pm25s),
            pm25_max: pm25s.length ? Math.max(...pm25s) : null,
            pm10_avg: avg(pm10s),
            pm10_max: pm10s.length ? Math.max(...pm10s) : null,
            gdd,
            hdd,
            cdd
        };
    }).sort((a, b) => a.day.localeCompare(b.day));
};

const calcMonthlyAggregates = (dailyData: ReturnType<typeof calcDailyAggregates>) => {
    if (!dailyData.length) return [];

    const byMonth: Record<string, typeof dailyData> = {};
    dailyData.forEach(d => {
        const month = d.day.substring(0, 7);
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(d);
    });

    return Object.entries(byMonth).map(([month, days]) => {
        const temps = days.map(d => d.temp_avg).filter((v): v is number => v !== null);
        const rains = days.map(d => d.rain_total).filter((v): v is number => v !== null);
        const sunHours = days.map(d => d.sun_hours).filter((v): v is number => v !== null);
        const gdds = days.map(d => d.gdd).filter((v): v is number => v !== null);

        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) : null;

        return {
            month,
            days_count: days.length,
            temp_avg: avg(temps),
            temp_max_abs: Math.max(...days.map(d => d.temp_max).filter((v): v is number => v !== null)),
            temp_min_abs: Math.min(...days.map(d => d.temp_min).filter((v): v is number => v !== null)),
            rain_total: sum(rains),
            rain_days: rains.filter(r => r > 0.2).length, // Días con lluvia > 0.2mm
            sun_hours_total: sum(sunHours),
            gdd_total: sum(gdds),
        };
    }).sort((a, b) => a.month.localeCompare(b.month));
};

// AQI calculation
const getAQI_PM25 = (pm25: number): { level: string; color: string; bg: string } => {
    if (pm25 <= 12) return { level: 'Buena', color: 'text-green-700', bg: 'bg-green-100' };
    if (pm25 <= 35.4) return { level: 'Moderada', color: 'text-yellow-700', bg: 'bg-yellow-100' };
    if (pm25 <= 55.4) return { level: 'Insalubre (Sensibles)', color: 'text-orange-700', bg: 'bg-orange-100' };
    if (pm25 <= 150.4) return { level: 'Insalubre', color: 'text-red-700', bg: 'bg-red-100' };
    return { level: 'Peligrosa', color: 'text-purple-700', bg: 'bg-purple-100' };
};

// --- Componentes UI ---

const StatCard: React.FC<{
    label: string;
    value: string | number | null;
    unit?: string;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    colorClass?: string;
    subValue?: string;
}> = ({ label, value, unit, icon, trend, colorClass = 'bg-white', subValue }) => (
    <div className={`${colorClass} rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow`}>
        <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            {icon && <span className="text-slate-300">{icon}</span>}
        </div>
        <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-800">
                {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(1) : value) : '--'}
            </span>
            {unit && <span className="text-xs font-bold text-slate-400">{unit}</span>}
            {trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500 ml-1" />}
            {trend === 'down' && <TrendingDown className="w-4 h-4 text-blue-500 ml-1" />}
        </div>
        {subValue && <p className="text-[10px] text-slate-400 mt-1 font-medium">{subValue}</p>}
    </div>
);

// --- Component Principal ---

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<string>('');
    const [historyData, setHistoryData] = useState<WeatherData[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingStations, setLoadingStations] = useState(true);
    const [dateRange, setDateRange] = useState<'7D' | '30D' | '90D' | '1A'>('30D');
    const [activeTab, setActiveTab] = useState<'diario' | 'mensual' | 'aire' | 'confort'>('diario');

    // Load stations
    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchStations();
                setStations(data);
                if (data.length > 0) setSelectedStation(data[0].id);
            } catch (e) {
                console.error('Error loading stations:', e);
            } finally {
                setLoadingStations(false);
            }
        };
        load();
    }, []);

    // Load history when station or range changes
    useEffect(() => {
        if (!selectedStation) return;

        const loadHistory = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const start = new Date();

                switch (dateRange) {
                    case '7D': start.setDate(now.getDate() - 7); break;
                    case '30D': start.setDate(now.getDate() - 30); break;
                    case '90D': start.setDate(now.getDate() - 90); break;
                    case '1A': start.setFullYear(now.getFullYear() - 1); break;
                }

                const data = await fetchClimaRango(
                    selectedStation,
                    start.toISOString(),
                    now.toISOString()
                );
                setHistoryData(data);
            } catch (e) {
                console.error('Error loading history:', e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [selectedStation, dateRange]);

    const dailyAggregates = useMemo(() => calcDailyAggregates(historyData), [historyData]);
    const monthlyAggregates = useMemo(() => calcMonthlyAggregates(dailyAggregates), [dailyAggregates]);

    // Summary stats
    const summary = useMemo(() => {
        if (!dailyAggregates.length) return null;
        const temps = dailyAggregates.map(d => d.temp_avg).filter((v): v is number => v !== null);
        const rains = dailyAggregates.map(d => d.rain_total).filter((v): v is number => v !== null);
        const winds = dailyAggregates.map(d => d.wind_max).filter((v): v is number => v !== null);
        const pm25s = dailyAggregates.map(d => d.pm25_avg).filter((v): v is number => v !== null);

        return {
            temp_avg: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
            temp_max: temps.length ? Math.max(...dailyAggregates.map(d => d.temp_max).filter((v): v is number => v !== null)) : null,
            temp_min: temps.length ? Math.min(...dailyAggregates.map(d => d.temp_min).filter((v): v is number => v !== null)) : null,
            rain_total: rains.reduce((a, b) => a + b, 0),
            rain_days: rains.filter(r => r > 0.2).length,
            wind_max: winds.length ? Math.max(...winds) : null,
            pm25_avg: pm25s.length ? pm25s.reduce((a, b) => a + b, 0) / pm25s.length : null,
            total_days: dailyAggregates.length,
            total_records: historyData.length,
            gdd_total: dailyAggregates.reduce((acc, d) => acc + (d.gdd || 0), 0),
            sun_hours_total: dailyAggregates.reduce((acc, d) => acc + (d.sun_hours || 0), 0),
        };
    }, [dailyAggregates, historyData]);

    const stationName = stations.find(s => s.id === selectedStation)?.name || 'Estación';

    return (
        <div className="h-screen w-screen bg-slate-50 text-slate-800 font-inter overflow-hidden flex flex-col">
            {/* Top Bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors group"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl">
                            <BarChart3 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-slate-800">Panel de Análisis Avanzado</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observatorio UTPL • Agregados Meteorológicos</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Station Selector */}
                    <div className="relative">
                        <select
                            value={selectedStation}
                            onChange={(e) => setSelectedStation(e.target.value)}
                            className="appearance-none pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 cursor-pointer"
                        >
                            {stations.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Date Range */}
                    <div className="bg-slate-100 rounded-xl p-1 flex gap-0.5">
                        {(['7D', '30D', '90D', '1A'] as const).map(r => (
                            <button
                                key={r}
                                onClick={() => setDateRange(r)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateRange === r
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-500 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading || loadingStations ? (
                    <div className="flex items-center justify-center h-64 gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-sm font-bold text-slate-500">Procesando datos de {stationName}...</span>
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                            <StatCard label="Registros" value={summary?.total_records || 0} icon={<Activity className="w-4 h-4" />} subValue={`${summary?.total_days || 0} días`} />
                            <StatCard label="T° Promedio" value={summary?.temp_avg ?? null} unit="°C" icon={<Thermometer className="w-4 h-4" />} />
                            <StatCard label="T° Máxima" value={summary?.temp_max ?? null} unit="°C" trend="up" icon={<Thermometer className="w-4 h-4" />} />
                            <StatCard label="T° Mínima" value={summary?.temp_min ?? null} unit="°C" trend="down" icon={<Thermometer className="w-4 h-4" />} />
                            <StatCard label="Lluvia Acum." value={summary?.rain_total ?? null} unit="mm" icon={<Cloud className="w-4 h-4" />} subValue={`${summary?.rain_days || 0} días con lluvia`} />
                            <StatCard label="Racha Máx." value={summary?.wind_max ?? null} unit="m/s" icon={<Wind className="w-4 h-4" />} />
                        </div>

                        {/* Calculated metrics row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                            <StatCard label="GDD Acumulado" value={summary?.gdd_total ?? null} colorClass="bg-emerald-50" icon={<TrendingUp className="w-4 h-4" />} subValue="Base 10°C (Agricultura)" />
                            <StatCard label="Horas de Sol" value={summary?.sun_hours_total ?? null} unit="h" colorClass="bg-amber-50" icon={<Sun className="w-4 h-4" />} subValue="Radiación > 120 W/m²" />
                            {summary?.pm25_avg !== null && summary?.pm25_avg !== undefined && (
                                <div className={`${getAQI_PM25(summary.pm25_avg).bg} rounded-2xl p-4 border border-slate-100 shadow-sm`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">PM2.5 Promedio</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black text-slate-800">{summary.pm25_avg.toFixed(1)}</span>
                                        <span className="text-xs font-bold text-slate-400">µg/m³</span>
                                    </div>
                                    <span className={`text-[10px] font-black ${getAQI_PM25(summary.pm25_avg).color}`}>
                                        Calidad: {getAQI_PM25(summary.pm25_avg).level}
                                    </span>
                                </div>
                            )}
                            <StatCard label="Amplitud Térmica" value={(summary?.temp_max != null && summary?.temp_min != null) ? (summary.temp_max - summary.temp_min) : null} unit="°C" icon={<Activity className="w-4 h-4" />} subValue="Rango Tmax - Tmin" />
                        </div>

                        {/* Tabs */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="flex border-b border-slate-200">
                                {[
                                    { key: 'diario', label: 'Agregados Diarios', icon: <Calendar className="w-4 h-4" /> },
                                    { key: 'mensual', label: 'Agregados Mensuales', icon: <BarChart3 className="w-4 h-4" /> },
                                    { key: 'aire', label: 'Calidad del Aire', icon: <Activity className="w-4 h-4" /> },
                                    { key: 'confort', label: 'Confort & Energía', icon: <Sun className="w-4 h-4" /> },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key as any)}
                                        className={`flex-1 px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-all border-b-2 ${activeTab === tab.key
                                            ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                                            : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="p-5">
                                {/* DIARIO TAB */}
                                {activeTab === 'diario' && (
                                    <div>
                                        <h3 className="text-sm font-black text-slate-700 mb-4">📊 Resumen Diario — {stationName}</h3>
                                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                        <th className="px-3 py-2.5 text-left">Fecha</th>
                                                        <th className="px-3 py-2.5 text-center">Reg.</th>
                                                        <th className="px-3 py-2.5 text-center">T°Max</th>
                                                        <th className="px-3 py-2.5 text-center">T°Min</th>
                                                        <th className="px-3 py-2.5 text-center">T°Prom</th>
                                                        <th className="px-3 py-2.5 text-center">Amplitud</th>
                                                        <th className="px-3 py-2.5 text-center">Hum%</th>
                                                        <th className="px-3 py-2.5 text-center">Lluvia</th>
                                                        <th className="px-3 py-2.5 text-center">Racha</th>
                                                        <th className="px-3 py-2.5 text-center">Sol</th>
                                                        <th className="px-3 py-2.5 text-center">GDD</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {dailyAggregates.map((d, i) => (
                                                        <tr key={d.day} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 transition-colors`}>
                                                            <td className="px-3 py-2 font-bold text-slate-700">{d.day}</td>
                                                            <td className="px-3 py-2 text-center text-slate-400">{d.records}</td>
                                                            <td className="px-3 py-2 text-center font-bold text-red-600">{d.temp_max?.toFixed(1) ?? '--'}</td>
                                                            <td className="px-3 py-2 text-center font-bold text-blue-600">{d.temp_min?.toFixed(1) ?? '--'}</td>
                                                            <td className="px-3 py-2 text-center font-medium">{d.temp_avg?.toFixed(1) ?? '--'}</td>
                                                            <td className="px-3 py-2 text-center text-slate-500">{d.temp_range?.toFixed(1) ?? '--'}°</td>
                                                            <td className="px-3 py-2 text-center">{d.humidity_avg?.toFixed(0) ?? '--'}%</td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`font-bold ${(d.rain_total || 0) > 5 ? 'text-blue-700' : (d.rain_total || 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                                                                    {d.rain_total?.toFixed(1) ?? '0.0'} mm
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">{d.wind_max?.toFixed(1) ?? '--'} m/s</td>
                                                            <td className="px-3 py-2 text-center text-amber-600 font-medium">{d.sun_hours.toFixed(1)}h</td>
                                                            <td className="px-3 py-2 text-center text-emerald-600 font-medium">{d.gdd?.toFixed(1) ?? '--'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {dailyAggregates.length === 0 && (
                                            <p className="text-center text-slate-400 text-sm py-8">No hay datos disponibles para el rango seleccionado</p>
                                        )}
                                    </div>
                                )}

                                {/* MENSUAL TAB */}
                                {activeTab === 'mensual' && (
                                    <div>
                                        <h3 className="text-sm font-black text-slate-700 mb-4">📅 Resumen Mensual — {stationName}</h3>
                                        {monthlyAggregates.length > 0 ? (
                                            <div className="space-y-4">
                                                {monthlyAggregates.map(m => (
                                                    <div key={m.month} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className="text-sm font-black text-slate-700">
                                                                {new Date(m.month + '-01').toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}
                                                            </h4>
                                                            <span className="text-[10px] font-bold text-slate-400">{m.days_count} días de datos</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            <div>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">T° Promedio</span>
                                                                <p className="text-lg font-black text-slate-800">{m.temp_avg?.toFixed(1) ?? '--'}°C</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">Extremos</span>
                                                                <p className="text-sm font-bold">
                                                                    <span className="text-red-600">{m.temp_max_abs?.toFixed(1) ?? '--'}°</span> / <span className="text-blue-600">{m.temp_min_abs?.toFixed(1) ?? '--'}°</span>
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">Precipitación</span>
                                                                <p className="text-lg font-black text-blue-700">{m.rain_total?.toFixed(1) ?? '0.0'} mm</p>
                                                                <span className="text-[10px] text-slate-400">{m.rain_days} días con lluvia</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">Horas de Sol</span>
                                                                <p className="text-lg font-black text-amber-600">{m.sun_hours_total?.toFixed(0) ?? '0'}h</p>
                                                            </div>
                                                        </div>
                                                        {m.gdd_total !== null && (
                                                            <div className="mt-2 pt-2 border-t border-slate-200 flex gap-6">
                                                                <span className="text-[10px]">
                                                                    <strong className="text-emerald-600">GDD Acumulado:</strong> {m.gdd_total?.toFixed(1)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-center text-slate-400 text-sm py-8">Selecciona un rango mayor para ver datos mensuales (≥30D)</p>
                                        )}
                                    </div>
                                )}

                                {/* AIRE TAB */}
                                {activeTab === 'aire' && (
                                    <div>
                                        <h3 className="text-sm font-black text-slate-700 mb-4">🌬️ Calidad del Aire — {stationName}</h3>
                                        <div className="space-y-4">
                                            {/* AQI Info */}
                                            <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 border border-blue-100">
                                                <h4 className="text-xs font-black text-blue-800 mb-2">Índice de Calidad del Aire (AQI - EPA)</h4>
                                                <div className="flex gap-2 flex-wrap">
                                                    {[
                                                        { range: '0-12', level: 'Buena', color: 'bg-green-500' },
                                                        { range: '12-35', level: 'Moderada', color: 'bg-yellow-500' },
                                                        { range: '35-55', level: 'Insalubre (S)', color: 'bg-orange-500' },
                                                        { range: '55-150', level: 'Insalubre', color: 'bg-red-500' },
                                                        { range: '>150', level: 'Peligrosa', color: 'bg-purple-500' },
                                                    ].map(a => (
                                                        <div key={a.range} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                                                            <div className={`w-3 h-3 rounded-full ${a.color}`} />
                                                            {a.range} µg/m³ = {a.level}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Air quality table */}
                                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                            <th className="px-3 py-2.5 text-left">Fecha</th>
                                                            <th className="px-3 py-2.5 text-center">PM2.5 Prom</th>
                                                            <th className="px-3 py-2.5 text-center">PM2.5 Máx</th>
                                                            <th className="px-3 py-2.5 text-center">PM10 Prom</th>
                                                            <th className="px-3 py-2.5 text-center">PM10 Máx</th>
                                                            <th className="px-3 py-2.5 text-center">Calidad</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dailyAggregates.filter(d => d.pm25_avg !== null).map((d, i) => (
                                                            <tr key={d.day} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50`}>
                                                                <td className="px-3 py-2 font-bold text-slate-700">{d.day}</td>
                                                                <td className="px-3 py-2 text-center font-medium">{d.pm25_avg?.toFixed(1)}</td>
                                                                <td className="px-3 py-2 text-center font-bold text-orange-600">{d.pm25_max?.toFixed(1)}</td>
                                                                <td className="px-3 py-2 text-center font-medium">{d.pm10_avg?.toFixed(1)}</td>
                                                                <td className="px-3 py-2 text-center font-bold text-orange-600">{d.pm10_max?.toFixed(1)}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {d.pm25_avg !== null && (
                                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${getAQI_PM25(d.pm25_avg).bg} ${getAQI_PM25(d.pm25_avg).color}`}>
                                                                            {getAQI_PM25(d.pm25_avg).level}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {dailyAggregates.filter(d => d.pm25_avg !== null).length === 0 && (
                                                <p className="text-center text-slate-400 text-sm py-8">Esta estación no cuenta con sensores de calidad del aire (PM2.5/PM10)</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* CONFORT TAB */}
                                {activeTab === 'confort' && (
                                    <div>
                                        <h3 className="text-sm font-black text-slate-700 mb-4">🌡️ Confort Humano & Energía — {stationName}</h3>
                                        <div className="space-y-4">
                                            {/* Degree Days explanation */}
                                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                                                <h4 className="text-xs font-black text-emerald-800 mb-2">Grados-Día (Degree Days)</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-emerald-700">
                                                    <div>
                                                        <strong>GDD (Growing):</strong> Base 10°C. Predice desarrollo de cultivos. GDD = max(0, T_avg - 10)
                                                    </div>
                                                    <div>
                                                        <strong>HDD (Heating):</strong> Base 18°C. Demanda de calefacción. HDD = max(0, 18 - T_avg)
                                                    </div>
                                                    <div>
                                                        <strong>CDD (Cooling):</strong> Base 18°C. Demanda de A/C. CDD = max(0, T_avg - 18)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Degree days table */}
                                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                            <th className="px-3 py-2.5 text-left">Fecha</th>
                                                            <th className="px-3 py-2.5 text-center">T° Prom</th>
                                                            <th className="px-3 py-2.5 text-center">GDD</th>
                                                            <th className="px-3 py-2.5 text-center">HDD</th>
                                                            <th className="px-3 py-2.5 text-center">CDD</th>
                                                            <th className="px-3 py-2.5 text-center">Horas Sol</th>
                                                            <th className="px-3 py-2.5 text-center">Rad. Máx</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dailyAggregates.map((d, i) => (
                                                            <tr key={d.day} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50`}>
                                                                <td className="px-3 py-2 font-bold text-slate-700">{d.day}</td>
                                                                <td className="px-3 py-2 text-center">{d.temp_avg?.toFixed(1) ?? '--'}°C</td>
                                                                <td className="px-3 py-2 text-center font-bold text-emerald-600">{d.gdd?.toFixed(1) ?? '--'}</td>
                                                                <td className="px-3 py-2 text-center font-bold text-blue-600">{d.hdd?.toFixed(1) ?? '--'}</td>
                                                                <td className="px-3 py-2 text-center font-bold text-red-600">{d.cdd?.toFixed(1) ?? '--'}</td>
                                                                <td className="px-3 py-2 text-center text-amber-600 font-medium">{d.sun_hours.toFixed(1)}h</td>
                                                                <td className="px-3 py-2 text-center">{d.radiation_max?.toFixed(0) ?? '--'} W/m²</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Cumulative summary */}
                                            {dailyAggregates.length > 0 && (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <StatCard
                                                        label="GDD Acumulado"
                                                        value={dailyAggregates.reduce((acc, d) => acc + (d.gdd || 0), 0)}
                                                        colorClass="bg-emerald-50"
                                                        subValue="Crecimiento vegetal"
                                                    />
                                                    <StatCard
                                                        label="HDD Acumulado"
                                                        value={dailyAggregates.reduce((acc, d) => acc + (d.hdd || 0), 0)}
                                                        colorClass="bg-blue-50"
                                                        subValue="Demanda calefacción"
                                                    />
                                                    <StatCard
                                                        label="CDD Acumulado"
                                                        value={dailyAggregates.reduce((acc, d) => acc + (d.cdd || 0), 0)}
                                                        colorClass="bg-red-50"
                                                        subValue="Demanda enfriamiento"
                                                    />
                                                    <StatCard
                                                        label="Horas Sol Total"
                                                        value={dailyAggregates.reduce((acc, d) => acc + d.sun_hours, 0)}
                                                        unit="h"
                                                        colorClass="bg-amber-50"
                                                        subValue="Potencial fotovoltaico"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Thermometer, Droplets, Wind, Sun, Activity, Cloud, ArrowLeft, RefreshCw,
    TrendingUp, TrendingDown, Calendar, BarChart3, Loader2, ChevronDown,
    Settings, Download, Layers, Map as MapIcon, Save, X, SlidersHorizontal
} from 'lucide-react';
import { fetchClimaRango, fetchActualClima, fetchStations, fetchLluvia } from '../services/api';
import { Station, WeatherData } from '../types';
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend, ResponsiveContainer, Area, Brush, BarChart, Cell
} from 'recharts';
import WindRoseChart from './WindRoseChart';
import {
    calcExtraterrestrialRadiation, calcET0Hargreaves, calcDewPoint, calcHeatIndex,
    validateDailyData, getDayOfYear, getDominantWindDirection, QualityFlags
} from '../utils/climateCalcs';

interface AdminDashboardProps {
    onBack: () => void;
}

// --- Helpers de fecha/hora local ---

/** Convierte ISO-UTC a fecha local YYYY-MM-DD (para agrupar por día correctamente) */
const toLocalDay = (isoStr: string): string => {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Convierte ISO-UTC a hora local formateada para el eje X, adaptada al rango */
const formatLocalTime = (isoStr: string, resolution: string, range: string): string => {
    const d = new Date(isoStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('es-EC', { month: 'short' });

    if (resolution === '15min') {
        // 1D: solo hora;  3D: día+hora
        if (range === '1D') return `${hh}:${mm}`;
        return `${dd}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`;
    }
    if (resolution === 'horario') {
        // 3D-7D: día+hora
        if (range === '1D' || range === '3D') return `${hh}:${mm}`;
        return `${dd}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}h`;
    }
    // diario o más: 1M→ dd Mon, 3M/1Y→ Mon 'YY
    if (range === '1Y') return `${mon} '${String(d.getFullYear()).slice(2)}`;
    if (range === '3M') return `${dd} ${mon}`;
    return `${dd}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Formatea día local "YYYY-MM-DD" para tick de eje X diario */
const formatDayTick = (day: string, range: string): string => {
    const d = new Date(day + 'T12:00:00'); // mediodía para evitar shift de TZ
    const dd = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('es-EC', { month: 'short' });
    if (range === '1Y') return `${mon} '${String(d.getFullYear()).slice(2)}`;
    if (range === '3M') return `${dd} ${mon}`;
    return `${dd}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Funciones de cálculo de agregados ---

const inferMinutesPerRecord = (data: WeatherData[]): number => {
    if (data.length < 2) return 15;
    const deltas: number[] = [];
    for (let i = 1; i < Math.min(data.length, 50); i++) {
        const t1 = new Date(data[i - 1].timestamp).getTime();
        const t2 = new Date(data[i].timestamp).getTime();
        const diffMin = Math.abs(t2 - t1) / 60000;
        if (diffMin > 0) deltas.push(diffMin);
    }
    if (!deltas.length) return 15;
    deltas.sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length / 2)];
};

const resolutionToMinutes = (resolution: string, data: WeatherData[]): number => {
    switch (resolution) {
        case '15min': return 15;
        case 'horario': return 60;
        case 'diario': return 1440;
        default: return inferMinutesPerRecord(data);
    }
};

const calcDailyAggregates = (data: WeatherData[], minutesPerRecord: number = 15, latitude: number = -4.0) => {
    if (!data.length) return [];

    const byDay: Record<string, WeatherData[]> = {};
    data.forEach(d => {
        const day = toLocalDay(d.timestamp);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(d);
    });

    const expectedRecords = Math.round(1440 / minutesPerRecord);

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

        const sunMinutes = radiations.filter(r => r > 120).length * minutesPerRecord;
        const sunHours = sunMinutes / 60;

        const tMax = temps.length ? Math.max(...temps) : null;
        const tMin = temps.length ? Math.min(...temps) : null;
        const gdd = tMax !== null && tMin !== null ? Math.max(0, ((tMax + tMin) / 2) - 10) : null;

        const tAvg = avg(temps);
        const hdd = tAvg !== null ? Math.max(0, 18 - tAvg) : null;
        const cdd = tAvg !== null ? Math.max(0, tAvg - 18) : null;

        const completeness = records.length / expectedRecords;
        const quality = validateDailyData(records);

        const dayOfYear = getDayOfYear(day);
        const Ra = calcExtraterrestrialRadiation(latitude, dayOfYear);
        const et0 = tAvg !== null && tMax !== null && tMin !== null
            ? calcET0Hargreaves(tAvg, tMax, tMin, Ra) : null;
        const humAvg = avg(humids);
        const dewPoint = tAvg !== null && humAvg !== null ? calcDewPoint(tAvg, humAvg) : null;
        const heatIndex = tAvg !== null && humAvg !== null ? calcHeatIndex(tAvg, humAvg) : null;

        const windDominantDir = getDominantWindDirection(records);

        return {
            day,
            records: records.length,
            expected_records: expectedRecords,
            completeness,
            quality,
            temp_max: tMax,
            temp_min: tMin,
            temp_avg: tAvg,
            temp_range: tMax !== null && tMin !== null ? tMax - tMin : null,
            humidity_avg: humAvg,
            humidity_max: humids.length ? Math.max(...humids) : null,
            humidity_min: humids.length ? Math.min(...humids) : null,
            wind_avg: avg(winds),
            wind_max: winds.length ? Math.max(...winds) : null,
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
            cdd,
            et0,
            dew_point: dewPoint,
            heat_index: heatIndex,
            wind_dominant_dir: windDominantDir,
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
        const et0s = days.map(d => d.et0).filter((v): v is number => v !== null);
        const dewPoints = days.map(d => d.dew_point).filter((v): v is number => v !== null);

        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const sum = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) : null;

        return {
            month,
            days_count: days.length,
            temp_avg: avg(temps),
            temp_max_abs: Math.max(...days.map(d => d.temp_max).filter((v): v is number => v !== null)),
            temp_min_abs: Math.min(...days.map(d => d.temp_min).filter((v): v is number => v !== null)),
            rain_total: sum(rains),
            rain_days: rains.filter(r => r > 0.2).length,
            sun_hours_total: sum(sunHours),
            gdd_total: sum(gdds),
            et0_total: sum(et0s),
            dew_point_avg: avg(dewPoints),
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

// --- Catálogo de variables para gráficos de red ---

type NetworkVarKey = 'temperature' | 'humidity' | 'rainfall' | 'windSpeed' | 'solarRadiation' | 'pressure' | 'pm25';

interface NetworkVarDef {
    key: NetworkVarKey;
    label: string;
    unit: string;
    color: string;
    icon: React.ReactNode;
    decimals: number;
    extract: (d: WeatherData) => number | null | undefined;
}

const NETWORK_VARIABLES: NetworkVarDef[] = [
    { key: 'temperature', label: 'Temperatura', unit: '°C', color: '#ef4444', icon: <Thermometer className="w-4 h-4 text-red-500" />, decimals: 1, extract: d => d.temperature },
    { key: 'rainfall', label: 'Lluvia', unit: 'mm', color: '#3b82f6', icon: <Cloud className="w-4 h-4 text-blue-500" />, decimals: 1, extract: d => d.rainfall },
    { key: 'windSpeed', label: 'Viento', unit: 'm/s', color: '#6366f1', icon: <Wind className="w-4 h-4 text-indigo-500" />, decimals: 1, extract: d => d.windSpeed },
    { key: 'humidity', label: 'Humedad', unit: '%', color: '#8b5cf6', icon: <Droplets className="w-4 h-4 text-violet-500" />, decimals: 0, extract: d => d.humidity },
    { key: 'solarRadiation', label: 'Radiación', unit: 'W/m²', color: '#f59e0b', icon: <Sun className="w-4 h-4 text-amber-500" />, decimals: 0, extract: d => d.solarRadiation },
    { key: 'pressure', label: 'Presión', unit: 'hPa', color: '#64748b', icon: <Activity className="w-4 h-4 text-slate-500" />, decimals: 1, extract: d => d.pressure },
    { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', color: '#d946ef', icon: <Activity className="w-4 h-4 text-fuchsia-500" />, decimals: 1, extract: d => d.pm25 },
];

const DEFAULT_NETWORK_VARS: NetworkVarKey[] = ['temperature', 'rainfall', 'windSpeed'];

const loadNetworkVarSelection = (): NetworkVarKey[] => {
    try {
        const saved = localStorage.getItem('network_chart_vars');
        if (saved) {
            const parsed = JSON.parse(saved) as string[];
            const valid = parsed.filter(k => NETWORK_VARIABLES.some(v => v.key === k)) as NetworkVarKey[];
            return valid.length >= 1 ? valid : DEFAULT_NETWORK_VARS;
        }
    } catch { /* ignore */ }
    return DEFAULT_NETWORK_VARS;
};

// --- Component Principal ---

type DateRangeType = '1D' | '3D' | '7D' | '1M' | '3M' | '1Y' | 'custom';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
    // --- State ---
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<string>('');
    const [historyData, setHistoryData] = useState<WeatherData[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingStations, setLoadingStations] = useState(true);
    const [dataResolution, setDataResolution] = useState<string>('15min');

    // Nuevos estados de modo
    const [mode, setMode] = useState<'red' | 'estacion'>('red');
    const [viewMode, setViewMode] = useState<'graficos' | 'tabla'>('graficos');
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [dateRange, setDateRange] = useState<DateRangeType>('7D');
    const [customDates, setCustomDates] = useState({ start: '', end: '' });

    // Red de Estaciones state
    const [networkData, setNetworkData] = useState<{ station: Station; data: WeatherData | null }[]>([]);
    const [networkLoading, setNetworkLoading] = useState(false);

    // Hietograma state (lazy load)
    const [hietogramaData, setHietogramaData] = useState<WeatherData[]>([]);
    const [hietogramaLoading, setHietogramaLoading] = useState(false);
    const [showHietograma, setShowHietograma] = useState(false);

    // Network chart variable selection (Opción B)
    const [selectedNetVars, setSelectedNetVars] = useState<NetworkVarKey[]>(loadNetworkVarSelection);
    const [showVarPicker, setShowVarPicker] = useState(false);
    const [hoveredStation, setHoveredStation] = useState<string | null>(null);
    const varPickerRef = useRef<HTMLDivElement>(null);

    // Close var picker on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (varPickerRef.current && !varPickerRef.current.contains(e.target as Node)) {
                setShowVarPicker(false);
            }
        };
        if (showVarPicker) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showVarPicker]);

    const toggleNetVar = useCallback((key: NetworkVarKey) => {
        setSelectedNetVars(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (next.length < 1) return prev; // mínimo 1
            if (next.length > 4) return prev; // máximo 4
            localStorage.setItem('network_chart_vars', JSON.stringify(next));
            return next;
        });
    }, []);

    // Configuración del Visor
    const [viewerConfig, setViewerConfig] = useState(() => {
        const saved = localStorage.getItem('visor_config');
        return saved ? JSON.parse(saved) : {
            showWind: true,
            showRadar: true,
            showTemp: true,
            defaultStation: '6782',
            theme: 'light'
        };
    });

    // --- Funciones de navegación ---
    const switchToStation = (stationId: string) => {
        setSelectedStation(stationId);
        setMode('estacion');
    };

    const switchToNetwork = () => {
        setMode('red');
    };

    // --- Variable derivada ---
    const isRawResolution = dataResolution === '15min' || dataResolution === 'horario';

    // --- Effects ---

    // Load stations
    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchStations();
                setStations(data);
                if (data.length > 0 && !selectedStation) setSelectedStation(data[0].id);
            } catch (e) {
                console.error('Error loading stations:', e);
            } finally {
                setLoadingStations(false);
            }
        };
        load();
    }, []);

    // Load network data on mount (Red es landing)
    useEffect(() => {
        if (stations.length === 0 || networkData.length > 0) return;

        const loadNetworkData = async () => {
            setNetworkLoading(true);
            try {
                const results = await Promise.allSettled(
                    stations.map(async (station) => {
                        const data = await fetchActualClima(station.id);
                        return { station, data };
                    })
                );
                const networkResults = results.map((result, i) => {
                    if (result.status === 'fulfilled') return result.value;
                    return { station: stations[i], data: null };
                });
                setNetworkData(networkResults);
            } catch (e) {
                console.error('Error loading network data:', e);
            } finally {
                setNetworkLoading(false);
            }
        };
        loadNetworkData();
    }, [stations]);

    // Load history when station or range changes — solo en modo estación
    useEffect(() => {
        if (!selectedStation || mode !== 'estacion') return;

        const loadHistory = async () => {
            setLoading(true);
            setShowHietograma(false);
            setHietogramaData([]);
            try {
                const now = new Date();
                let start = new Date();
                let end = new Date();

                if (dateRange === 'custom') {
                    if (!customDates.start || !customDates.end) {
                        setLoading(false);
                        return;
                    }
                    start = new Date(customDates.start + 'T00:00:00');
                    end = new Date(customDates.end + 'T23:59:59');
                } else {
                    switch (dateRange) {
                        case '1D': start.setDate(now.getDate() - 1); break;
                        case '3D': start.setDate(now.getDate() - 3); break;
                        case '7D': start.setDate(now.getDate() - 7); break;
                        case '1M': start.setMonth(now.getMonth() - 1); break;
                        case '3M': start.setMonth(now.getMonth() - 3); break;
                        case '1Y': start.setFullYear(now.getFullYear() - 1); break;
                    }
                }

                const result = await fetchClimaRango(
                    selectedStation,
                    start.toISOString(),
                    end.toISOString()
                );
                console.log(`📊 Admin: resolución detectada = ${result.resolution}`);
                setDataResolution(result.resolution);
                setHistoryData(result.data);
            } catch (e) {
                console.error('Error loading history:', e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [mode, selectedStation, dateRange, customDates]);

    // --- Memos ---
    const minutesPerRecord = useMemo(() => resolutionToMinutes(dataResolution, historyData), [dataResolution, historyData]);

    const dailyAggregates = useMemo(() => {
        const station = stations.find(s => s.id === selectedStation);
        const lat = station?.location.lat ?? -4.0;
        return calcDailyAggregates(historyData, minutesPerRecord, lat);
    }, [historyData, minutesPerRecord, stations, selectedStation]);

    const monthlyAggregates = useMemo(() => calcMonthlyAggregates(dailyAggregates), [dailyAggregates]);

    const summary = useMemo(() => {
        if (!dailyAggregates.length) return null;
        const temps = dailyAggregates.map(d => d.temp_avg).filter((v): v is number => v !== null);
        const rains = dailyAggregates.map(d => d.rain_total).filter((v): v is number => v !== null);
        const winds = dailyAggregates.map(d => d.wind_max).filter((v): v is number => v !== null);
        const pm25s = dailyAggregates.map(d => d.pm25_avg).filter((v): v is number => v !== null);
        const completes = dailyAggregates.map(d => d.completeness);

        let maxDryDays = 0;
        let currentDry = 0;
        for (const d of dailyAggregates) {
            if ((d.rain_total ?? 0) < 0.2) {
                currentDry++;
                if (currentDry > maxDryDays) maxDryDays = currentDry;
            } else {
                currentDry = 0;
            }
        }

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
            avg_completeness: completes.length ? completes.reduce((a, b) => a + b, 0) / completes.length : 0,
            low_quality_days: dailyAggregates.filter(d => d.completeness < 0.75).length,
            consecutive_dry_days: maxDryDays,
        };
    }, [dailyAggregates, historyData]);

    const stationName = stations.find(s => s.id === selectedStation)?.name || 'Estación';

    const getQualityColor = (pct: number) => {
        if (pct >= 0.9) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-400' };
        if (pct >= 0.75) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400' };
        return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-400' };
    };

    // Reload network data
    const reloadNetworkData = async () => {
        setNetworkLoading(true);
        setNetworkData([]);
        try {
            const results = await Promise.allSettled(
                stations.map(async (station) => {
                    const data = await fetchActualClima(station.id);
                    return { station, data };
                })
            );
            const networkResults = results.map((result, i) => {
                if (result.status === 'fulfilled') return result.value;
                return { station: stations[i], data: null };
            });
            setNetworkData(networkResults);
        } catch (e) {
            console.error('Error loading network data:', e);
        } finally {
            setNetworkLoading(false);
        }
    };

    // Load hietograma data
    const loadHietograma = async () => {
        if (hietogramaData.length > 0 || hietogramaLoading) return;
        setHietogramaLoading(true);
        try {
            const now = new Date();
            let start = new Date();
            switch (dateRange) {
                case '1D': start.setDate(now.getDate() - 1); break;
                case '3D': start.setDate(now.getDate() - 3); break;
                case '7D': start.setDate(now.getDate() - 7); break;
                case '1M': start.setMonth(now.getMonth() - 1); break;
                case '3M': start.setMonth(now.getMonth() - 3); break;
                case '1Y': start.setFullYear(now.getFullYear() - 1); break;
                default:
                    if (customDates.start && customDates.end) {
                        start = new Date(customDates.start + 'T00:00:00');
                    }
            }
            const end = dateRange === 'custom' && customDates.end ? new Date(customDates.end + 'T23:59:59') : now;
            const data = await fetchLluvia(selectedStation, start.toISOString(), end.toISOString());
            setHietogramaData(data);
        } catch (e) {
            console.error('Error loading hietograma:', e);
        } finally {
            setHietogramaLoading(false);
        }
    };

    // --- CSV Export ---
    const exportCSV = () => {
        let csvContent: string;
        let fileName: string;

        if (isRawResolution) {
            csvContent = "data:text/csv;charset=utf-8,"
                + "Fecha_Hora,Temperatura_C,Humedad_%,Lluvia_mm,Viento_ms,Dir_Viento,Radiacion_Wm2,Presion_hPa,PM2.5,PM10\n"
                + historyData.map(r =>
                    `${r.timestamp},${r.temperature ?? ''},${r.humidity ?? ''},${r.rainfall ?? ''},${r.windSpeed ?? ''},${r.windDirection ?? ''},${r.solarRadiation ?? ''},${r.pressure ?? ''},${r.pm25 ?? ''},${r.pm10 ?? ''}`
                ).join("\n");
            fileName = `clima_${stationName}_${dateRange}_raw.csv`;
        } else {
            csvContent = "data:text/csv;charset=utf-8,"
                + "Fecha,Registros,Completitud_%,TMax,TMin,TProm,Humedad_%,Lluvia_mm,Racha_ms,Horas_Sol,ET0_mm,P_Rocio_C,Indice_Calor,GDD,HDD,CDD\n"
                + dailyAggregates.map(r =>
                    `${r.day},${r.records},${(r.completeness * 100).toFixed(0)},${r.temp_max ?? ''},${r.temp_min ?? ''},${r.temp_avg?.toFixed(1) ?? ''},${r.humidity_avg?.toFixed(0) ?? ''},${r.rain_total?.toFixed(1) ?? ''},${r.wind_max?.toFixed(1) ?? ''},${r.sun_hours.toFixed(1)},${r.et0?.toFixed(2) ?? ''},${r.dew_point?.toFixed(1) ?? ''},${r.heat_index?.toFixed(1) ?? ''},${r.gdd?.toFixed(1) ?? ''},${r.hdd?.toFixed(1) ?? ''},${r.cdd?.toFixed(1) ?? ''}`
                ).join("\n");
            fileName = `clima_${stationName}_${dateRange}.csv`;
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Datos para gráficos de barras comparativos (Modo Red) ---
    const networkBarData = useMemo(() => {
        const truncName = (name: string) => name.length > 15 ? name.substring(0, 15) + '…' : name;

        const result: Record<NetworkVarKey, { name: string; fullName: string; stationId: string; value: number; timestamp: string }[]> = {} as any;

        for (const varDef of NETWORK_VARIABLES) {
            result[varDef.key] = networkData
                .filter(n => {
                    const val = n.data ? varDef.extract(n.data) : null;
                    return val != null;
                })
                .map(n => ({
                    name: truncName(n.station.name),
                    fullName: n.station.name,
                    stationId: n.station.id,
                    value: varDef.extract(n.data!)!,
                    timestamp: n.data!.timestamp,
                }))
                .sort((a, b) => b.value - a.value);
        }

        return result;
    }, [networkData]);

    // --- Render ---

    return (
        <div className="h-screen w-screen bg-slate-50 text-slate-800 font-inter overflow-hidden flex flex-col">
            {/* Top Bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={mode === 'red' ? onBack : switchToNetwork}
                        className="p-2 rounded-xl hover:bg-slate-100 transition-colors group"
                        title={mode === 'red' ? 'Volver al Visor' : 'Volver a Red'}
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl">
                            <BarChart3 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-slate-800">
                                {mode === 'red' ? 'Panel de Análisis Avanzado' : stationName}
                            </h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {mode === 'red' ? 'Observatorio UTPL • Red de Estaciones' : `Resolución: ${dataResolution} • ${historyData.length} registros`}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Controles solo en modo estación */}
                    {mode === 'estacion' && (
                        <>
                            {/* Station Selector */}
                            <div className="relative">
                                <select
                                    value={selectedStation}
                                    onChange={(e) => switchToStation(e.target.value)}
                                    className="appearance-none pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 cursor-pointer"
                                >
                                    {stations.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>

                            {/* Date Range — siempre visible */}
                            <div className="flex items-center gap-3">
                                {dateRange === 'custom' && (
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1 shadow-sm">
                                        <input
                                            type="date"
                                            value={customDates.start}
                                            onChange={e => setCustomDates(prev => ({ ...prev, start: e.target.value }))}
                                            className="text-xs font-bold text-slate-600 focus:outline-none"
                                        />
                                        <span className="text-slate-300">&rarr;</span>
                                        <input
                                            type="date"
                                            value={customDates.end}
                                            onChange={e => setCustomDates(prev => ({ ...prev, end: e.target.value }))}
                                            className="text-xs font-bold text-slate-600 focus:outline-none"
                                        />
                                    </div>
                                )}
                                <div className="bg-slate-100 rounded-xl p-1 flex gap-0.5">
                                    {(['1D', '3D', '7D', '1M', '3M', '1Y', 'custom'] as DateRangeType[]).map(r => (
                                        <button
                                            key={r}
                                            onClick={() => setDateRange(r)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateRange === r
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'text-slate-500 hover:bg-white hover:shadow-sm'
                                                }`}
                                        >
                                            {r === 'custom' ? 'Rango' : r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Config button — ambos modos */}
                    <button
                        onClick={() => setShowConfigModal(true)}
                        className="p-2.5 rounded-xl hover:bg-slate-100 transition-colors group"
                        title="Configuración"
                    >
                        <Settings className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loadingStations ? (
                    <div className="flex items-center justify-center h-64 gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-sm font-bold text-slate-500">Cargando estaciones...</span>
                    </div>
                ) : (
                    <>
                        {/* ==================== MODO RED ==================== */}
                        {mode === 'red' && (
                            <div className="space-y-6">
                                {/* 4.1 Gráficos de barras comparativos — dinámicos */}
                                {networkData.length > 0 && !networkLoading && (
                                    <div>
                                        {/* Header con botón Personalizar */}
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-black text-slate-700">Comparativa en Tiempo Real</h3>
                                            <div className="relative" ref={varPickerRef}>
                                                <button
                                                    onClick={() => setShowVarPicker(prev => !prev)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${showVarPicker ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                                >
                                                    <SlidersHorizontal className="w-3.5 h-3.5" /> Personalizar
                                                </button>
                                                {showVarPicker && (
                                                    <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-slate-200 shadow-xl z-30 p-3 w-56">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Variables (1–4)</p>
                                                        {NETWORK_VARIABLES.map(v => {
                                                            const active = selectedNetVars.includes(v.key);
                                                            const disabled = !active && selectedNetVars.length >= 4;
                                                            return (
                                                                <label
                                                                    key={v.key}
                                                                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={active}
                                                                        disabled={disabled || (active && selectedNetVars.length <= 1)}
                                                                        onChange={() => toggleNetVar(v.key)}
                                                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                    />
                                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                                                                    <span className="text-xs font-medium text-slate-700">{v.label}</span>
                                                                    <span className="text-[10px] text-slate-400 ml-auto">{v.unit}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Grid dinámico de gráficos */}
                                        <div className={`grid gap-4 ${selectedNetVars.length <= 2 ? 'grid-cols-1 lg:grid-cols-2' : selectedNetVars.length === 3 ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
                                            {selectedNetVars.map(varKey => {
                                                const varDef = NETWORK_VARIABLES.find(v => v.key === varKey)!;
                                                const data = networkBarData[varKey];
                                                if (!data || data.length === 0) return null;

                                                const formatAge = (ts: string) => {
                                                    const mins = (Date.now() - new Date(ts).getTime()) / 60000;
                                                    if (mins < 1) return 'ahora';
                                                    if (mins < 60) return `hace ${Math.round(mins)}min`;
                                                    return `hace ${Math.round(mins / 60)}h`;
                                                };

                                                return (
                                                    <div key={varKey} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                                        <h4 className="text-xs font-black text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-2">
                                                            {varDef.icon} {varDef.label} ({varDef.unit})
                                                        </h4>
                                                        <div style={{ height: Math.max(200, data.length * 32) }}>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <BarChart
                                                                    data={data}
                                                                    layout="vertical"
                                                                    margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                                                    onMouseLeave={() => setHoveredStation(null)}
                                                                >
                                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                                                    <XAxis type="number" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit={` ${varDef.unit}`} />
                                                                    <YAxis type="category" dataKey="name" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} width={100} />
                                                                    <RechartsTooltip
                                                                        contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)', padding: '8px 12px' }}
                                                                        cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                                                                        content={({ active, payload }) => {
                                                                            if (!active || !payload?.length) return null;
                                                                            const item = payload[0].payload;
                                                                            return (
                                                                                <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2">
                                                                                    <p className="text-xs font-black text-slate-800">{item.fullName}</p>
                                                                                    <p className="text-lg font-black" style={{ color: varDef.color }}>
                                                                                        {item.value.toFixed(varDef.decimals)} <span className="text-xs font-bold text-slate-400">{varDef.unit}</span>
                                                                                    </p>
                                                                                    <p className="text-[10px] text-slate-400">{formatAge(item.timestamp)}</p>
                                                                                </div>
                                                                            );
                                                                        }}
                                                                    />
                                                                    <Bar
                                                                        dataKey="value"
                                                                        radius={[0, 4, 4, 0]}
                                                                        maxBarSize={22}
                                                                        cursor="pointer"
                                                                        onClick={(barData: any) => {
                                                                            if (barData?.stationId) switchToStation(barData.stationId);
                                                                        }}
                                                                        onMouseEnter={(barData: any) => {
                                                                            if (barData?.stationId) setHoveredStation(barData.stationId);
                                                                        }}
                                                                    >
                                                                        {data.map((entry) => (
                                                                            <Cell
                                                                                key={entry.stationId}
                                                                                fill={hoveredStation && hoveredStation !== entry.stationId ? varDef.color + '40' : varDef.color}
                                                                                stroke={hoveredStation === entry.stationId ? varDef.color : 'none'}
                                                                                strokeWidth={hoveredStation === entry.stationId ? 2 : 0}
                                                                            />
                                                                        ))}
                                                                    </Bar>
                                                                </BarChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 4.2 Tabla de red */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                                        <h3 className="text-sm font-black text-slate-700">Red de Estaciones — Tiempo Real</h3>
                                        <button
                                            onClick={reloadNetworkData}
                                            disabled={networkLoading}
                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${networkLoading ? 'animate-spin' : ''}`} /> Actualizar
                                        </button>
                                    </div>

                                    {networkLoading ? (
                                        <div className="flex items-center justify-center h-48 gap-3">
                                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                            <span className="text-sm font-bold text-slate-500">Consultando estaciones...</span>
                                        </div>
                                    ) : networkData.length > 0 ? (
                                        (() => {
                                            const validTemps = networkData.filter(n => n.data?.temperature != null).map(n => n.data!.temperature!);
                                            const validHums = networkData.filter(n => n.data?.humidity != null).map(n => n.data!.humidity!);
                                            const validWinds = networkData.filter(n => n.data?.windSpeed != null).map(n => n.data!.windSpeed!);
                                            const maxTemp = validTemps.length ? Math.max(...validTemps) : null;
                                            const minTemp = validTemps.length ? Math.min(...validTemps) : null;
                                            const maxHum = validHums.length ? Math.max(...validHums) : null;
                                            const minHum = validHums.length ? Math.min(...validHums) : null;
                                            const maxWind = validWinds.length ? Math.max(...validWinds) : null;

                                            return (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                                <th className="px-3 py-2.5 text-left">Estación</th>
                                                                <th className="px-3 py-2.5 text-center">Tipo</th>
                                                                <th className="px-3 py-2.5 text-center">T°C</th>
                                                                <th className="px-3 py-2.5 text-center">HR%</th>
                                                                <th className="px-3 py-2.5 text-center">Lluvia mm</th>
                                                                <th className="px-3 py-2.5 text-center">Viento m/s</th>
                                                                <th className="px-3 py-2.5 text-center">PM2.5</th>
                                                                <th className="px-3 py-2.5 text-center">Estado</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {networkData.map((n, i) => {
                                                                const d = n.data;
                                                                const age = d ? (Date.now() - new Date(d.timestamp).getTime()) / 60000 : Infinity;
                                                                const statusColor = age < 30 ? 'bg-green-500' : age < 120 ? 'bg-amber-500' : 'bg-red-500';

                                                                return (
                                                                    <tr
                                                                        key={n.station.id}
                                                                        onClick={() => switchToStation(n.station.id)}
                                                                        className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 cursor-pointer transition-colors`}
                                                                    >
                                                                        <td className="px-3 py-2 font-bold text-slate-700">{n.station.name}</td>
                                                                        <td className="px-3 py-2 text-center">
                                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500">
                                                                                {n.station.type}
                                                                            </span>
                                                                        </td>
                                                                        <td className={`px-3 py-2 text-center font-bold ${d?.temperature === maxTemp ? 'text-red-600' : d?.temperature === minTemp ? 'text-blue-600' : ''}`}>
                                                                            {d?.temperature?.toFixed(1) ?? '--'}
                                                                        </td>
                                                                        <td className={`px-3 py-2 text-center font-medium ${d?.humidity === maxHum ? 'text-blue-600' : d?.humidity === minHum ? 'text-amber-600' : ''}`}>
                                                                            {d?.humidity?.toFixed(0) ?? '--'}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center">{d?.rainfall?.toFixed(1) ?? '--'}</td>
                                                                        <td className={`px-3 py-2 text-center ${d?.windSpeed === maxWind ? 'font-bold text-indigo-600' : ''}`}>
                                                                            {d?.windSpeed?.toFixed(1) ?? '--'}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center">
                                                                            {d?.pm25 != null ? (
                                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getAQI_PM25(d.pm25).bg} ${getAQI_PM25(d.pm25).color}`}>
                                                                                    {d.pm25.toFixed(1)}
                                                                                </span>
                                                                            ) : '--'}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center">
                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
                                                                                <span className="text-[9px] text-slate-400">
                                                                                    {age < 30 ? 'Actual' : age < 120 ? `${Math.round(age)}min` : 'Inactivo'}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <p className="text-center text-slate-400 text-sm py-8">No se pudieron cargar datos de la red</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ==================== MODO ESTACIÓN ==================== */}
                        {mode === 'estacion' && (
                            <div className="space-y-6">
                                {/* 5.1 Barra de controles */}
                                <div className="flex items-center justify-between">
                                    <div className="bg-slate-100 rounded-xl p-1 flex gap-0.5">
                                        <button
                                            onClick={() => setViewMode('graficos')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'graficos'
                                                ? 'bg-white text-blue-700 shadow-md'
                                                : 'text-slate-500 hover:bg-white/50'
                                                }`}
                                        >
                                            <TrendingUp className="w-3.5 h-3.5" /> Gráficos
                                        </button>
                                        <button
                                            onClick={() => setViewMode('tabla')}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'tabla'
                                                ? 'bg-white text-blue-700 shadow-md'
                                                : 'text-slate-500 hover:bg-white/50'
                                                }`}
                                        >
                                            <Calendar className="w-3.5 h-3.5" /> Tabla
                                        </button>
                                    </div>
                                    <button
                                        onClick={exportCSV}
                                        disabled={historyData.length === 0}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Exportar CSV
                                    </button>
                                </div>

                                {loading ? (
                                    <div className="flex items-center justify-center h-64 gap-3">
                                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                        <span className="text-sm font-bold text-slate-500">Procesando datos de {stationName}...</span>
                                    </div>
                                ) : historyData.length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm py-16">No hay datos disponibles para el rango seleccionado</p>
                                ) : (
                                    <>
                                        {/* 5.2 Vista Gráficos */}
                                        {viewMode === 'graficos' && (
                                            <div className="space-y-6 animate-in fade-in duration-500">
                                                {/* Gráfico 1 — Temperatura */}
                                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div>
                                                            <h3 className="text-lg font-black text-slate-800">Temperatura</h3>
                                                            <p className="text-xs text-slate-400">
                                                                {isRawResolution ? 'Datos cada ' + dataResolution : 'Máximas, Mínimas y Promedios Diarios'}
                                                            </p>
                                                        </div>
                                                        {!isRawResolution && (
                                                            <div className="flex gap-2">
                                                                <span className="flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full bg-red-500"></span> Max</span>
                                                                <span className="flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Prom</span>
                                                                <span className="flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Min</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="h-80 w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            {isRawResolution ? (
                                                                <ComposedChart data={historyData.map(d => ({
                                                                    time: formatLocalTime(d.timestamp, dataResolution, dateRange),
                                                                    temperature: d.temperature,
                                                                }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="time" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit="°C" />
                                                                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [value?.toFixed(1) + '°C']} />
                                                                    <Line type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={2} dot={false} />
                                                                    <Brush dataKey="time" height={30} stroke="#cbd5e1" />
                                                                </ComposedChart>
                                                            ) : (
                                                                <ComposedChart data={dailyAggregates} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="day" fontSize={10} tickFormatter={d => formatDayTick(d, dateRange)} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit="°C" />
                                                                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [value?.toFixed(1) + '°C']} />
                                                                    <Area type="monotone" dataKey="temp_range" fill="#eff6ff" stroke="none" />
                                                                    <Line type="monotone" dataKey="temp_max" stroke="#ef4444" strokeWidth={3} dot={{ r: 0 }} activeDot={{ r: 6 }} />
                                                                    <Line type="monotone" dataKey="temp_min" stroke="#3b82f6" strokeWidth={3} dot={{ r: 0 }} activeDot={{ r: 6 }} />
                                                                    <Line type="monotone" dataKey="temp_avg" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 0 }} activeDot={{ r: 6 }} />
                                                                    <Brush dataKey="day" height={30} stroke="#cbd5e1" />
                                                                </ComposedChart>
                                                            )}
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>

                                                {/* Gráfico 2 — Precipitación + Humedad (dual axis) */}
                                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                    <h3 className="text-sm font-black text-slate-800 mb-4">Precipitación + Humedad</h3>
                                                    <div className="h-64 w-full">
                                                        <ResponsiveContainer>
                                                            {isRawResolution ? (
                                                                <ComposedChart data={historyData.map(d => ({
                                                                    time: formatLocalTime(d.timestamp, dataResolution, dateRange),
                                                                    rainfall: d.rainfall ?? 0,
                                                                    humidity: d.humidity,
                                                                }))}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="time" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis yAxisId="left" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit=" mm" />
                                                                    <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit="%" />
                                                                    <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                    <Bar yAxisId="left" dataKey="rainfall" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={8} />
                                                                    <Line yAxisId="right" type="monotone" dataKey="humidity" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                                                </ComposedChart>
                                                            ) : (
                                                                <ComposedChart data={dailyAggregates}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="day" fontSize={10} tickFormatter={d => formatDayTick(d, dateRange)} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis yAxisId="left" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit="%" />
                                                                    <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                    <Bar yAxisId="left" dataKey="rain_total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                                    <Line yAxisId="right" type="monotone" dataKey="humidity_avg" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                                                </ComposedChart>
                                                            )}
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>

                                                {/* Gráfico 3 — Grid 2 columnas: Radiación + Rosa de vientos */}
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                        <h3 className="text-sm font-black text-slate-800 mb-4">Radiación y Horas de Sol</h3>
                                                        <div className="h-64 w-full">
                                                            <ResponsiveContainer>
                                                                {isRawResolution ? (
                                                                    <ComposedChart data={historyData.map(d => ({
                                                                        time: formatLocalTime(d.timestamp, dataResolution, dateRange),
                                                                        solarRadiation: d.solarRadiation,
                                                                    }))}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey="time" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                        <YAxis fontSize={10} stroke="#94a3b8" unit=" W/m²" tickLine={false} axisLine={false} />
                                                                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                        <Area type="monotone" dataKey="solarRadiation" fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
                                                                    </ComposedChart>
                                                                ) : (
                                                                    <ComposedChart data={dailyAggregates}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey="day" fontSize={10} tickFormatter={d => formatDayTick(d, dateRange)} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                        <YAxis yAxisId="left" fontSize={10} stroke="#94a3b8" unit=" W/m²" tickLine={false} axisLine={false} />
                                                                        <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#94a3b8" unit=" h" tickLine={false} axisLine={false} />
                                                                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                        <Area yAxisId="left" type="monotone" dataKey="radiation_avg" fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} />
                                                                        <Bar yAxisId="right" dataKey="sun_hours" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={20} />
                                                                    </ComposedChart>
                                                                )}
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                        <h3 className="text-sm font-black text-slate-800 mb-4">Rosa de Vientos</h3>
                                                        <div className="h-64 w-full">
                                                            <WindRoseChart data={historyData} color="#6366f1" />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Gráfico 4 — Presión (condicional) */}
                                                {historyData.some(d => d.pressure != null) && (
                                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                        <h3 className="text-sm font-black text-slate-800 mb-4">Presión Atmosférica</h3>
                                                        <div className="h-52 w-full">
                                                            <ResponsiveContainer>
                                                                {isRawResolution ? (
                                                                    <ComposedChart data={historyData.map(d => ({
                                                                        time: formatLocalTime(d.timestamp, dataResolution, dateRange),
                                                                        pressure: d.pressure,
                                                                    }))}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey="time" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                        <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit=" hPa" domain={['auto', 'auto']} />
                                                                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} formatter={(v: number) => [v?.toFixed(1) + ' hPa']} />
                                                                        <Line type="monotone" dataKey="pressure" stroke="#64748b" strokeWidth={2} dot={false} />
                                                                    </ComposedChart>
                                                                ) : (
                                                                    <ComposedChart data={dailyAggregates}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey="day" fontSize={10} tickFormatter={d => formatDayTick(d, dateRange)} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                        <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit=" hPa" domain={['auto', 'auto']} />
                                                                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} formatter={(v: number) => [v?.toFixed(1) + ' hPa']} />
                                                                        <Line type="monotone" dataKey="pressure_avg" stroke="#64748b" strokeWidth={2} dot={false} />
                                                                    </ComposedChart>
                                                                )}
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Sección derivada — Solo resolución diaria y ≥28 días */}
                                                {!isRawResolution && dailyAggregates.length >= 28 && (
                                                    <>
                                                        {/* ET0 Chart */}
                                                        {dailyAggregates.some(d => d.et0 !== null) && (
                                                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                                <h4 className="text-sm font-black text-slate-800 mb-4">Evapotranspiración de Referencia (ET0 Hargreaves)</h4>
                                                                <div className="h-64 w-full">
                                                                    <ResponsiveContainer>
                                                                        <ComposedChart data={dailyAggregates}>
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                            <XAxis dataKey="day" fontSize={10} tickFormatter={d => formatDayTick(d, dateRange)} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                            <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit=" mm/d" />
                                                                            <RechartsTooltip contentStyle={{ borderRadius: '8px' }} formatter={(value: number) => [value.toFixed(2) + ' mm/d', 'ET0']} />
                                                                            <Area type="monotone" dataKey="et0" fill="#ccfbf1" stroke="#14b8a6" strokeWidth={2} />
                                                                        </ComposedChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Cards derivadas */}
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            <StatCard label="GDD Acumulado" value={dailyAggregates.reduce((acc, d) => acc + (d.gdd || 0), 0)} colorClass="bg-emerald-50" icon={<TrendingUp className="w-4 h-4" />} subValue="Base 10°C" />
                                                            <StatCard label="HDD Acumulado" value={dailyAggregates.reduce((acc, d) => acc + (d.hdd || 0), 0)} colorClass="bg-blue-50" subValue="Demanda calefacción" />
                                                            <StatCard label="CDD Acumulado" value={dailyAggregates.reduce((acc, d) => acc + (d.cdd || 0), 0)} colorClass="bg-red-50" subValue="Demanda enfriamiento" />
                                                            <StatCard label="Horas Sol Total" value={dailyAggregates.reduce((acc, d) => acc + d.sun_hours, 0)} unit="h" colorClass="bg-amber-50" icon={<Sun className="w-4 h-4" />} />
                                                        </div>
                                                    </>
                                                )}

                                                {/* Walter-Lieth — Solo si ≥3 meses */}
                                                {monthlyAggregates.length >= 3 && (
                                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                        <h4 className="text-sm font-black text-slate-800 mb-4">Diagrama Walter-Lieth — Temperatura vs Precipitación</h4>
                                                        <div className="h-72 w-full">
                                                            <ResponsiveContainer>
                                                                <ComposedChart data={monthlyAggregates.map(m => ({
                                                                    ...m,
                                                                    monthLabel: new Date(m.month + '-01').toLocaleDateString('es-EC', { month: 'short' }),
                                                                }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                    <XAxis dataKey="monthLabel" fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                    <YAxis yAxisId="temp" fontSize={10} stroke="#ef4444" tickLine={false} axisLine={false} unit="°C" />
                                                                    <YAxis yAxisId="rain" orientation="right" fontSize={10} stroke="#3b82f6" tickLine={false} axisLine={false} unit=" mm" />
                                                                    <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                    <Legend />
                                                                    <Bar yAxisId="rain" dataKey="rain_total" fill="#93c5fd" name="Precipitación (mm)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                                    <Line yAxisId="temp" type="monotone" dataKey="temp_avg" stroke="#ef4444" strokeWidth={3} name="T° Promedio (°C)" dot={{ r: 4, fill: '#ef4444' }} />
                                                                    <Line yAxisId="temp" type="monotone" dataKey="temp_max_abs" stroke="#fca5a5" strokeWidth={1} strokeDasharray="4 4" name="T° Máx" dot={false} />
                                                                    <Line yAxisId="temp" type="monotone" dataKey="temp_min_abs" stroke="#93c5fd" strokeWidth={1} strokeDasharray="4 4" name="T° Mín" dot={false} />
                                                                </ComposedChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Hietograma — Lazy load */}
                                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-sm font-black text-slate-800">Hietograma — Intensidad de Precipitación</h3>
                                                        {!showHietograma && (
                                                            <button
                                                                onClick={() => { setShowHietograma(true); loadHietograma(); }}
                                                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all"
                                                            >
                                                                Cargar datos detallados
                                                            </button>
                                                        )}
                                                    </div>
                                                    {showHietograma && (
                                                        hietogramaLoading ? (
                                                            <div className="flex items-center justify-center h-48 gap-2">
                                                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                                <span className="text-xs text-slate-400">Cargando datos de lluvia...</span>
                                                            </div>
                                                        ) : hietogramaData.length > 0 ? (
                                                            <div className="h-64 w-full">
                                                                <ResponsiveContainer>
                                                                    <ComposedChart data={hietogramaData.map(d => ({
                                                                        time: formatLocalTime(d.timestamp, dataResolution, dateRange),
                                                                        lluvia: d.rainfall ?? 0,
                                                                    }))}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey="time" fontSize={9} stroke="#94a3b8" tickLine={false} axisLine={false} />
                                                                        <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} axisLine={false} unit=" mm" />
                                                                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                                                                        <Bar dataKey="lluvia" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={8} />
                                                                    </ComposedChart>
                                                                </ResponsiveContainer>
                                                            </div>
                                                        ) : (
                                                            <p className="text-center text-slate-400 text-xs py-8">Sin datos de precipitación detallada</p>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* 5.3 Vista Tabla */}
                                        {viewMode === 'tabla' && (
                                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                                {isRawResolution ? (
                                                    /* Tabla raw (15min / horario) */
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                                    <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-50 z-10">Fecha/Hora</th>
                                                                    <th className="px-3 py-2.5 text-center">T°C</th>
                                                                    <th className="px-3 py-2.5 text-center">HR%</th>
                                                                    <th className="px-3 py-2.5 text-center">Lluvia mm</th>
                                                                    <th className="px-3 py-2.5 text-center">Viento m/s</th>
                                                                    <th className="px-3 py-2.5 text-center">Dir°</th>
                                                                    <th className="px-3 py-2.5 text-center">Rad W/m²</th>
                                                                    <th className="px-3 py-2.5 text-center">Presión</th>
                                                                    <th className="px-3 py-2.5 text-center">PM2.5</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {historyData.map((d, i) => (
                                                                    <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 transition-colors`}>
                                                                        <td className="px-3 py-2 font-bold text-slate-700 sticky left-0 bg-inherit whitespace-nowrap">
                                                                            {new Date(d.timestamp).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center font-medium">{d.temperature?.toFixed(1) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center">{d.humidity?.toFixed(0) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center">
                                                                            <span className={`font-bold ${(d.rainfall || 0) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                                                                {d.rainfall?.toFixed(1) ?? '0.0'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-3 py-2 text-center">{d.windSpeed?.toFixed(1) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center text-slate-500">{d.windDirection?.toFixed(0) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center">{d.solarRadiation?.toFixed(0) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center">{d.pressure?.toFixed(1) ?? '--'}</td>
                                                                        <td className="px-3 py-2 text-center">
                                                                            {d.pm25 != null ? (
                                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getAQI_PM25(d.pm25).bg} ${getAQI_PM25(d.pm25).color}`}>
                                                                                    {d.pm25.toFixed(1)}
                                                                                </span>
                                                                            ) : '--'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    /* Tabla diaria */
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider">
                                                                    <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-50 z-10">Fecha</th>
                                                                    <th className="px-3 py-2.5 text-center">Reg.(%)</th>
                                                                    <th className="px-3 py-2.5 text-center">TMax</th>
                                                                    <th className="px-3 py-2.5 text-center">TMin</th>
                                                                    <th className="px-3 py-2.5 text-center">TProm</th>
                                                                    <th className="px-3 py-2.5 text-center">Hum%</th>
                                                                    <th className="px-3 py-2.5 text-center">Lluvia mm</th>
                                                                    <th className="px-3 py-2.5 text-center">Racha m/s</th>
                                                                    <th className="px-3 py-2.5 text-center">Sol h</th>
                                                                    <th className="px-3 py-2.5 text-center text-teal-600">ET0</th>
                                                                    <th className="px-3 py-2.5 text-center text-cyan-600">P.Rocío</th>
                                                                    <th className="px-3 py-2.5 text-center text-orange-600">IC</th>
                                                                    <th className="px-3 py-2.5 text-center text-emerald-600">GDD</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {dailyAggregates.map((d, i) => {
                                                                    const lowCompleteness = d.completeness < 0.75;
                                                                    const hasOutliers = d.quality.hasOutliers;
                                                                    const borderClass = hasOutliers
                                                                        ? 'border-l-4 border-l-red-400'
                                                                        : lowCompleteness
                                                                            ? 'border-l-4 border-l-amber-400'
                                                                            : '';
                                                                    return (
                                                                        <tr key={d.day} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/50 transition-colors ${borderClass}`}>
                                                                            <td className="px-3 py-2 font-bold text-slate-700 sticky left-0 bg-inherit">{d.day}</td>
                                                                            <td className="px-3 py-2 text-center">
                                                                                <span className={lowCompleteness ? 'text-amber-600 font-bold' : 'text-slate-400'}>
                                                                                    {d.records} ({(d.completeness * 100).toFixed(0)}%)
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2 text-center font-bold text-red-600">{d.temp_max?.toFixed(1) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center font-bold text-blue-600">{d.temp_min?.toFixed(1) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center font-medium">{d.temp_avg?.toFixed(1) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center">{d.humidity_avg?.toFixed(0) ?? '--'}%</td>
                                                                            <td className="px-3 py-2 text-center">
                                                                                <span className={`font-bold ${(d.rain_total || 0) > 5 ? 'text-blue-700' : (d.rain_total || 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                                                                                    {d.rain_total?.toFixed(1) ?? '0.0'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2 text-center">{d.wind_max?.toFixed(1) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center text-amber-600 font-medium">{d.sun_hours.toFixed(1)}</td>
                                                                            <td className="px-3 py-2 text-center text-teal-600 font-medium">{d.et0?.toFixed(2) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center text-cyan-600 font-medium">{d.dew_point?.toFixed(1) ?? '--'}</td>
                                                                            <td className="px-3 py-2 text-center">
                                                                                {d.heat_index !== null ? (
                                                                                    <span className={`font-bold ${d.heat_index > 40 ? 'text-red-700' : d.heat_index > 32 ? 'text-orange-600' : 'text-amber-600'}`}>
                                                                                        {d.heat_index.toFixed(1)}
                                                                                    </span>
                                                                                ) : <span className="text-slate-300">--</span>}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-center text-emerald-600 font-medium">{d.gdd?.toFixed(1) ?? '--'}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 5.4 Tarjetas resumen (siempre al final) */}
                                        {summary && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                                <StatCard label="T° Promedio" value={summary.temp_avg} unit="°C" icon={<Thermometer className="w-4 h-4" />} />
                                                <StatCard label="Lluvia Total" value={summary.rain_total} unit="mm" icon={<Cloud className="w-4 h-4" />} subValue={`${summary.rain_days} días con lluvia`} />
                                                <StatCard label="Horas de Sol" value={summary.sun_hours_total} unit="h" icon={<Sun className="w-4 h-4" />} colorClass="bg-amber-50" />
                                                <StatCard
                                                    label="Calidad Datos"
                                                    value={`${(summary.avg_completeness * 100).toFixed(0)}%`}
                                                    colorClass={getQualityColor(summary.avg_completeness).bg}
                                                    subValue={summary.low_quality_days > 0 ? `${summary.low_quality_days} días incompletos` : 'Completo'}
                                                />
                                                <StatCard label="GDD Acum." value={summary.gdd_total} colorClass="bg-emerald-50" icon={<TrendingUp className="w-4 h-4" />} subValue="Base 10°C" />
                                                <StatCard label="Días secos" value={summary.consecutive_dry_days} subValue="Consecutivos máx." icon={<Activity className="w-4 h-4" />} />
                                                {summary.pm25_avg !== null && summary.pm25_avg !== undefined && (
                                                    <div className={`${getAQI_PM25(summary.pm25_avg).bg} rounded-2xl p-4 border border-slate-100 shadow-sm`}>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">PM2.5</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-2xl font-black text-slate-800">{summary.pm25_avg.toFixed(1)}</span>
                                                            <span className="text-xs font-bold text-slate-400">µg/m³</span>
                                                        </div>
                                                        <span className={`text-[10px] font-black ${getAQI_PM25(summary.pm25_avg).color}`}>
                                                            {getAQI_PM25(summary.pm25_avg).level}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ==================== CONFIG MODAL ==================== */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowConfigModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-slate-100 rounded-xl">
                                    <Settings className="w-6 h-6 text-slate-700" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">Configuración del Visor</h3>
                                    <p className="text-xs text-slate-400">Personaliza la experiencia para los usuarios finales</p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div>
                                <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                    <Layers className="w-4 h-4 text-blue-500" /> Capas Visibles por Defecto
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { id: 'showWind', label: 'Capa de Viento (Animación)', desc: 'Muestra partículas de viento en tiempo real' },
                                        { id: 'showRadar', label: 'Radar de Lluvia', desc: 'Precipitación detectada por radar (si disponible)' },
                                        { id: 'showTemp', label: 'Marcadores de Temperatura', desc: 'Etiquetas numéricas sobre el mapa' }
                                    ].map(opt => (
                                        <label key={opt.id} className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-200 transition-all cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={(viewerConfig as any)[opt.id]}
                                                    onChange={e => setViewerConfig((prev: any) => ({ ...prev, [opt.id]: e.target.checked }))}
                                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-all checked:border-blue-500 checked:bg-blue-500 hover:shadow-md"
                                                />
                                                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-sm font-bold text-slate-700 group-hover:text-blue-700">{opt.label}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">{opt.desc}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider">
                                    <MapIcon className="w-4 h-4 text-amber-500" /> Estación Inicial
                                </h4>
                                <div className="relative">
                                    <select
                                        value={viewerConfig.defaultStation}
                                        onChange={e => setViewerConfig((prev: any) => ({ ...prev, defaultStation: e.target.value }))}
                                        className="w-full appearance-none p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                    >
                                        {stations.map(s => <option key={s.id} value={s.id}>{s.name} - {s.location.lat.toFixed(4)}, {s.location.lng.toFixed(4)}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                                <p className="mt-2 text-[10px] text-slate-400 font-medium pl-1">
                                    * Esta será la estación seleccionada automáticamente al abrir el visor.
                                </p>
                            </div>

                            <div className="pt-8 flex justify-end">
                                <button
                                    onClick={() => {
                                        localStorage.setItem('visor_config', JSON.stringify(viewerConfig));
                                        setShowConfigModal(false);
                                    }}
                                    className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar Configuración
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;

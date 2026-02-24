import React, { useState } from 'react';
import { X, Thermometer, Droplets, Wind, CloudRain, Activity, Download, Sun, Zap } from 'lucide-react';
import { Station, WeatherData } from '../types';
import WindCompass from './WindCompass'; // We just created this
import WeatherChart from './WeatherChart';
import WindRoseChart from './WindRoseChart';
import { generateStationReport } from '../utils/reportGenerator';

interface StationCardProps {
    station: Station;
    history: WeatherData[];
    loadingHistory: boolean;
    onClose: () => void;
    graphVariable: string;
    onGraphVariableChange: (variable: string) => void;
    selectedTimeRange: string;
    onTimeRangeChange: (range: string) => void;
}

type Tab = 'current' | 'graph';

const StationCard: React.FC<StationCardProps> = ({
    station,
    history,
    loadingHistory,
    onClose,
    graphVariable,
    onGraphVariableChange,
    selectedTimeRange,
    onTimeRangeChange
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('current');

    // Helper to format values safely
    const getValue = (key: keyof WeatherData): number | null => {
        const v = station.currentData?.[key];
        return (v !== undefined && v !== null && !isNaN(Number(v))) ? Number(v) : null;
    };

    // Helper: get display value with wind conversion m/s → km/h
    const getDisplayValue = (key: keyof WeatherData): number | null => {
        const v = getValue(key);
        if (v === null) return null;
        if (key === 'windSpeed') return Math.round(v * 3.6 * 10) / 10;
        return v;
    };

    const currentTemp = getValue('temperature') ?? '--';
    const windDir = getValue('windDirection') ?? 0;
    const windSpeedKmh = getDisplayValue('windSpeed') ?? 0;

    // Determine available variables from history data
    const availableVariables = React.useMemo(() => {
        if (!history || history.length === 0) {
            return ['temperature']; // Default fallback
        }

        const variableKeys: (keyof WeatherData)[] = [
            'temperature', 'humidity', 'pressure', 'windSpeed',
            'windDirection', 'rainfall', 'solarRadiation'
        ];

        return variableKeys.filter(key => {
            // Check if at least 20% of records have this variable with valid data
            const validCount = history.filter(d => {
                const val = d[key];
                return val !== null && val !== undefined && !isNaN(Number(val));
            }).length;
            return validCount >= history.length * 0.2;
        });
    }, [history]);

    // Auto-adjust graphVariable if current selection is not available
    React.useEffect(() => {
        if (!availableVariables.includes(graphVariable as keyof WeatherData)) {
            onGraphVariableChange(availableVariables[0] || 'temperature');
        }
    }, [availableVariables, graphVariable, onGraphVariableChange]);

    // Calculate High/Low for the last 24h
    const last24h = history.filter(d => new Date(d.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000);
    const temps = last24h.map(d => d.temperature).filter((t): t is number => typeof t === 'number' && !isNaN(t));
    const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : '--';
    const minTemp = temps.length ? Math.min(...temps).toFixed(1) : '--';

    // Debug logging for history data
    React.useEffect(() => {
        console.log('📊 StationCard history update:', {
            stationId: station.id,
            stationName: station.name,
            historyLength: history.length,
            loadingHistory,
            hasHistory: history.length > 0,
            firstHistoryPoint: history[0],
            lastHistoryPoint: history[history.length - 1]
        });
    }, [history, station.id, station.name, loadingHistory]);

    const gridItems = [
        { key: 'humidity', label: 'Humedad', unit: '%', icon: <Droplets size={18} />, color: 'text-blue-600', bg: 'bg-blue-100' },
        { key: 'pressure', label: 'Presión', unit: 'hPa', icon: <Activity size={18} />, color: 'text-purple-600', bg: 'bg-purple-100' },
        { key: 'rainfall', label: 'Lluvia', unit: 'mm', icon: <CloudRain size={18} />, color: 'text-cyan-600', bg: 'bg-cyan-100' },
        { key: 'windSpeed', label: 'Viento', unit: 'km/h', icon: <Wind size={18} />, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        { key: 'solarRadiation', label: 'Radiación', unit: 'W/m²', icon: <Sun size={18} />, color: 'text-orange-600', bg: 'bg-orange-100' },
        { key: 'pm25', label: 'PM 2.5', unit: 'µg/m³', icon: <Activity size={18} />, color: 'text-gray-600', bg: 'bg-gray-100' },
        { key: 'uvIndex', label: 'Índice UV', unit: '', icon: <Sun size={18} />, color: 'text-yellow-600', bg: 'bg-yellow-100' },
        { key: 'batteryVoltage', label: 'Batería', unit: 'V', icon: <Zap size={18} />, color: 'text-green-600', bg: 'bg-green-100' },
    ] as const;

    return (
        <div className="w-full max-w-md bg-white shadow-2xl rounded-t-xl md:rounded-xl overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[85vh] md:max-h-[80vh]">

            {/* 1. Header (Orange themed like request) */}
            <div className="bg-[#f28e2c] p-4 text-white relative">
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 p-2.5 hover:bg-white/20 rounded-full transition-colors z-10 cursor-pointer"
                    aria-label="Cerrar"
                    title="Cerrar"
                >
                    <X size={24} className="text-white" strokeWidth={3} />
                </button>

                <h2 className="text-xl font-bold leading-tight pr-8 drop-shadow-sm">
                    {station.name}
                </h2>
                <div className="flex items-center gap-4 mt-2 text-xs font-medium opacity-90">
                    <span>ID: {station.id}</span>
                </div>
            </div>

            {/* 2. Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('current')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'current'
                        ? 'text-[#f28e2c] border-b-2 border-[#f28e2c] bg-orange-50/50'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                >
                    Actual
                </button>
                <button
                    onClick={() => setActiveTab('graph')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'graph'
                        ? 'text-[#f28e2c] border-b-2 border-[#f28e2c] bg-orange-50/50'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                >
                    Gráfico
                </button>
            </div>

            {/* 3. Content Body */}
            <div className="flex-1 overflow-y-auto p-0 bg-slate-50 relative custom-scrollbar">
                {activeTab === 'current' && (
                    <div className="p-6 space-y-6">

                        {/* Main Stats Row */}
                        <div className="flex items-center justify-between">
                            {/* Temperature Big */}
                            <div className="flex flex-col">
                                <span className="text-7xl font-black text-slate-800 tracking-tighter">
                                    {currentTemp}<span className="text-4xl align-top text-slate-400">°</span>
                                </span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    Temperatura
                                </span>
                                <div className="flex gap-4 mt-3">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Máx</span>
                                        <span className="text-sm font-black text-slate-700">{maxTemp}°</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Mín</span>
                                        <span className="text-sm font-black text-slate-700">{minTemp}°</span>
                                    </div>
                                </div>
                            </div>

                            {/* Wind Widget */}
                            <WindCompass degrees={windDir} speed={windSpeedKmh} unit="km/h" />
                        </div>

                        {/* Weather Summary Bar */}
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/50 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white p-2 rounded-lg shadow-sm">
                                        <Droplets size={18} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <div className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Condiciones</div>
                                        <div className="text-sm font-black text-slate-700">
                                            {getValue('humidity') !== null && getValue('humidity')! > 80 ? '🌧️ Húmedo' :
                                                getValue('humidity') !== null && getValue('humidity')! < 40 ? '☀️ Seco' :
                                                    '⛅ Normal'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Última Actualización</div>
                                    <div className="text-[10px] font-bold text-slate-600">{station.lastUpdate ? new Date(station.lastUpdate).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Grid Stats - Dynamic Rendering */}
                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200/60">
                            {gridItems.map((item) => {
                                const val = getDisplayValue(item.key as keyof WeatherData);
                                if (val === null) return null; // Don't render missing vars

                                return (
                                    <div key={item.key} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                                        <div className={`${item.bg} p-2 rounded-lg ${item.color}`}>
                                            {item.icon}
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-slate-400">{item.label}</div>
                                            <div className="text-lg font-black text-slate-700">
                                                {val} <span className="text-xs font-medium text-slate-400">{item.unit}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Last Update */}
                        <div className="text-center pt-4">
                            <span className="text-[10px] font-mono text-slate-400">
                                Actualizado: {station.lastUpdate ? new Date(station.lastUpdate).toLocaleString() : 'N/A'}
                            </span>
                        </div>

                        <button
                            onClick={() => {
                                if (history.length > 0) {
                                    generateStationReport(station, history, { start: '24H', end: 'Now' });
                                }
                            }}
                            className="w-full py-3 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            <Download size={14} />
                            Descargar Reporte
                        </button>

                    </div>
                )}

                {activeTab === 'graph' && (
                    <div className="p-4 h-full flex flex-col gap-4">
                        {/* Controls Row */}
                        <div className="flex gap-2 justify-between items-center pb-2 border-b border-slate-200">
                            {/* Variable Selector */}
                            <select
                                className="text-xs font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-colors"
                                value={graphVariable}
                                onChange={(e) => onGraphVariableChange(e.target.value)}
                            >
                                {availableVariables.includes('temperature') && <option value="temperature">🌡️ Temperatura</option>}
                                {availableVariables.includes('humidity') && <option value="humidity">💧 Humedad</option>}
                                {availableVariables.includes('pressure') && <option value="pressure">📊 Presión</option>}
                                {availableVariables.includes('windSpeed') && <option value="windSpeed">💨 Velocidad Viento</option>}
                                {availableVariables.includes('windDirection') && <option value="windDirection">🧭 Dirección Viento</option>}
                                {availableVariables.includes('rainfall') && <option value="rainfall">🌧️ Lluvia</option>}
                                {availableVariables.includes('solarRadiation') && <option value="solarRadiation">☀️ Radiación Solar</option>}
                            </select>

                            {/* Time Range Selector */}
                            <div className="flex gap-1">
                                {['24H', '3D', '7D', '30D'].map((range) => (
                                    <button
                                        key={range}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${selectedTimeRange === range
                                            ? 'bg-orange-500 text-white shadow-md'
                                            : 'bg-slate-100 hover:bg-orange-400 hover:text-white text-slate-600'
                                            }`}
                                        onClick={() => onTimeRangeChange(range)}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="w-full min-h-[250px] h-[40vh] max-h-[350px] bg-white rounded-xl border border-slate-200 p-4 shadow-inner">
                            {loadingHistory ? (
                                <div className="h-full w-full flex items-center justify-center animate-pulse text-xs font-bold text-slate-400 uppercase">
                                    Cargando Historial...
                                </div>
                            ) : history.length > 0 ? (
                                graphVariable === 'windDirection' ? (
                                    <WindRoseChart data={history} />
                                ) : (
                                    <WeatherChart
                                        data={history}
                                        dataKey={graphVariable as any}
                                        label={graphVariable === 'temperature' ? 'Temperatura' :
                                            graphVariable === 'humidity' ? 'Humedad' :
                                                graphVariable === 'pressure' ? 'Presión' :
                                                    graphVariable === 'windSpeed' ? 'Velocidad del Viento' :
                                                        graphVariable === 'rainfall' ? 'Precipitación' :
                                                            graphVariable === 'solarRadiation' ? 'Radiación Solar' : 'Dato'}
                                        unit={graphVariable === 'temperature' ? '°C' :
                                            graphVariable === 'humidity' ? '%' :
                                                graphVariable === 'pressure' ? 'hPa' :
                                                    graphVariable === 'windSpeed' ? 'km/h' :
                                                        graphVariable === 'rainfall' ? 'mm' :
                                                            graphVariable === 'solarRadiation' ? 'W/m²' : ''}
                                        color={graphVariable === 'rainfall' ? '#4e79a7' : '#f28e2c'}
                                        chartType={graphVariable === 'rainfall' ? 'bar' : 'line'}
                                    />
                                )
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase">
                                    Sin datos en rango
                                </div>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="text-[10px] text-slate-400 text-center font-medium">
                            Mostrando últimos {selectedTimeRange}. Para más detalle, descargue el reporte.
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
};

export default StationCard;

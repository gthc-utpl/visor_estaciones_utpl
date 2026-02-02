
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cloud,
  Activity,
  LayoutDashboard,
  Network,
  Cpu,
  ChevronRight,
  RefreshCw,
  History,
  Calendar,
  List,
  Map as MapIcon,
  Search,
  Thermometer,
  Droplets,
  Gauge,
  Wind,
  Navigation,
  CloudRain,
  Sun,
  SunMedium,
  Battery,
  Info
} from 'lucide-react';
import { Station, AIInsight, WeatherVariable, WeatherData } from './types';
import StatCard from './components/StatCard';
import WeatherChart from './components/WeatherChart';
import RainfallChart from './components/RainfallChart';
import StationMap from './components/StationMap';
import { analyzeStationData, analyzeHistoricalData } from './services/gemini';
import { fetchStations, fetchActualClima } from './services/api';
import { MOCK_STATIONS } from './constants';
import { useWeatherHistory } from './hooks/useWeatherHistory';

const App: React.FC = () => {
  const [stations, setStations] = useState<Station[]>(MOCK_STATIONS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingNetwork, setRefreshingNetwork] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [activeTab, setActiveTab] = useState<'station' | 'network'>('network');
  const [networkSubView, setNetworkSubView] = useState<'list' | 'map'>('map');

  // Rangos de tiempo predefinidos
  type TimeRange = '24h' | '3d' | '7d' | '30d' | '1y';
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('24h');

  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 24 * 3600000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Función para actualizar el rango de tiempo
  const handleTimeRangeChange = (range: TimeRange) => {
    setSelectedTimeRange(range);
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: Date;

    switch (range) {
      case '24h':
        start = new Date(now.getTime() - 24 * 3600000);
        break;
      case '3d':
        start = new Date(now.getTime() - 3 * 24 * 3600000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 3600000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 3600000);
        break;
      case '1y':
        start = new Date(now.getTime() - 365 * 24 * 3600000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 3600000);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
  };


  // Hook optimizado para datos históricos con caché y debounce
  const {
    data: historicalData,
    loading: loadingHistory,
    refetch: refetchHistory
  } = useWeatherHistory({
    stationId: selectedStation?.id || null,
    startDate,
    endDate,
    enabled: activeTab === 'station', // Cargar cuando estamos en la vista de estación
    debounceDelay: 800 // 800ms delay para cambios de fechas
  });

  const [networkVariable, setNetworkVariable] = useState<WeatherVariable>('temperature');

  const variableConfig: Record<string, { label: string, unit: string, icon: React.ReactNode, color: string }> = {
    temperature: { label: 'Temperatura', unit: '°C', icon: <Thermometer size={18} />, color: 'bg-orange-500/10 text-orange-400' },
    humidity: { label: 'Humedad', unit: '%', icon: <Droplets size={18} />, color: 'bg-blue-500/10 text-blue-400' },
    pressure: { label: 'Presión', unit: 'hPa', icon: <Gauge size={18} />, color: 'bg-indigo-500/10 text-indigo-400' },
    windSpeed: { label: 'Viento (Vel)', unit: 'km/h', icon: <Wind size={18} />, color: 'bg-slate-500/10 text-slate-300' },
    windDirection: { label: 'Viento (Dir)', unit: '°', icon: <Navigation size={18} />, color: 'bg-slate-500/10 text-slate-300' },
    rainfall: { label: 'Lluvia (Int)', unit: 'mm/h', icon: <CloudRain size={18} />, color: 'bg-cyan-500/10 text-cyan-400' },
    uvIndex: { label: 'Índice UV', unit: '', icon: <Sun size={18} />, color: 'bg-amber-500/10 text-amber-400' },
    solarRadiation: { label: 'Rad. Solar', unit: 'W/m²', icon: <SunMedium size={18} />, color: 'bg-yellow-500/10 text-yellow-400' },
    pm25: { label: 'PM 2.5', unit: 'µg/m³', icon: <Activity size={18} />, color: 'bg-red-500/10 text-red-400' },
    pm10: { label: 'PM 10', unit: 'µg/m³', icon: <Activity size={18} />, color: 'bg-red-600/10 text-red-500' },
    batteryVoltage: { label: 'Batería', unit: 'V', icon: <Battery size={18} />, color: 'bg-emerald-500/10 text-emerald-400' },
  };

  const getVariableInfo = (v: string) => variableConfig[v] || { label: v, unit: '', icon: <Activity size={18} />, color: 'bg-slate-800 text-slate-400' };

  const onSelectStation = async (station: Station, switchTab = true) => {
    setSelectedStation({ ...station, history: [] });
    setAiInsight(null);
    if (switchTab) setActiveTab('station'); // Cambiar a vista de estación solo si se solicita

    try {
      // Solo traer datos actuales, los históricos se manejan con useWeatherHistory
      const actual = await fetchActualClima(station.id).catch(() => null);

      // Si hay datos de la API, usarlos; si no, usar mock pero actualizar timestamp
      let currentData = actual;
      if (!actual || !actual.timestamp) {
        currentData = {
          ...station.currentData,
          timestamp: new Date().toISOString() // Actualizar timestamp a hora actual
        };
      }

      const fullStation = {
        ...station,
        currentData: currentData,
        history: [] // Los históricos se manejan por separado con useWeatherHistory
      };

      setSelectedStation(fullStation);
      setStations(prev => prev.map(s => s.id === station.id ? fullStation : s));
    } catch (err) {
      console.warn("Error al procesar estación", station.id);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      try {
        const data = await fetchStations();
        if (data && data.length > 0) {
          setStations(data);
          onSelectStation(data[0], false); // No cambiar pestaña al inicio
        }
      } catch (err) {
        console.error("Init failed", err);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  const detectedVariables = useMemo(() => {
    if (!selectedStation) return [];
    const keys = new Set<WeatherVariable>();
    const checkObj = (obj: any) => {
      (Object.keys(obj) as (keyof WeatherData)[]).forEach(k => {
        if (k !== 'timestamp' && obj[k] !== null && obj[k] !== undefined) keys.add(k as WeatherVariable);
      });
    };
    checkObj(selectedStation.currentData);
    // Usar historicalData del hook
    historicalData.forEach(checkObj);
    return Array.from(keys);
  }, [selectedStation?.currentData, historicalData]);

  // Estado para la variable activa en el gráfico del dashboard
  const [activeVariable, setActiveVariable] = useState<WeatherVariable>('temperature');

  // Actualizar la variable activa si no está disponible en la estación actual
  useEffect(() => {
    if (detectedVariables.length > 0 && !detectedVariables.includes(activeVariable)) {
      setActiveVariable(detectedVariables[0]);
    }
  }, [detectedVariables]);

  // Calcular el timestamp más reciente de los datos actuales
  const latestTimestamp = useMemo(() => {
    if (!selectedStation) return new Date().toISOString();
    return selectedStation.currentData?.timestamp || new Date().toISOString();
  }, [selectedStation?.currentData?.timestamp]);

  const historyStats = useMemo(() => {
    if (historicalData.length === 0) return null;
    const values = historicalData.map(d => d[activeVariable]).filter(t => typeof t === 'number') as number[];
    if (values.length === 0) return null;
    return {
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      max: Math.max(...values).toFixed(2),
      min: Math.min(...values).toFixed(2),
      samples: values.length,
      unit: getVariableInfo(activeVariable).unit
    };
  }, [historicalData, activeVariable]);

  const handleAIAnalysis = useCallback(async () => {
    if (!selectedStation) return;
    setLoadingAI(true);
    try {
      const insight = await analyzeHistoricalData(selectedStation.name, historicalData);
      setAiInsight(insight);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAI(false);
    }
  }, [selectedStation, historicalData]);


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center text-slate-800">
        <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mb-6" />
        <h2 className="text-2xl font-black tracking-tighter uppercase">UTPL CLIMA</h2>
        <p className="text-slate-600 font-medium animate-pulse mt-2">Sincronizando red de estaciones...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800 font-inter overflow-hidden">
      <nav className="w-full md:w-80 bg-white/80 backdrop-blur-xl border-r border-slate-200 p-6 flex flex-col gap-8 z-20 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/40">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter leading-none uppercase">Observatorio</h1>
            <p className="text-[10px] text-blue-600 font-bold uppercase mt-1 tracking-widest">UTPL - Loja</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {['network', 'station'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-xl' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              {tab === 'station' && <LayoutDashboard size={20} />}
              {tab === 'network' && <Network size={20} />}
              <span className="font-bold text-sm uppercase tracking-tighter">
                {tab === 'station' ? 'Estaciones' : 'Mapa de Red'}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-h-0 border-t border-slate-200 pt-6">
          <p className="text-[10px] uppercase font-black text-slate-500 mb-4 tracking-[0.2em] px-2 flex items-center justify-between">
            Estaciones
            <span className="bg-blue-600 px-2 py-0.5 rounded text-white text-[9px]">{stations.length}</span>
          </p>
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
            {stations.map(station => (
              <button
                key={station.id}
                onClick={() => onSelectStation(station)}
                className={`text-left p-4 rounded-2xl border-2 transition-all duration-300 ${selectedStation?.id === station.id ? 'border-blue-500 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30' : 'border-slate-300 bg-white hover:bg-gradient-to-br hover:from-slate-50 hover:to-blue-50 text-slate-700 hover:border-blue-400 hover:shadow-md'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-xs font-black truncate leading-tight uppercase tracking-tight">{station.name}</p>
                  <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${station.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                </div>
                <span className="text-[9px] font-mono opacity-50 block uppercase">ID: {station.id}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className={`flex-1 flex flex-col ${activeTab === 'network' ? 'overflow-hidden' : 'overflow-y-auto'} p-4 md:p-10`}>
        {activeTab === 'station' && selectedStation && (
          <div className="max-w-7xl mx-auto space-y-4 animate-in fade-in duration-700">
            {/* Header compacto en una sola línea */}
            <header className="flex items-center justify-between gap-4">
              {/* Título e info compacta */}
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black tracking-tighter uppercase text-slate-800">
                  {selectedStation.name}
                </h2>
                <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded-md uppercase">
                  ID: {selectedStation.id}
                </span>
                <span className="text-[9px] text-slate-400 font-medium">
                  {latestTimestamp ? new Date(latestTimestamp).toLocaleString('es-EC', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  }).replace('.', '') : 'Sin datos'}
                </span>
              </div>

              {/* Botones de período - compactos */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-orange-600 uppercase tracking-wider">Período:</span>
                {[
                  { value: '24h' as TimeRange, label: '24h' },
                  { value: '3d' as TimeRange, label: '3d' },
                  { value: '7d' as TimeRange, label: '7d' },
                  { value: '30d' as TimeRange, label: '30d' },
                  { value: '1y' as TimeRange, label: '1a' }
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleTimeRangeChange(value)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 border ${selectedTimeRange === value
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 border-orange-400 text-white shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-orange-400 hover:bg-orange-50'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {/* Tarjetas de datos actuales */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {detectedVariables.map(v => {
                const info = getVariableInfo(v);
                const isActive = activeVariable === v;
                return (
                  <StatCard
                    key={v}
                    label={info.label}
                    value={selectedStation.currentData[v] !== null && selectedStation.currentData[v] !== undefined ? (selectedStation.currentData[v] as number).toFixed(1) : '--'}
                    unit={info.unit}
                    icon={info.icon}
                    colorClass={info.color}
                    onClick={() => setActiveVariable(v)}
                    isActive={isActive}
                  />
                );
              })}
            </div>

            {/* Gráfico principal - Optimizado */}
            <div className="bg-white/90 p-4 rounded-2xl border border-slate-200 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                  {getVariableInfo(activeVariable).label}
                </h3>
                {loadingHistory && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <RefreshCw className="animate-spin" size={12} />
                    <span>Cargando...</span>
                  </div>
                )}
              </div>
              <div className="w-full h-96">
                {historicalData.length > 0 ? (
                  activeVariable === 'rainfall' ? (
                    <RainfallChart
                      key={`${selectedTimeRange}-${activeVariable}`}
                      data={historicalData}
                      dataKey={activeVariable}
                      color="#3b82f6"
                      label={getVariableInfo(activeVariable).label}
                      unit={getVariableInfo(activeVariable).unit}
                    />
                  ) : (
                    <WeatherChart
                      key={`${selectedTimeRange}-${activeVariable}`}
                      data={historicalData}
                      dataKey={activeVariable}
                      color="#3b82f6"
                      label={getVariableInfo(activeVariable).label}
                      unit={getVariableInfo(activeVariable).unit}
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                    <span className="text-5xl mb-4">📊</span>
                    <p className="text-xs uppercase font-bold tracking-widest text-center">
                      No hay datos disponibles para este período
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Estadísticas y AI Insight */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Estadísticas */}
              {historyStats && (
                <>
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 shadow-sm">
                    <p className="text-[9px] font-black text-blue-600 uppercase mb-1 tracking-wider">Promedio</p>
                    <p className="text-2xl font-black text-blue-600">{historyStats.avg} <span className="text-sm text-slate-500">{historyStats.unit}</span></p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-xl border border-orange-200 shadow-sm">
                    <p className="text-[9px] font-black text-orange-600 uppercase mb-1 tracking-wider">Máximo</p>
                    <p className="text-2xl font-black text-orange-600">{historyStats.max} <span className="text-sm text-slate-500">{historyStats.unit}</span></p>
                  </div>
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-xl border border-slate-300 shadow-sm">
                    <p className="text-[9px] font-black text-slate-600 uppercase mb-1 tracking-wider">Muestras</p>
                    <p className="text-2xl font-black text-slate-700">{historyStats.samples}</p>
                  </div>
                </>
              )}
            </div>

            {/* AI Insight - OCULTO */}
            {/* {aiInsight && (
              <div className="glass p-8 rounded-[2.5rem] bg-indigo-950/20 border-indigo-500/20 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <Cpu className="text-indigo-400" size={24} />
                  <h3 className="text-xl font-black uppercase tracking-tight">Análisis IA</h3>
                </div>
                <div className="space-y-6">
                  <p className="text-sm text-slate-300 leading-relaxed font-medium italic">"{aiInsight.summary}"</p>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Recomendaciones</p>
                    {aiInsight.recommendations.map((r, i) => (
                      <div key={i} className="flex gap-3 text-xs text-slate-400 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                        <ChevronRight size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )} */}
          </div>
        )}


        {activeTab === 'network' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-700">
            {/* Header compacto en una sola línea */}
            <div className="flex items-center justify-between gap-4 mb-3">
              {/* Título compacto */}
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black tracking-tighter uppercase text-slate-800">Red Global</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{stations.length} Nodos</span>
              </div>

              {/* Controles en línea */}
              <div className="flex items-center gap-3">
                {/* Botones de variables - compactos */}
                <div className="flex gap-2">
                  {['temperature', 'rainfall', 'windSpeed', 'humidity', 'pressure', 'pm25'].map(v => (
                    <button
                      key={v}
                      onClick={() => setNetworkVariable(v as WeatherVariable)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all duration-300 ${networkVariable === v
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-500 text-white shadow-md'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:shadow-sm'
                        }`}
                      title={getVariableInfo(v).label}
                    >
                      {getVariableInfo(v).label.split(' ')[0]}
                    </button>
                  ))}
                </div>

                {/* Toggle Lista/Mapa - compacto */}
                <div className="flex bg-white border border-slate-300 rounded-lg p-0.5 shadow-sm">
                  <button
                    onClick={() => setNetworkSubView('list')}
                    className={`px-4 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${networkSubView === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setNetworkSubView('map')}
                    className={`px-4 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${networkSubView === 'map' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    Mapa
                  </button>
                </div>
              </div>
            </div>

            {/* Contenido principal - Mapa o Lista */}
            <div className="flex-1 min-h-0">
              {networkSubView === 'map' ? (
                <StationMap
                  stations={stations}
                  variable={networkVariable}
                  unit={getVariableInfo(networkVariable).unit}
                  onStationSelect={(s) => { onSelectStation(s); setActiveTab('station'); }}
                />
              ) : (
                <div className="h-full overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stations.map(s => (
                      <div
                        key={s.id}
                        onClick={() => { onSelectStation(s); setActiveTab('station'); }}
                        className="bg-white/80 p-6 rounded-[2rem] cursor-pointer hover:border-blue-500/50 transition-all border border-slate-200 shadow-sm group"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <p className="font-black text-xs uppercase tracking-tight truncate w-3/4">{s.name}</p>
                          <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-black">{s.currentData[networkVariable]?.toFixed(1) || '--'}</span>
                          <span className="text-slate-500 text-xs font-bold">{getVariableInfo(networkVariable).unit}</span>
                        </div>
                        <p className="mt-4 text-[9px] font-black text-slate-600 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Ver Detalles →</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

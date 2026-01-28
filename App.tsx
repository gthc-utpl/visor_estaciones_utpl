
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
import StationMap from './components/StationMap';
import { analyzeStationData, analyzeHistoricalData } from './services/gemini';
import { fetchStations, fetchActualClima, fetchClimaRango } from './services/api';
import { MOCK_STATIONS } from './constants';

const App: React.FC = () => {
  const [stations, setStations] = useState<Station[]>(MOCK_STATIONS);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingNetwork, setRefreshingNetwork] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'network' | 'history'>('dashboard');
  const [networkSubView, setNetworkSubView] = useState<'list' | 'map'>('list');
  
  const [startDate, setStartDate] = useState<string>(new Date(Date.now() - 24 * 3600000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [networkVariable, setNetworkVariable] = useState<WeatherVariable>('temperature');
  const [historyVariable, setHistoryVariable] = useState<WeatherVariable>('temperature');

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

  const onSelectStation = async (station: Station) => {
    setSelectedStation({ ...station, history: [] });
    setAiInsight(null);
    try {
      // 1. Traemos actual y rango simultáneamente
      const [actual, recentHist] = await Promise.all([
        fetchActualClima(station.id).catch(() => null),
        fetchClimaRango(station.id, startDate, endDate).catch(() => [])
      ]);

      // 2. Definimos el punto de verdad actual (solo para los StatCards)
      let mergedActual: WeatherData = actual || station.currentData;
      
      // 3. El historial es puramente el de la API para mantener integridad
      const fullStation = { 
        ...station, 
        currentData: mergedActual, 
        history: recentHist 
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
          onSelectStation(data[0]);
        }
      } catch (err) {
        console.error("Init failed", err);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  useEffect(() => {
    // Al cargar históricos, usamos solo el resultado de la API sin inyectar el dato actual
    if (activeTab === 'history' && selectedStation) {
      const loadHist = async () => {
        setLoadingHistory(true);
        try {
          const history = await fetchClimaRango(selectedStation.id, startDate, endDate);
          setSelectedStation(prev => prev && prev.id === selectedStation.id ? { ...prev, history: history } : prev);
        } catch (err) {
          console.error("Historical error", err);
        } finally {
          setLoadingHistory(false);
        }
      };
      loadHist();
    }
  }, [activeTab, startDate, endDate, selectedStation?.id]);

  const detectedVariables = useMemo(() => {
    if (!selectedStation) return [];
    const keys = new Set<WeatherVariable>();
    const checkObj = (obj: any) => {
      (Object.keys(obj) as (keyof WeatherData)[]).forEach(k => {
        if (k !== 'timestamp' && obj[k] !== null && obj[k] !== undefined) keys.add(k as WeatherVariable);
      });
    };
    checkObj(selectedStation.currentData);
    selectedStation.history.forEach(checkObj);
    return Array.from(keys);
  }, [selectedStation?.currentData, selectedStation?.history]);

  const dashboardChartKey = useMemo(() => {
    const preferred = ['temperature', 'humidity', 'windSpeed'];
    for (const p of preferred) if (detectedVariables.includes(p as WeatherVariable)) return p as WeatherVariable;
    return detectedVariables[0] || 'temperature';
  }, [detectedVariables]);

  const historyStats = useMemo(() => {
    const hist = selectedStation?.history || [];
    if (hist.length === 0) return null;
    const values = hist.map(d => d[historyVariable]).filter(t => typeof t === 'number') as number[];
    if (values.length === 0) return null;
    return {
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      max: Math.max(...values).toFixed(2),
      min: Math.min(...values).toFixed(2),
      samples: values.length,
      unit: getVariableInfo(historyVariable).unit
    };
  }, [selectedStation?.history, historyVariable]);

  const handleAIAnalysis = useCallback(async () => {
    if (!selectedStation) return;
    setLoadingAI(true);
    try {
      const insight = activeTab === 'history' 
        ? await analyzeHistoricalData(selectedStation.name, selectedStation.history)
        : await analyzeStationData(selectedStation);
      setAiInsight(insight);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAI(false);
    }
  }, [selectedStation, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-6" />
        <h2 className="text-2xl font-black tracking-tighter uppercase">UTPL CLIMA</h2>
        <p className="text-slate-400 font-medium animate-pulse mt-2">Sincronizando red de estaciones...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0f172a] text-slate-100 font-inter overflow-hidden">
      <nav className="w-full md:w-80 glass border-r border-slate-800 p-6 flex flex-col gap-8 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/40">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter leading-none uppercase">Observatorio</h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase mt-1 tracking-widest">UTPL - Loja</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {['dashboard', 'history', 'network'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-xl' : 'hover:bg-slate-800/60 text-slate-400'}`}
            >
              {tab === 'dashboard' && <LayoutDashboard size={20} />}
              {tab === 'history' && <History size={20} />}
              {tab === 'network' && <Network size={20} />}
              <span className="font-bold text-sm uppercase tracking-tighter">
                {tab === 'dashboard' ? 'Tiempo Real' : tab === 'history' ? 'Históricos' : 'Mapa de Red'}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-h-0 border-t border-slate-800 pt-6">
          <p className="text-[10px] uppercase font-black text-slate-500 mb-4 tracking-[0.2em] px-2 flex items-center justify-between">
            Estaciones API 
            <span className="bg-slate-800 px-2 py-0.5 rounded text-white text-[9px]">{stations.length}</span>
          </p>
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
            {stations.map(station => (
              <button
                key={station.id}
                onClick={() => onSelectStation(station)}
                className={`text-left p-4 rounded-2xl border transition-all ${selectedStation?.id === station.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 hover:bg-slate-800/40 text-slate-400'}`}
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

      <main className="flex-1 overflow-y-auto p-4 md:p-10 bg-[radial-gradient(circle_at_top_right,_#1e293b_0%,_#0f172a_70%)]">
        {activeTab === 'dashboard' && selectedStation && (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-2">
                <h2 className="text-5xl font-black tracking-tighter uppercase">{selectedStation.name}</h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">En Vivo</span>
                  </div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                    Actualizado: {new Date(selectedStation.currentData.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleAIAnalysis}
                disabled={loadingAI}
                className="flex items-center gap-3 bg-white text-slate-900 px-8 py-4 rounded-2xl font-black hover:scale-105 transition-all disabled:opacity-50 shadow-2xl"
              >
                {loadingAI ? <RefreshCw className="animate-spin" size={20} /> : <Cpu size={20} />}
                Análisis Gemini IA
              </button>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {detectedVariables.map(v => {
                const info = getVariableInfo(v);
                return (
                  <StatCard 
                    key={v}
                    label={info.label}
                    value={selectedStation.currentData[v] !== null ? selectedStation.currentData[v]!.toFixed(1) : '--'}
                    unit={info.unit}
                    icon={info.icon}
                    colorClass={info.color}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 glass p-8 rounded-[2.5rem] border-slate-800/60 shadow-2xl bg-slate-900/10 min-h-[400px]">
                <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 mb-10 flex items-center gap-3 border-l-4 border-blue-600 pl-4">
                  Trend: {getVariableInfo(dashboardChartKey).label} (Últimas 24h)
                </h3>
                <div className="w-full h-64">
                   <WeatherChart 
                    data={selectedStation.history} 
                    dataKey={dashboardChartKey} 
                    color="#3b82f6" 
                    label={getVariableInfo(dashboardChartKey).label} 
                   />
                </div>
              </div>

              <div className="glass p-8 rounded-[2.5rem] bg-indigo-950/20 border-indigo-500/20 shadow-2xl flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                  <Cpu className="text-indigo-400" size={24} />
                  <h3 className="text-xl font-black uppercase tracking-tight">IA Insight</h3>
                </div>
                {aiInsight ? (
                  <div className="space-y-6 flex-1">
                    <p className="text-sm text-slate-300 leading-relaxed font-medium italic">"{aiInsight.summary}"</p>
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Recomendaciones</p>
                      {aiInsight.recommendations.map((r, i) => (
                        <div key={i} className="flex gap-3 text-xs text-slate-400 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                          <ChevronRight size={14} className="text-indigo-500 shrink-0" />
                          <span className="leading-tight">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                    <Search size={48} className="text-slate-700 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Esperando diagnóstico...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && selectedStation && (
          <div className="max-w-6xl mx-auto space-y-10 animate-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-2">
                <h2 className="text-5xl font-black tracking-tighter flex items-center gap-4 uppercase">
                  <History className="text-emerald-500" /> Históricos
                </h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                  Estación: <span className="text-emerald-400">{selectedStation.name}</span>
                </p>
              </div>
              <div className="flex gap-4">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 outline-none"
                />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 outline-none"
                />
              </div>
            </header>

            <div className="glass p-8 rounded-[3rem] border-emerald-500/10 bg-slate-900/10 min-h-[500px]">
              <div className="flex flex-wrap gap-2 mb-10">
                {detectedVariables.map(v => (
                  <button
                    key={v}
                    onClick={() => setHistoryVariable(v)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${historyVariable === v ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}
                  >
                    {getVariableInfo(v).label}
                  </button>
                ))}
              </div>
              
              {loadingHistory ? (
                <div className="h-64 flex flex-col items-center justify-center opacity-40">
                  <RefreshCw className="animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Consultando registros...</p>
                </div>
              ) : (
                <div className="w-full h-80">
                   <WeatherChart 
                    data={selectedStation.history} 
                    dataKey={historyVariable} 
                    color="#10b981" 
                    label={getVariableInfo(historyVariable).label} 
                   />
                </div>
              )}
            </div>

            {historyStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass p-6 rounded-3xl border-slate-800/60">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Promedio Periodo</p>
                  <p className="text-3xl font-black">{historyStats.avg} {historyStats.unit}</p>
                </div>
                <div className="glass p-6 rounded-3xl border-emerald-500/20 bg-emerald-500/5">
                  <p className="text-[10px] font-black text-emerald-500 uppercase mb-2">Valor Máximo</p>
                  <p className="text-3xl font-black text-emerald-400">{historyStats.max} {historyStats.unit}</p>
                </div>
                <div className="glass p-6 rounded-3xl border-slate-800/60">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Total Muestras</p>
                  <p className="text-3xl font-black text-slate-400">{historyStats.samples}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'network' && (
          <div className="h-full flex flex-col space-y-10 animate-in fade-in duration-700">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div className="space-y-2">
                <h2 className="text-5xl font-black tracking-tighter uppercase">Red Global</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Nodos Activos: {stations.length}</p>
              </div>
              <div className="flex bg-slate-900/80 border border-slate-800 rounded-2xl p-1">
                <button 
                  onClick={() => setNetworkSubView('list')}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${networkSubView === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                >
                  Lista
                </button>
                <button 
                  onClick={() => setNetworkSubView('map')}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${networkSubView === 'map' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                >
                  Mapa
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[400px]">
              {networkSubView === 'map' ? (
                <StationMap 
                  stations={stations} 
                  variable={networkVariable}
                  unit={getVariableInfo(networkVariable).unit}
                  onStationSelect={(s) => { onSelectStation(s); setActiveTab('dashboard'); }}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {stations.map(s => (
                    <div 
                      key={s.id}
                      onClick={() => { onSelectStation(s); setActiveTab('dashboard'); }}
                      className="glass p-6 rounded-[2rem] cursor-pointer hover:border-blue-500/50 transition-all bg-slate-900/10 group"
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
              )}
            </div>

            <div className="flex gap-4 pb-12 overflow-x-auto">
               {['temperature', 'rainfall', 'windSpeed', 'humidity', 'pressure', 'pm25'].map(v => (
                 <button
                    key={v}
                    onClick={() => setNetworkVariable(v as WeatherVariable)}
                    className={`whitespace-nowrap px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${networkVariable === v ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                 >
                    {getVariableInfo(v).label}
                 </button>
               ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

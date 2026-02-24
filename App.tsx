import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  Map,
  Wind,
  Droplets,
  Thermometer,
  Activity,
  Search,
  RefreshCw,
  Download,
  Loader2,
  X,
  Globe,
  Sun,
  LogIn,
  LogOut,
  BarChart3
} from 'lucide-react';
import { fetchStations, fetchActualClima, fetchClimaRango } from './services/api';
import { Station, WeatherData } from './types';
import StationMap from './components/StationMap';
import StationCard from './components/StationCard';
import LoginModal from './components/LoginModal';
import AdminDashboard from './components/AdminDashboard';
import { useWeatherHistory } from './hooks/useWeatherHistory';
import { useAuth } from './hooks/useAuth';

// Configuración de variables
const variableConfig: Record<string, { label: string, unit: string, icon: React.ReactNode, color: string }> = {
  temperature: {
    label: 'Temperatura',
    unit: '°C',
    icon: <Thermometer className="w-5 h-5" />,
    color: 'from-orange-500 to-red-500'
  },
  humidity: {
    label: 'Humedad',
    unit: '%',
    icon: <Droplets className="w-5 h-5" />,
    color: 'from-blue-400 to-cyan-500'
  },
  pressure: {
    label: 'Presión',
    unit: 'hPa',
    icon: <Activity className="w-5 h-5" />,
    color: 'from-purple-500 to-indigo-600'
  },
  windSpeed: {
    label: 'Viento (Vel)',
    unit: 'km/h',
    icon: <Wind className="w-5 h-5" />,
    color: 'from-emerald-400 to-teal-500'
  },
  windDirection: {
    label: 'Viento (Dir)',
    unit: '°',
    icon: <Globe className="w-5 h-5" />,
    color: 'from-slate-500 to-slate-700'
  },
  rainfall: {
    label: 'Lluvia (Int)',
    unit: 'mm',
    icon: <Cloud className="w-5 h-5" />,
    color: 'from-blue-600 to-blue-800'
  },
  solarRadiation: {
    label: 'Radiación',
    unit: 'W/m²',
    icon: <Sun className="w-5 h-5" />,
    color: 'from-yellow-400 to-orange-500'
  },
  pm25: {
    label: 'PM 2.5',
    unit: 'µg/m³',
    icon: <Activity className="w-5 h-5" />,
    color: 'from-gray-500 to-gray-700'
  }
};

type TimeRange = '24H' | '3D' | '7D' | '30D' | '1A';

const App: React.FC = () => {
  const { profile, isAdmin, logout } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [comparisonStation, setComparisonStation] = useState<Station | null>(null);

  const [activeVariable, setActiveVariable] = useState<string>('temperature');
  const [loading, setLoading] = useState(true);
  const [refreshingNetwork, setRefreshingNetwork] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Estados visuales - "activeTab" ya no es necesario estructuralmente, pero ayuda a lógica interna si se requiere
  // Ahora la UI es: ¿Hay estación seleccionada? -> Panel Derecho visible. Siempre -> Mapa visible.

  const [networkSubView, setNetworkSubView] = useState<'list' | 'map'>('map'); // Controla las capas del mapa (light vs satelite)
  const [networkVariable, setNetworkVariable] = useState<string>('temperature');
  const [graphVariable, setGraphVariable] = useState<string>('temperature'); // Variable para el gráfico del StationCard

  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('30D');
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString()
  });

  // Hook principal de datos históricos
  const { data: historicalData, loading: loadingHistory } = useWeatherHistory({
    stationId: selectedStation?.id,
    startDate: dateRange.start,
    endDate: dateRange.end,
    enabled: !!selectedStation
  });

  // Hook para datos de comparación
  const { data: comparisonHistory } = useWeatherHistory({
    stationId: comparisonStation?.id,
    startDate: dateRange.start,
    endDate: dateRange.end,
    enabled: !!comparisonStation
  });

  // Update dateRange when selectedTimeRange changes
  useEffect(() => {
    const now = Date.now();
    let milliseconds = 30 * 24 * 60 * 60 * 1000; // Default 30 days

    switch (selectedTimeRange) {
      case '24H':
        milliseconds = 24 * 60 * 60 * 1000;
        break;
      case '3D':
        milliseconds = 3 * 24 * 60 * 60 * 1000;
        break;
      case '7D':
        milliseconds = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30D':
        milliseconds = 30 * 24 * 60 * 60 * 1000;
        break;
    }

    setDateRange({
      start: new Date(now - milliseconds).toISOString(),
      end: new Date(now).toISOString()
    });
  }, [selectedTimeRange]);

  useEffect(() => {
    loadStations();
    const interval = setInterval(loadStations, 300000); // 5 min refresh
    return () => clearInterval(interval);
  }, []);

  const loadStations = async () => {
    setRefreshingNetwork(true);
    try {
      const data = await fetchStations(); // data is Station[]
      const stationsWithData = await Promise.all(
        data.map(async (station) => {
          try {
            const weather = await fetchActualClima(station.id);
            return {
              ...station, // Preserve existing data (id, name, location, type)
              status: weather ? 'online' : 'offline',
              lastUpdate: weather?.timestamp || new Date().toISOString(),
              currentData: weather || {},
              history: [],
              supportedVariables: ['temperature', 'humidity', 'windSpeed', 'rainfall', 'pressure']
            } as Station;
          } catch (e) {
            return {
              ...station,
              status: 'offline',
              lastUpdate: new Date().toISOString(),
              currentData: null,
              history: [],
              supportedVariables: ['temperature', 'humidity', 'windSpeed', 'rainfall', 'pressure']
            } as Station;
          }
        })
      );
      setStations(stationsWithData);
    } catch (error) {
      console.error("Error loading stations:", error);
    } finally {
      setLoading(false);
      setRefreshingNetwork(false);
    }
  };

  const calculateDateRange = (range: TimeRange) => {
    const end = new Date();
    const start = new Date();
    switch (range) {
      case '24H': start.setTime(end.getTime() - 24 * 60 * 60 * 1000); break;
      case '3D': start.setTime(end.getTime() - 3 * 24 * 60 * 60 * 1000); break;
      case '7D': start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30D': start.setTime(end.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case '1A': start.setFullYear(end.getFullYear() - 1); break;
    }
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    setSelectedTimeRange(range);
    setDateRange(calculateDateRange(range));
  };

  const getVariableInfo = (v: string) => variableConfig[v] || { label: v, unit: '', icon: <Activity size={18} />, color: 'bg-slate-800 text-slate-400' };

  // Helper para tiempo relativo (ej. "hace 10 min")
  const getSimulatedTimeAgo = (isoDate: string | undefined) => {
    if (!isoDate) return 'Sin datos';
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    return 'Hace >1d';
  };

  // Helper: obtener valor formateado de la variable de red para una estación
  const getNetworkVarDisplay = (station: Station): string => {
    const raw = station.currentData?.[networkVariable as keyof WeatherData];
    if (raw === null || raw === undefined) return '--';
    const val = Number(raw);
    if (isNaN(val)) return '--';
    // Conversión m/s → km/h para viento
    const displayed = networkVariable === 'windSpeed' ? val * 3.6 : val;
    const info = getVariableInfo(networkVariable);
    const decimals = networkVariable === 'humidity' ? 0 : 1;
    return `${displayed.toFixed(decimals)} ${info.unit}`;
  };

  const onSelectStation = async (station: Station, fromList = true) => {
    console.log('🎯 Station selected:', {
      stationId: station.id,
      stationName: station.name,
      fromList,
      currentData: station.currentData,
      location: station.location
    });
    setSelectedStation({ ...station, history: [] });
    // Al seleccionar, reseteamos comparación para evitar mezclas con datos viejos
    setComparisonStation(null);
  };

  // Estadísticas históricas memorizadas para Chart/Reporte
  const historyStats = useMemo(() => {
    if (!historicalData.length) return null;
    const values = historicalData
      .map(d => d[activeVariable as keyof WeatherData] as number)
      .filter(v => v !== null && v !== undefined);

    if (values.length === 0) return null;

    return {
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      max: Math.max(...values).toFixed(2),
      min: Math.min(...values).toFixed(2),
      samples: values.length,
      unit: getVariableInfo(activeVariable).unit
    };
  }, [historicalData, activeVariable]);

  // Estadísticas globales de red
  const networkStats = useMemo(() => {
    if (stations.length === 0) return null;
    const values = stations
      .map(s => s.currentData?.[networkVariable]) // Fix typings access
      .filter(v => v !== null && v !== undefined) as number[];

    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = (sum / values.length).toFixed(1);
    const max = Math.max(...values).toFixed(1); // Fix Math.max empty array issue if filter removes all
    const online = stations.filter(s => s.status === 'online').length;

    return { avg, max, online, total: stations.length };
  }, [stations, networkVariable]); // Added networkVariable dependency




  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-6" />
        <h2 className="text-2xl font-black tracking-tighter uppercase">UTPL CLIMA</h2>
        <p className="text-slate-400 font-medium animate-pulse mt-2">Inicializando Observatorio...</p>
      </div>
    );
  }

  // If admin dashboard is active, show it instead
  if (showAdminDashboard && isAdmin) {
    return <AdminDashboard onBack={() => setShowAdminDashboard(false)} />;
  }

  return (
    <div className="h-screen w-screen relative bg-slate-50 text-slate-800 font-inter overflow-hidden select-none">
      {/* Login Modal */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

      {/* CAPA 0: MAPA DE FONDO (Siempre visible) */}
      <div className="absolute inset-0 z-0">
        <StationMap
          stations={stations}
          onStationSelect={(s) => onSelectStation(s, false)}
          selectedStation={selectedStation}
          variable={networkVariable as any}
          unit={variableConfig[networkVariable]?.unit || ''}
          heatmapMode={false}
          tileLayer={networkSubView === 'map' ? 'light' : 'satellite'}
        />
        {/* Overlay removed for cleaner light mode */}
      </div>

      {/* CAPA 1: BARRA SUPERIOR FLOTANTE (Global Stats & Brand) */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">

        {/* Brand & Stats Widget */}
        <div className="flex flex-col gap-2 pointer-events-auto shadow-2xl">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 border border-slate-200/50 flex items-center gap-4 w-fit shadow-sm">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/30">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter leading-none uppercase text-slate-800">Observatorio UTPL</h1>
              <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest">Loja, Ecuador</p>
            </div>

            {networkStats && (
              <>
                <div className="h-8 w-px bg-slate-200 mx-2"></div>
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase block tracking-wider">Promedio Red</span>
                    <span className="text-lg font-black text-slate-800 leading-none">{networkStats.avg}<span className="text-[9px] ml-0.5 align-top text-slate-400 font-bold">°C</span></span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase block tracking-wider">Estado</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-xs font-bold text-green-600">{networkStats.online}/{networkStats.total} Online</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Variable Selector (Floating Pills) — siempre visible */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md shadow-xl rounded-full p-1.5 border border-slate-200 flex gap-1">
          {['temperature', 'rainfall', 'windSpeed', 'humidity'].map(v => (
            <button
              key={v}
              onClick={() => setNetworkVariable(v)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${networkVariable === v ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {getVariableInfo(v).icon}
              <span className="hidden sm:inline">{getVariableInfo(v).label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CAPA 2: PANEL IZQUIERDO (Lista de Estaciones) — siempre visible */}
      <div className={`absolute top-28 left-4 bottom-4 z-10 flex flex-col transition-all duration-500 ease-out pointer-events-none ${selectedStation ? 'w-64' : 'w-80'}`}>
        <div className="bg-white/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-3xl border border-white/40 flex flex-col h-full overflow-hidden pointer-events-auto">
          {/* Header Lista */}
          <div className="p-4 border-b border-slate-100/50">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Estaciones</h3>
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold">{stations.length}</span>
            </div>
            {!selectedStation && (
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Filtrar por nombre o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-3 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                />
              </div>
            )}
          </div>

          {/* Lista Scrollable */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {stations
              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm))
              .map(station => {
                const isSelected = selectedStation?.id === station.id;
                return (
                  <button
                    key={station.id}
                    onClick={() => onSelectStation(station)}
                    className={`w-full text-left rounded-2xl transition-all group overflow-hidden ${
                      isSelected
                        ? 'bg-blue-50 border-2 border-blue-400 shadow-md p-3'
                        : 'bg-white/80 hover:bg-white border border-transparent hover:border-blue-200 hover:shadow-lg p-3'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className={`text-[11px] font-black uppercase tracking-tight leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {station.name}
                      </span>
                      <div className={`w-2 h-2 rounded-full shadow-sm flex-shrink-0 mt-0.5 ${station.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>

                    <div className="flex items-center justify-between">
                      {/* Valor actual de la variable de red */}
                      <span className={`text-sm font-black ${isSelected ? 'text-blue-600' : 'text-slate-800'}`}>
                        {getNetworkVarDisplay(station)}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">{getSimulatedTimeAgo(station.currentData?.timestamp)}</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* CAPA 3: PANEL DERECHO (Nuevo Widget tipo Wunderground) */}
      {selectedStation && (
        <div className="absolute top-20 right-4 z-20 w-full max-w-sm pointer-events-none flex flex-col items-end">
          {/* El componente StationCard es pointer-events-auto internamente o por el contenedor padre si ajustamos */}
          <div className="pointer-events-auto">
            <StationCard
              station={selectedStation}
              history={historicalData}
              loadingHistory={loadingHistory}
              onClose={() => setSelectedStation(null)}
              graphVariable={graphVariable}
              onGraphVariableChange={setGraphVariable}
              selectedTimeRange={selectedTimeRange}
              onTimeRangeChange={setSelectedTimeRange}
            />
          </div>
        </div>
      )}

      {/* Selector de Capas del Mapa (Flotante Abajo Derecha - Siempre visible) */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 pointer-events-auto">
        <div className="bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-2xl border border-white/20 flex flex-col gap-1">
          <button
            onClick={() => setNetworkSubView('map')}
            className={`p-2 rounded-lg transition-all ${networkSubView === 'map' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
            title="Mapa Oscuro"
          >
            <Map size={20} />
          </button>
          <button
            onClick={() => setNetworkSubView('list')}
            className={`p-2 rounded-lg transition-all ${networkSubView === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
            title="Satélite"
          >
            <Globe size={20} />
          </button>
        </div>
      </div>

      {/* CAPA 5: BOTÓN LOGIN/ADMIN (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        {isAdmin ? (
          <>
            <button
              onClick={() => setShowAdminDashboard(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-95"
            >
              <BarChart3 className="w-4 h-4" />
              Panel Admin
            </button>
            <button
              onClick={logout}
              className="p-2.5 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-md hover:bg-red-50 hover:border-red-200 transition-all group"
              title={`Cerrar sesión (${profile?.email})`}
            >
              <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-md text-xs font-bold text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            Admin
          </button>
        )}
      </div>

    </div>
  );
};

export default App;

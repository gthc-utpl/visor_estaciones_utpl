
import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Station, WeatherVariable } from '../types';
import { Info } from 'lucide-react';

interface StationMapProps {
  stations: Station[];
  variable: WeatherVariable;
  unit: string;
  onStationSelect: (station: Station) => void;
  selectedStation?: Station | null;
  heatmapMode?: boolean;
  activeVariable?: string;
  tileLayer?: 'light' | 'dark' | 'satellite';
}

interface RangeConfig {
  min: number;
  max: number;
  color: string;
  label: string;
  shadow: string;
}

const StationMap: React.FC<StationMapProps> = ({
  stations,
  variable,
  unit,
  onStationSelect,
  selectedStation,
  tileLayer = 'light'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [currentZoom, setCurrentZoom] = React.useState(8);
  const initialBoundsSetRef = useRef(false); // Track if initial bounds have been set

  // Configuración de rangos meteorológicos estándar
  const variableRanges = useMemo((): RangeConfig[] => {
    switch (variable) {
      case 'temperature':
        return [
          { min: -10, max: 12, color: '#3b82f6', label: 'Frío', shadow: 'rgba(59, 130, 246, 0.5)' },
          { min: 12, max: 18, color: '#10b981', label: 'Fresco', shadow: 'rgba(16, 185, 129, 0.5)' },
          { min: 18, max: 24, color: '#f59e0b', label: 'Templado', shadow: 'rgba(245, 158, 11, 0.5)' },
          { min: 24, max: 50, color: '#ef4444', label: 'Calor', shadow: 'rgba(239, 68, 68, 0.5)' },
        ];
      case 'humidity':
        return [
          { min: 0, max: 40, color: '#f59e0b', label: 'Seco', shadow: 'rgba(245, 158, 11, 0.5)' },
          { min: 40, max: 70, color: '#10b981', label: 'Óptimo', shadow: 'rgba(16, 185, 129, 0.5)' },
          { min: 70, max: 100, color: '#3b82f6', label: 'Húmedo', shadow: 'rgba(59, 130, 246, 0.5)' },
        ];
      case 'windSpeed':
        return [
          { min: 0, max: 5, color: '#94a3b8', label: 'Calma', shadow: 'rgba(148, 163, 184, 0.5)' },
          { min: 5, max: 15, color: '#10b981', label: 'Brisa', shadow: 'rgba(16, 185, 129, 0.5)' },
          { min: 15, max: 30, color: '#f59e0b', label: 'Fuerte', shadow: 'rgba(245, 158, 11, 0.5)' },
          { min: 30, max: 200, color: '#ef4444', label: 'Peligro', shadow: 'rgba(239, 68, 68, 0.5)' },
        ];
      case 'pm25':
        return [
          { min: 0, max: 12, color: '#10b981', label: 'Buena', shadow: 'rgba(16, 185, 129, 0.5)' },
          { min: 12, max: 35, color: '#f59e0b', label: 'Moderada', shadow: 'rgba(245, 158, 11, 0.5)' },
          { min: 35, max: 55, color: '#f97316', label: 'Pobre', shadow: 'rgba(249, 115, 22, 0.5)' },
          { min: 55, max: 500, color: '#ef4444', label: 'Insalubre', shadow: 'rgba(239, 68, 68, 0.5)' },
        ];
      case 'rainfall':
        return [
          { min: 0, max: 0.1, color: '#64748b', label: 'Seco', shadow: 'rgba(100, 116, 139, 0.3)' },
          { min: 0.1, max: 2, color: '#60a5fa', label: 'Llovizna', shadow: 'rgba(96, 165, 250, 0.5)' },
          { min: 2, max: 8, color: '#3b82f6', label: 'Lluvia', shadow: 'rgba(59, 130, 246, 0.5)' },
          { min: 8, max: 100, color: '#1d4ed8', label: 'Tormenta', shadow: 'rgba(29, 78, 216, 0.5)' },
        ];
      default:
        return [
          { min: 0, max: 1000, color: '#6366f1', label: 'Normal', shadow: 'rgba(99, 102, 241, 0.5)' }
        ];
    }
  }, [variable]);

  const getColorForValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '#334155';
    const range = variableRanges.find(r => val >= r.min && val < r.max);
    return range ? range.color : (val > variableRanges[variableRanges.length - 1].max ? variableRanges[variableRanges.length - 1].color : '#334155');
  };

  const getShadowForValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return 'rgba(0,0,0,0)';
    const range = variableRanges.find(r => val >= r.min && val < r.max);
    return range ? range.shadow : 'rgba(0,0,0,0)';
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: [-3.99, -79.20],
      zoom: 8,
      zoomControl: false,
      attributionControl: false // Limpiamos controles default para UI minimalista
    });

    // Inicialización del layer vacío, se llenará en el efecto de abajo
    tileLayerRef.current = L.tileLayer('', { maxZoom: 20 }).addTo(mapRef.current);

    // Listen to zoom changes
    mapRef.current.on('zoomend', () => {
      if (mapRef.current) {
        setCurrentZoom(mapRef.current.getZoom());
      }
    });

    // Set initial zoom
    setCurrentZoom(8);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Efecto para gestionar el cambio de TileLayer dinámicamente
  useEffect(() => {
    if (!tileLayerRef.current) return;

    let url = '';
    let attribution = '';

    switch (tileLayer) {
      case 'dark':
        url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; CARTO';
        break;
      case 'satellite':
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        attribution = '&copy; Esri';
        break;
      case 'light':
      default:
        url = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; CARTO';
        break;
    }

    tileLayerRef.current.setUrl(url);
  }, [tileLayer]);

  // Fly to selected station when clicked from list
  useEffect(() => {
    if (!mapRef.current || !selectedStation) return;
    mapRef.current.flyTo([selectedStation.location.lat, selectedStation.location.lng], 13, {
      animate: true,
      duration: 1.2
    });
  }, [selectedStation]);

  useEffect(() => {
    if (!mapRef.current || stations.length === 0) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Filter stations based on zoom level
    // Zoom levels: 0-7 (world/country), 8-10 (region), 11-13 (city), 14+ (street)
    const filteredStations = stations.filter((station, index) => {
      if (currentZoom >= 11) return true; // Show all at city/street level
      if (currentZoom >= 9) return index % 2 === 0; // Show 50% at region level
      return index % 4 === 0; // Show 25% at country level
    });

    const group = L.featureGroup();

    filteredStations.forEach(station => {
      const val = station.currentData?.[variable] as number | null | undefined;
      const hasData = val !== null && val !== undefined;
      const isStationOnline = station.status === 'online' && station.currentData && Object.keys(station.currentData).length > 1;
      const markerColor = getColorForValue(hasData ? val : null);
      const markerShadow = getShadowForValue(hasData ? val : null);
      const isSelected = station.id === selectedStation?.id;

      // Display logic: value, N/D (online but no sensor), or OFF (offline)
      let valStr: string;
      if (hasData) {
        valStr = `${(val as number).toFixed(1)}${unit}`;
      } else if (isStationOnline) {
        valStr = 'N/D';
      } else {
        valStr = 'OFF';
      }

      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative group">
            <div class="w-7 h-7 rounded-full transition-all duration-300 ${isSelected ? 'border-[4px] border-orange-500 ring-4 ring-orange-300/50' : 'border-[3px] border-white group-hover:scale-110'} shadow-lg flex items-center justify-center" 
                 style="background-color: ${markerColor}; box-shadow: 0 0 ${isSelected ? '30px rgba(249, 115, 22, 0.6)' : '20px ' + markerShadow};">
              ${hasData ? '<div class="w-1.5 h-1.5 bg-white/80 rounded-full animate-ping"></div>' : ''}
            </div>
            <!-- Valor al lado del punto -->
            <div class="absolute left-9 top-0 whitespace-nowrap ${hasData ? 'bg-white/95' : 'bg-slate-100/80'} px-2 py-0.5 rounded-md text-[9px] font-black border ${hasData ? 'border-slate-300' : 'border-slate-200'} shadow-md cursor-pointer ${isSelected ? 'scale-110 origin-left border-blue-500 text-blue-700' : ''}" 
                 style="color: ${isSelected ? '' : hasData ? markerColor : '#94a3b8'};">
              ${valStr}
            </div>
            <!-- Nombre en hover (o seleccionado) -->
            <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/95 px-3 py-1 rounded-full text-[9px] font-black text-slate-800 border border-slate-300 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all cursor-pointer uppercase tracking-tighter shadow-xl z-[1001]">
              ${station.name}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([station.location.lat, station.location.lng], { icon: customIcon })
        .addTo(mapRef.current!)
        .on('click', () => {
          onStationSelect(station);
        });


      // Tooltip removed - information is already visible on hover via custom marker

      markersRef.current.push(marker);
      group.addLayer(marker);
    });

    // Only fit bounds on initial load, not on subsequent zoom changes
    if (stations.length > 0 && !selectedStation && !initialBoundsSetRef.current) {
      mapRef.current.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 10 });
      initialBoundsSetRef.current = true;
    }
  }, [stations, variable, unit, selectedStation, currentZoom]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Network Command Box - ELIMINADO */}

      {/* Leyenda de Escala - Reubicada para no tapar header */}
      <div className="absolute bottom-24 right-4 z-[1000]">
        <div className="bg-white/98 p-3 rounded-2xl border border-slate-200 backdrop-blur-xl shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-100 p-1 rounded-md">
              <Info size={12} className="text-indigo-600" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-700">Escala</span>
          </div>
          <div className="space-y-2">
            {variableRanges.map((range, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-md" style={{ backgroundColor: range.color, boxShadow: `0 0 8px ${range.shadow}` }}></div>
                  <span className="text-[9px] font-bold text-slate-700 uppercase tracking-tight">{range.label}</span>
                </div>
                <span className="text-[8px] font-mono text-slate-500 font-bold">
                  {range.min}{idx === variableRanges.length - 1 ? '+' : ''}{unit}
                </span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                <span className="text-[9px] font-bold text-slate-600 uppercase">Sin Dato</span>
              </div>
              <span className="text-[8px] font-mono text-slate-400 font-bold">--</span>
            </div>
          </div>
        </div>
      </div>

      <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-slate-100" />

      <div className="absolute bottom-4 right-4 z-[1000]">
        <div className="bg-white/90 px-3 py-1.5 rounded-lg text-[8px] font-mono text-slate-500 border border-slate-200 uppercase tracking-wider shadow-md">
          UTPL v1.3.1
        </div>
      </div>
    </div>
  );
};

export default StationMap;

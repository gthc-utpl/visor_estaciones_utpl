
import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Station, WeatherVariable } from '../types';
import { Info } from 'lucide-react';

interface StationMapProps {
  stations: Station[];
  variable: WeatherVariable;
  unit: string;
  onStationSelect: (station: Station) => void;
}

interface RangeConfig {
  min: number;
  max: number;
  color: string;
  label: string;
  shadow: string;
}

const StationMap: React.FC<StationMapProps> = ({ stations, variable, unit, onStationSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

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
      zoom: 12,
      zoomControl: false,
      attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mapRef.current);

    L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || stations.length === 0) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const group = L.featureGroup();

    stations.forEach(station => {
      const val = station.currentData[variable] as number | null;
      const markerColor = getColorForValue(val);
      const markerShadow = getShadowForValue(val);
      const isOffline = val === null || val === undefined;
      const valStr = !isOffline ? `${val.toFixed(1)}${unit}` : 'OFF';

      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative group">
            <div class="w-7 h-7 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center transition-all duration-300 transform group-hover:scale-125" 
                 style="background-color: ${markerColor}; box-shadow: 0 0 20px ${markerShadow};">
              ${!isOffline ? '<div class="w-1.5 h-1.5 bg-white/80 rounded-full animate-ping"></div>' : ''}
            </div>
            <!-- Valor al lado del punto -->
            <div class="absolute left-9 top-0 whitespace-nowrap bg-white/95 px-2 py-0.5 rounded-md text-[9px] font-black border border-slate-300 shadow-md pointer-events-none" 
                 style="color: ${markerColor};">
              ${valStr}
            </div>
            <!-- Nombre en hover -->
            <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/95 px-3 py-1 rounded-full text-[9px] font-black text-slate-800 border border-slate-300 opacity-0 group-hover:opacity-100 transition-all pointer-events-none uppercase tracking-tighter shadow-xl z-[1001]">
              ${station.name}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([station.location.lat, station.location.lng], { icon: customIcon })
        .addTo(mapRef.current!)
        .on('click', () => onStationSelect(station));


      marker.bindTooltip(`
        <div class="p-3 min-w-[140px]">
          <div class="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Nodo Estación</div>
          <div class="text-xs font-black text-slate-800 uppercase truncate">${station.name}</div>
          <div class="mt-2 pt-2 border-t border-slate-200 flex justify-between items-baseline">
            <span class="text-[9px] font-bold text-slate-600 uppercase">${variable}</span>
            <span class="text-sm font-black" style="color: ${markerColor}">${valStr}</span>
          </div>
        </div>
      `, {
        direction: 'top',
        offset: [0, -15],
        className: '!bg-white/95 !border-slate-300 !rounded-2xl !p-0 overflow-hidden !shadow-xl'
      });

      markersRef.current.push(marker);
      group.addLayer(marker);
    });

    if (stations.length > 0) {
      mapRef.current.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 12 });
    }
  }, [stations, variable, unit]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Network Command Box - ELIMINADO */}

      {/* Leyenda de Escala - Compacta y elegante */}
      <div className="absolute top-4 right-4 z-[1000]">
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

      <div ref={mapContainerRef} className="flex-1 w-full rounded-[3rem] overflow-hidden border border-slate-300 shadow-lg z-0" />

      <div className="absolute bottom-4 right-4 z-[1000]">
        <div className="bg-white/90 px-3 py-1.5 rounded-lg text-[8px] font-mono text-slate-500 border border-slate-200 uppercase tracking-wider shadow-md">
          UTPL v1.3.1
        </div>
      </div>
    </div>
  );
};

export default StationMap;

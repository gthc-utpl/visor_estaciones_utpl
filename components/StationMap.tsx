
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
    return range ? range.color : (val > variableRanges[variableRanges.length-1].max ? variableRanges[variableRanges.length-1].color : '#334155');
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
      zoom: 13,
      zoomControl: false,
      attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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
      
      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative group">
            <div class="w-7 h-7 rounded-full border-[3px] border-[#020617] flex items-center justify-center transition-all duration-300 transform group-hover:scale-125" 
                 style="background-color: ${markerColor}; box-shadow: 0 0 20px ${markerShadow};">
              ${!isOffline ? '<div class="w-1.5 h-1.5 bg-white/60 rounded-full animate-ping"></div>' : ''}
            </div>
            <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap glass px-3 py-1 rounded-full text-[9px] font-black text-white border-slate-700 opacity-0 group-hover:opacity-100 transition-all pointer-events-none uppercase tracking-tighter shadow-2xl z-[1001]">
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

      const valStr = !isOffline ? `${val.toFixed(1)}${unit}` : 'OFF';
      
      marker.bindTooltip(`
        <div class="p-3 min-w-[140px]">
          <div class="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Nodo Estación</div>
          <div class="text-xs font-black text-white uppercase truncate">${station.name}</div>
          <div class="mt-2 pt-2 border-t border-slate-800 flex justify-between items-baseline">
            <span class="text-[9px] font-bold text-slate-400 uppercase">${variable}</span>
            <span class="text-sm font-black text-white" style="color: ${markerColor}">${valStr}</span>
          </div>
        </div>
      `, {
        direction: 'top',
        offset: [0, -15],
        className: 'glass !bg-[#0f172a]/95 !border-slate-800 !rounded-2xl !p-0 overflow-hidden !shadow-2xl'
      });

      markersRef.current.push(marker);
      group.addLayer(marker);
    });

    if (stations.length > 0) {
      mapRef.current.fitBounds(group.getBounds(), { padding: [100, 100], maxZoom: 15 });
    }
  }, [stations, variable, unit]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Network Command Box */}
      <div className="absolute top-8 left-8 z-[1000] pointer-events-none space-y-4">
        <div className="glass p-5 rounded-[2rem] border-indigo-500/20 shadow-2xl bg-slate-950/70 backdrop-blur-xl max-w-xs">
           <div className="flex items-center gap-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-400">Network Command</h3>
           </div>
           <div className="space-y-1">
             <p className="text-[10px] text-slate-300 font-black uppercase tracking-wider">Visualizando {variable}</p>
             <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Sincronización UTPL :: v1.3.1 Active</p>
           </div>
        </div>
      </div>

      {/* Rango de Colores Legend */}
      <div className="absolute bottom-8 left-8 z-[1000]">
        <div className="glass p-5 rounded-[2.5rem] border-slate-800 bg-slate-950/90 backdrop-blur-2xl shadow-2xl min-w-[200px]">
           <div className="flex items-center gap-2 mb-5">
              <div className="bg-indigo-500/20 p-1.5 rounded-lg">
                <Info size={14} className="text-indigo-400" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Escala Crítica</span>
           </div>
           <div className="space-y-4">
              {variableRanges.map((range, idx) => (
                <div key={idx} className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: range.color, boxShadow: `0 0 10px ${range.shadow}` }}></div>
                    <span className="text-[10px] font-black text-slate-100 uppercase tracking-tight">{range.label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 font-bold">
                    {range.min}{idx === variableRanges.length - 1 ? '+' : ''}{unit}
                  </span>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase">Sin Reporte</span>
                </div>
                <span className="text-[10px] font-mono text-slate-700 font-bold">--</span>
              </div>
           </div>
        </div>
      </div>

      <div ref={mapContainerRef} className="flex-1 w-full rounded-[3rem] overflow-hidden border border-slate-800 shadow-inner z-0" />

      <div className="absolute bottom-8 right-16 z-[1000]">
        <div className="glass px-5 py-2.5 rounded-2xl text-[9px] font-mono text-slate-400 border-slate-800 bg-slate-950/70 uppercase tracking-widest shadow-xl">
          UTPL_GRID_V1.3.1 :: LOJA_GRID
        </div>
      </div>
    </div>
  );
};

export default StationMap;

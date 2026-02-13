import { Station, WeatherData } from '../types';
import { MOCK_STATIONS } from '../constants';

// --- 1. CONFIGURACIÓN DE URL Y HEADERS ---

// Usa la variable de entorno VITE_API_URL.
// En local (Development) forzamos el uso del proxy '/api' para evitar CORS.
// En producción (Vercel) usamos la variable de entorno.
const API_BASE_URL = (import.meta as any).env?.DEV ? '/api' : ((import.meta as any).env?.VITE_API_URL || 'https://protectorless-florentina-matrimonially.ngrok-free.dev');

// ESTO ES CRÍTICO: "ngrok-skip-browser-warning" evita que Ngrok devuelva HTML de advertencia.
const API_HEADERS = {
  "ngrok-skip-browser-warning": "true",
  "Content-Type": "application/json"
};

// --- 2. HELPERS DE PARSEO ---

const parseDate = (dateStr: any): string => {
  if (!dateStr) return new Date().toISOString();
  let s = String(dateStr).trim();
  // Corrige formatos que a veces vienen con espacio en vez de T
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const mapApiToWeatherData = (rawData: any): WeatherData => {
  if (!rawData) return { timestamp: new Date().toISOString() };

  const parse = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const clean = String(val).replace(',', '.').trim();
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  };

  // API v2.1 usa 'fecha_loja' como timestamp principal. 
  // En reportes diarios, puede venir como 'dia'.
  const ts = rawData.fecha_loja || rawData.dia || rawData.timestamp || new Date().toISOString();

  return {
    timestamp: parseDate(ts),
    // Mapeo robusto: API v2.1 (prioridad) + fallbacks v1.0 + fallbacks de Agregados
    temperature: parse(rawData.temp_aire ?? rawData.temp_promedio ?? rawData.temp_exterior ?? rawData.temperatura),
    humidity: parse(rawData.hum_relativa ?? rawData.hum_relativa_promedio ?? rawData.hum_exterior ?? rawData.humedad),
    pressure: parse(rawData.presion_bar ?? rawData.presion_promedio ?? rawData.presion),
    windSpeed: parse(rawData.viento_vel ?? rawData.viento_promedio ?? rawData.viento_velocidad ?? rawData.vel_viento),
    windDirection: parse(rawData.viento_dir ?? rawData.viento_direccion ?? rawData.dir_viento),
    rainfall: parse(rawData.lluvia_mm ?? rawData.lluvia_acumulada ?? rawData.lluvia_intensidad_mm ?? rawData.precipitacion),
    solarRadiation: parse(rawData.rad_solar ?? rawData.radiacion_solar ?? rawData.sol_rad),
    uvIndex: parse(rawData.indice_uv ?? rawData.uv_index ?? rawData.uv),
    pm25: parse(rawData.pm_2p5 ?? rawData.pm25_promedio ?? rawData.pm2_5 ?? rawData.pm25),
    pm10: parse(rawData.pm_10 ?? rawData.pm10_promedio ?? rawData.pm10),
    batteryVoltage: parse(rawData.voltaje_bateria ?? rawData.voltaje ?? rawData.battery)
  };
};

// --- 3. FUNCIONES DE FETCH (CON HEADERS) ---

export const fetchStations = async (): Promise<Station[]> => {
  try {
    // Agregamos { headers: API_HEADERS } para pasar el bloqueo de Ngrok
    const response = await fetch(`${API_BASE_URL}/estaciones`, { headers: API_HEADERS });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const apiData = await response.json();
    const stationsRaw = Array.isArray(apiData) ? apiData : [];

    // Combinar datos de la API con nuestra lista maestra de coordenadas (MOCK)
    return MOCK_STATIONS.map(masterStation => {
      const apiInfo = stationsRaw.find((s: any) => (s.station_id || s.id)?.toString() === masterStation.id);
      return {
        ...masterStation,
        name: apiInfo?.nombre_estacion || masterStation.name,
        location: {
          ...masterStation.location,
          lat: parseFloat(apiInfo?.latitud || masterStation.location.lat),
          lng: parseFloat(apiInfo?.longitud || masterStation.location.lng),
        },
        status: apiInfo ? 'online' : masterStation.status
      };
    });
  } catch (error) {
    console.error("fetchStations failed, using master list:", error);
    return MOCK_STATIONS;
  }
};

export const fetchActualClima = async (stationId: string): Promise<WeatherData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/clima/actual?station_id=${stationId}`, { headers: API_HEADERS });

    if (!response.ok) throw new Error('Error fetch actual');
    const data = await response.json();

    // API v2.1: /clima/actual siempre retorna array, tomar primer elemento
    if (Array.isArray(data) && data.length > 0) {
      return mapApiToWeatherData(data[0]);
    }

    return mapApiToWeatherData(data);
  } catch (error) {
    console.error(`fetchActualClima error for ${stationId}:`, error);
    return { timestamp: new Date().toISOString() };
  }
};

export const fetchClimaRango = async (stationId: string, inicio: string, fin: string): Promise<WeatherData[]> => {
  try {
    if (!inicio || !fin) return [];

    const startTime = performance.now();

    // La API requiere formato estricto YYYY-MM-DD
    const startStr = inicio.substring(0, 10);
    const endStr = fin.substring(0, 10);

    const url = `${API_BASE_URL}/clima/historico/${stationId}?inicio=${startStr}&fin=${endStr}`;
    console.log(`📡 Fetching History: ${url}`);

    const response = await fetch(url, { headers: API_HEADERS });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const rawData = await response.json();

    // Soporte para respuestas envueltas (data, results) o array directo
    const data = Array.isArray(rawData) ? rawData : (rawData.data || rawData.results || []);

    if (!Array.isArray(data)) {
      console.warn('⚠️ Unexpected history structure:', rawData);
      return [];
    }

    // La API v2.1 ya retorna datos ordenados descendentemente
    const mappedData = data
      .map(mapApiToWeatherData)
      .filter(d => d.timestamp !== null);

    const endTime = performance.now();
    console.log(`⚡ Fetched ${mappedData.length} records in ${(endTime - startTime).toFixed(2)}ms for station ${stationId}`);
    console.log(`📋 Data sample - Raw[0]:`, data[0]);
    console.log(`📋 Data sample - Mapped[0]:`, mappedData[0]);
    console.log(`📋 Data sample - Mapped[last]:`, mappedData[mappedData.length - 1]);

    return mappedData;
  } catch (error) {
    console.error("fetchClimaRango error:", error);
    return [];
  }
};
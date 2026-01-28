
import { Station, WeatherData } from '../types';
import { MOCK_STATIONS } from '../constants';

const API_BASE_URL = 'http://localhost:8002';

const parseDate = (dateStr: any): string => {
  if (!dateStr) return new Date().toISOString();
  let s = String(dateStr).trim();
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

  // API v2.1 usa 'fecha_loja' como timestamp principal
  const ts = rawData.fecha_loja || rawData.timestamp || new Date().toISOString();

  return {
    timestamp: parseDate(ts),
    // API v2.1 nombres normalizados (prioridad) + fallbacks para compatibilidad
    temperature: parse(rawData.temp_aire ?? rawData.temp_exterior ?? rawData.temperatura),
    humidity: parse(rawData.hum_relativa ?? rawData.hum_exterior ?? rawData.humedad),
    pressure: parse(rawData.presion_bar ?? rawData.presion),
    windSpeed: parse(rawData.viento_vel ?? rawData.viento_velocidad ?? rawData.vel_viento),
    windDirection: parse(rawData.viento_dir ?? rawData.viento_direccion ?? rawData.dir_viento),
    rainfall: parse(rawData.lluvia_mm ?? rawData.lluvia_intensidad_mm ?? rawData.precipitacion),
    solarRadiation: parse(rawData.rad_solar ?? rawData.radiacion_solar ?? rawData.sol_rad),
    uvIndex: parse(rawData.indice_uv ?? rawData.uv_index ?? rawData.uv),
    pm25: parse(rawData.pm_2p5 ?? rawData.pm2_5 ?? rawData.pm25),
    pm10: parse(rawData.pm_10 ?? rawData.pm10),
    batteryVoltage: parse(rawData.voltaje_bateria ?? rawData.voltaje ?? rawData.battery)
  };
};

export const fetchStations = async (): Promise<Station[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/estaciones`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const apiData = await response.json();
    const stationsRaw = Array.isArray(apiData) ? apiData : [];

    // Combinar datos de la API con nuestra lista maestra de coordenadas
    return MOCK_STATIONS.map(masterStation => {
      const apiInfo = stationsRaw.find((s: any) => (s.station_id || s.id)?.toString() === masterStation.id);
      return {
        ...masterStation,
        name: apiInfo?.nombre_estacion || masterStation.name,
        // Mantener las coordenadas maestras si la API falla o devuelve nulos
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
    const response = await fetch(`${API_BASE_URL}/clima/actual?station_id=${stationId}`);
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

    // API v2.1 usa /clima/historico/{station_id}
    const response = await fetch(`${API_BASE_URL}/clima/historico/${stationId}?inicio=${inicio}&fin=${fin}`);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    // La API v2.1 ya retorna datos ordenados descendentemente, mapear directamente
    const mappedData = data
      .map(mapApiToWeatherData)
      .filter(d => d.timestamp !== null);

    const endTime = performance.now();
    console.log(`⚡ Fetched ${mappedData.length} records in ${(endTime - startTime).toFixed(2)}ms for station ${stationId}`);

    return mappedData;
  } catch (error) {
    console.error("fetchClimaRango error:", error);
    return [];
  }
};

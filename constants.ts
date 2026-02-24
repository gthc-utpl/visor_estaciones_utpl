
import { Station, StationType, WeatherData, WeatherVariable } from './types';

const generateHistory = (baseTemp: number, type: StationType, variables: WeatherVariable[]): WeatherData[] => {
  return Array.from({ length: 24 }, (_, i) => {
    const hourOffset = 23 - i;
    const date = new Date(Date.now() - hourOffset * 3600000);
    const hour = date.getHours();
    const isDay = hour > 6 && hour < 18;

    const data: any = {
      timestamp: date.toISOString(),
    };

    if (variables.includes('temperature')) data.temperature = parseFloat((baseTemp + (isDay ? Math.random() * 5 : -Math.random() * 3)).toFixed(1));
    if (variables.includes('humidity')) data.humidity = Math.floor(50 + Math.random() * 30);
    if (variables.includes('pressure')) data.pressure = 1013 + Math.floor(Math.random() * 5);
    if (variables.includes('windSpeed')) data.windSpeed = parseFloat((Math.random() * 15).toFixed(1));
    if (variables.includes('rainfall')) data.rainfall = Math.random() > 0.9 ? parseFloat((Math.random() * 2).toFixed(1)) : 0;
    if (variables.includes('uvIndex')) data.uvIndex = isDay ? Math.floor(Math.random() * 10) : 0;

    return data as WeatherData;
  });
};

const commonVars: WeatherVariable[] = ['temperature', 'humidity', 'pressure', 'windSpeed', 'rainfall', 'uvIndex'];

const createStation = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  type: StationType,
  baseTemp: number,
  status: 'online' | 'offline' | 'warning' = 'online'
): Station => {
  const supportedVariables = [...commonVars, 'pm25', 'pm10', 'batteryVoltage', 'solarRadiation'];
  const history = generateHistory(baseTemp, type, supportedVariables as WeatherVariable[]);
  return {
    id,
    name,
    type,
    location: { lat, lng, city: 'Loja, Ecuador' },
    status,
    lastUpdate: new Date().toISOString(),
    currentData: history[history.length - 1],
    history,
    supportedVariables: supportedVariables as WeatherVariable[]
  };
};

/**
 * LISTA MAESTRA OFICIAL - RED UTPL LOJA
 * Estas coordenadas son la fuente de verdad para el mapa.
 */
export const MOCK_STATIONS: Station[] = [
  createStation("20969", "UTPL Malacatos", -4.199120, -79.25067, 'rural', 22),
  createStation("32943", "UTPL San Pedro", -3.993280, -79.50097, 'rural', 19),
  createStation("67822", "UTPL Militar", -3.967029, -79.20393, 'urban', 18),
  createStation("67823", "UTPL Villonaco", -3.987570, -79.26955, 'alpine', 12),
  createStation("67825", "UTPL Técnico", -3.988890, -79.24998, 'urban', 18),
  createStation("67826", "UTPL Jipiro", -3.972540, -79.18971, 'urban', 17),
  createStation("68022", "UTPL Sede Central", -3.987710, -79.19676, 'urban', 18),
  createStation("116731", "UTPL Época", -4.015190, -79.21282, 'urban', 18),
  createStation("147022", "UTPL Cajanuma", -4.089150, -79.20732, 'alpine', 10),
  createStation("184261", "UTPL El Tiro", -3.986980, -79.14813, 'alpine', 11),
  createStation("225999", "UTPL Jipiro Alto", -3.967470, -79.19097, 'urban', 16)
];

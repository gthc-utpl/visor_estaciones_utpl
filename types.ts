
export type StationType = 'urban' | 'coastal' | 'alpine' | 'rural';

export interface WeatherData {
  timestamp: string;
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  rainfall?: number | null;
  uvIndex?: number | null;
  solarRadiation?: number | null;
  pm25?: number | null;
  pm10?: number | null;
  soilMoisture?: number | null;
  leafWetness?: number | null;
  batteryVoltage?: number | null;
}

export interface Station {
  id: string;
  name: string;
  type: StationType;
  location: {
    lat: number;
    lng: number;
    city: string;
  };
  status: 'online' | 'offline' | 'warning';
  lastUpdate: string;
  currentData: WeatherData;
  history: WeatherData[];
  supportedVariables: WeatherVariable[];
}

export interface AIInsight {
  summary: string;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  trends: string;
}

export type WeatherVariable = keyof Omit<WeatherData, 'timestamp'>;

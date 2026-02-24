import { WeatherData } from '../types';

// --- 1. Radiación Extraterrestre (Ra) - FAO-56 Penman-Monteith ---

export const calcExtraterrestrialRadiation = (latDeg: number, dayOfYear: number): number => {
    const dr = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * dayOfYear);
    const delta = 0.409 * Math.sin((2 * Math.PI / 365) * dayOfYear - 1.39);
    const phi = (Math.PI / 180) * latDeg;
    const ws = Math.acos(-Math.tan(phi) * Math.tan(delta));
    const Gsc = 0.0820; // MJ/m2/min
    const Ra = (24 * 60 / Math.PI) * Gsc * dr * (
        ws * Math.sin(phi) * Math.sin(delta) +
        Math.cos(phi) * Math.cos(delta) * Math.sin(ws)
    );
    return Math.max(0, Ra);
};

// --- 2. ET0 Hargreaves ---

export const calcET0Hargreaves = (tMean: number, tMax: number, tMin: number, Ra: number): number => {
    const diff = tMax - tMin;
    if (diff <= 0 || Ra <= 0) return 0;
    return 0.0023 * (tMean + 17.8) * Math.sqrt(diff) * Ra;
};

// --- 3. Punto de Rocío (Magnus simplificado) ---

export const calcDewPoint = (T: number, RH: number): number => {
    return T - ((100 - RH) / 5);
};

// --- 4. Índice de Calor (NOAA regression) ---

export const calcHeatIndex = (T: number, RH: number): number | null => {
    if (T <= 27 || RH <= 40) return null;

    const c1 = -8.78469475556;
    const c2 = 1.61139411;
    const c3 = 2.33854883889;
    const c4 = -0.14611605;
    const c5 = -0.012308094;
    const c6 = -0.0164248277778;
    const c7 = 0.002211732;
    const c8 = 0.00072546;
    const c9 = -0.000003582;

    const HI = c1 + c2 * T + c3 * RH + c4 * T * RH +
        c5 * T * T + c6 * RH * RH + c7 * T * T * RH +
        c8 * T * RH * RH + c9 * T * T * RH * RH;

    return HI;
};

// --- 5. Validación de datos (outliers) ---

export interface QualityFlags {
    hasOutliers: boolean;
    flags: string[];
}

export const validateDailyData = (records: WeatherData[]): QualityFlags => {
    const flags: string[] = [];

    for (const r of records) {
        if (r.temperature !== null && r.temperature !== undefined) {
            if (r.temperature > 50) { flags.push('T>50°C'); break; }
            if (r.temperature < -20) { flags.push('T<-20°C'); break; }
        }
        if (r.humidity !== null && r.humidity !== undefined) {
            if (r.humidity > 100) { flags.push('HR>100%'); break; }
            if (r.humidity < 0) { flags.push('HR<0%'); break; }
        }
        if (r.pressure !== null && r.pressure !== undefined) {
            if (r.pressure < 500) { flags.push('P<500hPa'); break; }
        }
        if (r.windSpeed !== null && r.windSpeed !== undefined) {
            if (r.windSpeed < 0) { flags.push('Viento<0'); break; }
        }
    }

    return { hasOutliers: flags.length > 0, flags };
};

// --- 6. Day of Year helper ---

export const getDayOfYear = (dateStr: string): number => {
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// --- 7. Dirección de viento dominante ---

export const getDominantWindDirection = (records: WeatherData[]): string | null => {
    const bins: Record<string, number> = {
        'N': 0, 'NE': 0, 'E': 0, 'SE': 0,
        'S': 0, 'SW': 0, 'W': 0, 'NW': 0
    };

    let total = 0;
    for (const r of records) {
        const dir = r.windDirection;
        if (typeof dir !== 'number') continue;
        total++;
        const deg = (dir % 360 + 360) % 360;
        if (deg >= 337.5 || deg < 22.5) bins['N']++;
        else if (deg < 67.5) bins['NE']++;
        else if (deg < 112.5) bins['E']++;
        else if (deg < 157.5) bins['SE']++;
        else if (deg < 202.5) bins['S']++;
        else if (deg < 247.5) bins['SW']++;
        else if (deg < 292.5) bins['W']++;
        else bins['NW']++;
    }

    if (total === 0) return null;

    let maxDir = 'N';
    let maxCount = 0;
    for (const [dir, count] of Object.entries(bins)) {
        if (count > maxCount) { maxCount = count; maxDir = dir; }
    }
    return maxDir;
};

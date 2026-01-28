import { useState, useCallback } from 'react';
import { WeatherData } from '../types';

interface CacheEntry {
    data: WeatherData[];
    timestamp: number;
}

interface CacheKey {
    stationId: string;
    startDate: string;
    endDate: string;
}

// Caché en memoria para datos históricos (5 minutos de validez)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const cache = new Map<string, CacheEntry>();

const generateCacheKey = (key: CacheKey): string => {
    return `${key.stationId}-${key.startDate}-${key.endDate}`;
};

export const useWeatherCache = () => {
    const [cacheSize, setCacheSize] = useState(0);

    const get = useCallback((key: CacheKey): WeatherData[] | null => {
        const cacheKey = generateCacheKey(key);
        const entry = cache.get(cacheKey);

        if (!entry) return null;

        // Verificar si los datos están expirados
        if (Date.now() - entry.timestamp > CACHE_TTL) {
            cache.delete(cacheKey);
            setCacheSize(cache.size);
            return null;
        }

        return entry.data;
    }, []);

    const set = useCallback((key: CacheKey, data: WeatherData[]) => {
        const cacheKey = generateCacheKey(key);
        cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        setCacheSize(cache.size);
    }, []);

    const clear = useCallback(() => {
        cache.clear();
        setCacheSize(0);
    }, []);

    const remove = useCallback((key: CacheKey) => {
        const cacheKey = generateCacheKey(key);
        cache.delete(cacheKey);
        setCacheSize(cache.size);
    }, []);

    return {
        get,
        set,
        clear,
        remove,
        cacheSize
    };
};

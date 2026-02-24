import { useState, useCallback, useEffect } from 'react';
import { WeatherData } from '../types';
import { fetchClimaRango } from '../services/api';
import { useWeatherCache } from './useWeatherCache';
import { useDebounce } from './useDebounce';

interface UseWeatherHistoryOptions {
    stationId: string | null;
    startDate: string;
    endDate: string;
    enabled?: boolean; // Solo cargar cuando sea necesario
    debounceDelay?: number; // Delay para fechas (default: 800ms)
}

interface UseWeatherHistoryReturn {
    data: WeatherData[];
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    clearCache: () => void;
}

/**
 * Hook optimizado para cargar datos históricos del clima.
 * 
 * Características:
 * - Caché en memoria con TTL de 5 minutos
 * - Debounce para cambios de fechas
 * - Previene consultas duplicadas
 * - Solo carga cuando está habilitado (enabled)
 * 
 * @param options - Opciones de configuración
 * @returns Estado y funciones para manejar datos históricos
 */
export const useWeatherHistory = ({
    stationId,
    startDate,
    endDate,
    enabled = true,
    debounceDelay = 800
}: UseWeatherHistoryOptions): UseWeatherHistoryReturn => {
    const [data, setData] = useState<WeatherData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const cache = useWeatherCache();

    // Aplicar debounce a las fechas para evitar múltiples requests
    const debouncedStartDate = useDebounce(startDate, debounceDelay);
    const debouncedEndDate = useDebounce(endDate, debounceDelay);

    const fetchData = useCallback(async () => {
        if (!stationId || !enabled) return;

        // Verificar si hay datos en caché
        const cacheKey = {
            stationId,
            startDate: debouncedStartDate,
            endDate: debouncedEndDate
        };

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log(`📦 Cache hit for ${stationId} (${debouncedStartDate} to ${debouncedEndDate})`);
            setData(cachedData);
            setError(null);
            return;
        }

        // Si no hay caché, hacer fetch
        setLoading(true);
        setError(null);

        try {
            console.log(`🌐 Fetching history for ${stationId} (${debouncedStartDate} to ${debouncedEndDate})`);
            const result = await fetchClimaRango(stationId, debouncedStartDate, debouncedEndDate);
            const historyData = result.data;

            console.log(`✅ History data received:`, {
                stationId,
                resolution: result.resolution,
                dataPoints: historyData.length,
                firstPoint: historyData[0],
                lastPoint: historyData[historyData.length - 1],
                sample: historyData.slice(0, 3)
            });

            // Guardar en caché
            cache.set(cacheKey, historyData);
            setData(historyData);
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Error al cargar históricos');
            setError(error);
            console.error('❌ useWeatherHistory error:', error);
        } finally {
            setLoading(false);
        }
    }, [stationId, debouncedStartDate, debouncedEndDate, enabled, cache]);

    // Ejecutar fetch cuando cambien las dependencias
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Función para forzar una recarga (ignora caché)
    const refetch = useCallback(async () => {
        if (!stationId) return;

        // Limpiar caché para esta consulta específica
        cache.remove({
            stationId,
            startDate: debouncedStartDate,
            endDate: debouncedEndDate
        });

        await fetchData();
    }, [stationId, debouncedStartDate, debouncedEndDate, cache, fetchData]);

    const clearCache = useCallback(() => {
        cache.clear();
    }, [cache]);

    return {
        data,
        loading,
        error,
        refetch,
        clearCache
    };
};

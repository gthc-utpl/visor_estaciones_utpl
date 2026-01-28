import { useEffect, useState } from 'react';

/**
 * Hook para hacer debounce de un valor.
 * Útil para evitar múltiples llamadas a la API mientras el usuario cambia fechas.
 * 
 * @param value - Valor a hacer debounce
 * @param delay - Delay en milisegundos (default: 500ms)
 * @returns Valor con debounce aplicado
 */
export const useDebounce = <T,>(value: T, delay: number = 500): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Establecer timeout para actualizar el valor después del delay
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Limpiar timeout si el valor cambia antes de que termine el delay
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

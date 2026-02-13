import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Station, WeatherData, WeatherVariable } from '../types';

// Helper para traducir variables
const translateVar = (key: string): string => {
    const map: Record<string, string> = {
        temperature: 'Temperatura (°C)',
        humidity: 'Humedad (%)',
        pressure: 'Presión (hPa)',
        windSpeed: 'Viento Vel (km/h)',
        windDirection: 'Viento Dir (°)',
        rainfall: 'Lluvia (mm)',
        solarRadiation: 'Rad. Solar (W/m²)',
        uvIndex: 'Índice UV',
        pm25: 'PM 2.5',
        pm10: 'PM 10',
        batteryVoltage: 'Batería (V)'
    };
    return map[key] || key;
};

// Helper para calcular estadísticas
const calculateStats = (data: WeatherData[], variable: WeatherVariable) => {
    const values = data.map(d => d[variable]).filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return { min: '--', max: '--', avg: '--' };

    const min = Math.min(...values).toFixed(1);
    const max = Math.max(...values).toFixed(1);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);

    return { min, max, avg };
};

export const generateStationReport = (
    station: Station,
    history: WeatherData[],
    dateRange: { start: string, end: string }
) => {
    const doc = new jsPDF();
    const themeColor = [59, 130, 246]; // Blue-500

    // --- Header ---
    doc.setFillColor(themeColor[0], themeColor[1], themeColor[2]);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ClimaConnect Pro', 14, 20);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte de Estación Meteorológica', 14, 30);

    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, 200, 35, { align: 'right' });

    // --- Información de la Estación ---
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${station.name}`, 14, 55);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${station.id}`, 14, 62);
    doc.text(`Latitud: ${station.location.lat}`, 60, 62);
    doc.text(`Longitud: ${station.location.lng}`, 110, 62);
    doc.text(`Ciudad: ${station.location.city}`, 160, 62);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 68, 196, 68);

    // --- Resumen del Período ---
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen del Período', 14, 78);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Desde: ${dateRange.start}`, 14, 85);
    doc.text(`Hasta: ${dateRange.end}`, 80, 85);
    doc.text(`Total Registros: ${history.length}`, 140, 85);

    // --- Tabla de Estadísticas Resumen ---
    const variables = [
        'temperature', 'humidity', 'windSpeed', 'rainfall',
        'pressure', 'solarRadiation', 'pm25'
    ] as WeatherVariable[];

    const statsData = variables
        .map(v => {
            // Verificar si hay datos para esta variable
            const hasData = history.some(d => d[v] !== null && d[v] !== undefined);
            if (!hasData) return null;

            const stats = calculateStats(history, v);
            return [translateVar(v), stats.min, stats.max, stats.avg];
        })
        .filter(Boolean); // Filtrar nulos

    autoTable(doc, {
        startY: 95,
        head: [['Variable', 'Mínimo', 'Máximo', 'Promedio']],
        body: statsData as any[][],
        theme: 'grid',
        headStyles: { fillColor: themeColor as [number, number, number], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [240, 249, 255] }
    });

    // --- Tabla de Datos Recientes (Logs) ---
    // Tomamos los últimos 50 registros para no explotar el PDF
    const recentHistory = [...history].reverse().slice(0, 50);

    const logColumns = ['Fecha/Hora', 'Temp.', 'Hum.', 'Lluvia', 'Viento'];
    const logData = recentHistory.map(d => [
        new Date(d.timestamp).toLocaleString('es-EC'),
        d.temperature?.toFixed(1) || '--',
        d.humidity?.toFixed(0) || '--',
        d.rainfall?.toFixed(1) || '--',
        d.windSpeed?.toFixed(1) || '--'
    ]);

    const finalY = (doc as any).lastAutoTable.finalY || 150;

    doc.text('Registros Recientes (Últimos 50)', 14, finalY + 15);

    autoTable(doc, {
        startY: finalY + 20,
        head: [logColumns],
        body: logData,
        theme: 'striped',
        headStyles: { fillColor: [100, 116, 139] },
        styles: { fontSize: 8 },
    });

    // --- Footer ---
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} - Generado por ClimaConnect Pro`, 105, 290, { align: 'center' });
    }

    // Descargar
    const safeName = station.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`reporte_${safeName}_${dateRange.start}.pdf`);
};

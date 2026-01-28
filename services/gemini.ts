
import { GoogleGenAI, Type } from "@google/genai";
import { Station, AIInsight, WeatherData } from "../types";

// Always use the direct process.env.API_KEY for initialization as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeStationData = async (station: Station): Promise<AIInsight> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analiza los siguientes datos de la estación climatológica "${station.name}" ubicada en ${station.location.city}:
      
      Datos Actuales:
      - Temperatura: ${station.currentData.temperature}°C
      - Humedad: ${station.currentData.humidity}%
      - Velocidad Viento: ${station.currentData.windSpeed} km/h
      - Precipitación: ${station.currentData.rainfall} mm
      - Índice UV: ${station.currentData.uvIndex}
      - Presión: ${station.currentData.pressure} hPa

      Por favor, proporciona un análisis en formato JSON estructurado.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "Resumen ejecutivo de las condiciones actuales."
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Lista de recomendaciones basadas en el clima (agricultura, seguridad, salud)."
            },
            riskLevel: {
              type: Type.STRING,
              description: "Nivel de riesgo (low, medium, high)."
            },
            trends: {
              type: Type.STRING,
              description: "Descripción breve de las tendencias observadas."
            }
          },
          required: ["summary", "recommendations", "riskLevel", "trends"]
        }
      }
    });

    // Extracting text output directly from the .text property
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      summary: "No se pudo realizar el análisis de IA en este momento.",
      recommendations: ["Verificar conexión de red", "Monitorear sensores manualmente"],
      riskLevel: "medium",
      trends: "Información no disponible."
    };
  }
};

export const analyzeHistoricalData = async (stationName: string, data: WeatherData[]): Promise<AIInsight> => {
  try {
    const temps = data.map(d => d.temperature).filter((t): t is number => typeof t === 'number');
    const rain = data.reduce((acc, d) => acc + (d.rainfall || 0), 0);
    const avgTemp = temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : "0";
    const maxTemp = temps.length > 0 ? Math.max(...temps) : 0;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analiza el comportamiento histórico de la estación "${stationName}" para el periodo seleccionado:
      
      Resumen del Periodo:
      - Muestras analizadas: ${data.length} horas
      - Temperatura Promedio: ${avgTemp}°C
      - Temperatura Máxima: ${maxTemp}°C
      - Precipitación Total: ${rain.toFixed(2)} mm
      
      Proporciona un análisis de tendencias históricas y riesgos potenciales en formato JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            riskLevel: { type: Type.STRING },
            trends: { type: Type.STRING }
          },
          required: ["summary", "recommendations", "riskLevel", "trends"]
        }
      }
    });

    // Extracting text output directly from the .text property
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Historical Analysis Error:", error);
    return {
      summary: "Error al procesar el histórico.",
      recommendations: ["Intentar con un rango menor de datos"],
      riskLevel: "low",
      trends: "Error de procesamiento."
    };
  }
};

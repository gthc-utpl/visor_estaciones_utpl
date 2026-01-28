<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ClimaConnect Pro - Visor de Estaciones Meteorológicas UTPL

Aplicación web moderna para visualización de datos meteorológicos en tiempo real e históricos de la Red de Estaciones UTPL - Loja, Ecuador.

## 🚀 Características

- **Visualización en Tiempo Real:** Datos actualizados de 12 estaciones meteorológicas
- **Análisis Histórico:** Consulta de series temporales con rangos de fechas personalizables
- **Mapa Interactivo:** Visualización geoespacial de la red de estaciones con Leaflet
- **Dashboard Dinámico:** Gráficos interactivos con Recharts
- **IA Gemini:** Análisis inteligente de datos meteorológicos
- **Diseño Premium:** Interfaz moderna con glassmorphism y animaciones fluidas

## 🔌 Integración con API v2.1

La aplicación se conecta a la **UTPL Weather Station API v2.1** basada en TimescaleDB.

### Configuración de la API

**URL Base:** `http://localhost:8002`

### Endpoints Utilizados

| Endpoint | Propósito | Implementación |
|----------|-----------|----------------|
| `/estaciones` | Lista de estaciones con coordenadas | `fetchStations()` |
| `/clima/actual?station_id={id}` | Datos en tiempo real por estación | `fetchActualClima()` |
| `/clima/historico/{id}?inicio={fecha}&fin={fecha}` | Series temporales históricas | `fetchClimaRango()` |

### Mapeo de Variables API v2.1

La aplicación mapea automáticamente las variables normalizadas de la API:

```typescript
temp_aire → temperature
hum_relativa → humidity
presion_bar → pressure
viento_vel → windSpeed
viento_dir → windDirection
lluvia_mm → rainfall
rad_solar → solarRadiation
indice_uv → uvIndex
pm_2p5 → pm25
pm_10 → pm10
```

## 📋 Requisitos Previos

- **Node.js** 18+ 
- **API Backend** corriendo en `http://localhost:8002`
- **Navegador moderno** (Chrome, Firefox, Edge, Safari)

## ⚙️ Instalación

```bash
# Clonar el repositorio (si aplica)
# git clone ...

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

La aplicación estará disponible en: **http://localhost:5173**

## 🏗️ Stack Tecnológico

- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Estilos:** TailwindCSS + CSS personalizado
- **Gráficos:** Recharts 3.6
- **Mapas:** Leaflet 1.9.4
- **Iconos:** Lucide React
- **IA:** Google Gemini AI

## 📁 Estructura del Proyecto

```
VISOR/
├── components/          # Componentes React reutilizables
│   ├── StatCard.tsx
│   ├── WeatherChart.tsx
│   └── StationMap.tsx
├── services/           # Integración con APIs
│   ├── api.ts         # Cliente API v2.1 TimescaleDB
│   └── gemini.ts      # Servicio de IA
├── types.ts           # Tipos TypeScript
├── constants.ts       # Datos maestros de estaciones
├── App.tsx            # Componente principal
├── index.tsx          # Entry point
├── index.html         # HTML template
├── index.css          # Estilos globales
└── vite.config.ts     # Configuración Vite
```

## 🌐 Estaciones Disponibles

La aplicación visualiza datos de **12 estaciones meteorológicas**:

1. **UTPL Malacatos** (20969) - 1500 msnm
2. **UTPL San Pedro** (32943) - 2200 msnm
3. **UTPL Militar** (67822) - 2150 msnm
4. **UTPL Villonaco** (67823) - 2720 msnm
5. **San Lucas** (67824) - 2500 msnm
6. **UTPL Técnico** (67825) - 2100 msnm
7. **UTPL Jipiro** (67826) - 2060 msnm
8. **UTPL Sede Central** (68022) - 2100 msnm
9. **UTPL Época** (116731) - 2120 msnm
10. **UTPL Cajanuma** (147022) - 2850 msnm
11. **UTPL El Tiro** (184261) - 2810 msnm
12. **UTPL Jipiro Alto** (225999) - 2250 msnm

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env.local`:

```env
GEMINI_API_KEY=tu_api_key_aqui
```

### Configuración de Puerto

Por defecto la aplicación corre en el puerto **5173**. Para cambiarlo, editar `vite.config.ts`:

```typescript
server: {
  port: 5173,  // Cambiar aquí
  host: '0.0.0.0',
}
```

## 🐛 Troubleshooting

### Error: "No se puede conectar a la API"

**Solución:** Verificar que la API v2.1 esté corriendo en `http://localhost:8002`:

```bash
curl http://localhost:8002/
# Debe retornar: {"status":"online","version":"2.1.0",...}
```

### Error: "No se muestran datos en los gráficos"

**Causa:** La API puede no tener datos históricos para el rango de fechas seleccionado.

**Solución:** Ajustar el rango de fechas o verificar que la base de datos tenga datos:

```bash
curl "http://localhost:8002/clima/historico/20969?inicio=2024-01-01&fin=2024-12-31"
```

### Puerto 5173 ocupado

**Solución:** Matar el proceso o cambiar el puerto en `vite.config.ts`.

## 📊 Desarrollado por

**Grupo de Investigación GTHC - UTPL**  
Universidad Técnica Particular de Loja  
Loja, Ecuador

---

**Versión:** 2.1.0  
**Última actualización:** Enero 2026

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

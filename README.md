# AeroSense AI

A Flask-based environmental intelligence dashboard using Open-Meteo's geocoding and air-quality APIs.

## Features
- Search for a city/region and automatically refresh the dashboard, map pin, and coordinates.
- Leaflet map with tile fallback and responsive resize handling.
- Provider-reported US AQI plus PM2.5, PM10, NO2, SO2, ozone (O3), and carbon monoxide (CO), when available.
- Historical pollutant timeline, current pollutant profile, and selectable 24-hour baseline forecast for AQI or individual pollutants.
- Transparent damped least-squares trend blended with the same-hour previous-day value where available.
- Chronological one-step walk-forward MAE/RMSE and a repeat-last-value baseline for comparison.
- Missing values remain unavailable; the app does not create synthetic observations or substitute zeros.

## Run on Windows
1. Install Python 3.10 or newer.
2. Open this folder in VS Code.
3. In the terminal, run:

   ```powershell
   python -m pip install -r requirements.txt
   python app.py
   ```

4. Open `http://127.0.0.1:5000`.

Internet access is required for Open-Meteo API calls and the Leaflet/Chart.js CDN assets. If a library CDN is blocked, the map/chart may not render until access is restored.

## Methodology and limitations
- Source: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) and [Geocoding API](https://open-meteo.com/en/docs/geocoding-api).
- Air-quality fields are modelled estimates from the provider and may not equal readings from a physical sensor at the selected coordinates.
- The forecast is a transparent educational baseline, not a production-grade atmospheric model or official warning. It uses recent least-squares trend with slope damping and a same-hour previous-day reference when available.
- MAE/RMSE are chronological one-step walk-forward errors on historical data. They are not a confidence score and do not guarantee future accuracy.
- Gas concentrations should not be interpreted as a toxicity ranking because pollutants have different units, standards, and health thresholds.
- Health text is general information, not medical advice. Follow official local public-health alerts.

# AeroSense AI — Project Report / Midterm Write-up

## 1. Abstract
AeroSense AI is a web-based air-quality intelligence prototype that lets users select a geographical region, retrieve current and historical air-quality information from an open API, visualize pollution trends, and estimate short-term AQI movement with a baseline regression model. The interface combines pollutant readings, an interactive map, trend charts, an educational forecast, and general exposure-reduction guidance. Data source and model limitations are disclosed to avoid presenting estimates as official measurements.

## 2. Problem Statement
Air-quality readings vary by location and time. People need a simple way to inspect available pollutant measurements, compare recent trends, and understand whether conditions may improve or worsen. Data is often distributed across separate services and can be difficult to interpret.

## 3. Objectives
- Allow a user to search and select a region.
- Fetch available current and historical air-quality data from an open source.
- Display AQI and PM2.5, PM10, NO2, SO2 and O3 where available.
- Allow trend analysis across the returned time window.
- Demonstrate short-term prediction using a basic ML regression baseline.
- Offer general, non-medical exposure-reduction suggestions.
- Provide links to public environmental information sources.
- Clearly label the source, missing values and model limitations.

## 4. Proposed System
Frontend: responsive dashboard, region search, map, pollutant cards, charts and recommendations.
Backend: Flask API routes for geocoding and air-quality retrieval.
Data: Open-Meteo Air Quality API.
Prediction: scikit-learn Linear Regression trained on the most recent available AQI time series. If scikit-learn cannot be imported, a least-squares fallback is used.
Visualization: Leaflet with OpenStreetMap tiles and Chart.js.

## 5. Novelty
**Pollution-Aware Action Intelligence** combines three views in one workflow: (1) which available pollutant measurements are elevated, (2) how AQI has changed recently and how a transparent baseline model extrapolates the trend, and (3) practical recommendations tied to the current AQI band. A future extension can compare nearby regions and show confidence intervals after model validation.

## 6. Methodology
1. User searches for a city or region.
2. Geocoding returns candidate names and coordinates.
3. User selects a result.
4. Backend requests current and hourly pollutant values.
5. Frontend displays available measurements and AQI category.
6. The backend fits a linear-regression baseline to recent hourly AQI values and estimates the next 24 hours.
7. The dashboard plots history and estimates, and presents general recommendations.
8. The UI identifies the data provider and discloses that predictions are educational estimates.

## 7. Machine Learning
Input: time-step index from recent hourly AQI observations.
Target: AQI value.
Model: linear regression.
Output: estimated values for the next 24 hourly steps.
Evaluation plan for a future version: use time-based train/test splits, MAE and RMSE; compare with a persistence baseline and avoid random shuffling of time series. This initial implementation is a demonstrator and is not a validated air-quality forecasting model.

## 8. Expected Outcome
A working browser dashboard that retrieves live provider data when available, visualizes the selected region, displays pollutant measurements, and demonstrates a basic forecast. Results depend on API availability and regional coverage.

## 9. Limitations
- Open API coverage and update frequency differ by region.
- A straight-line model cannot represent complex weather, emissions, or seasonal effects.
- The prototype does not establish regulatory violations; official reports must be checked at their source.
- Recommendations are general information and not medical advice.
- Internet access is required.

## 10. Future Scope
- Incorporate weather features, traffic and station metadata.
- Compare Linear Regression with Random Forest or gradient boosting.
- Evaluate forecasts using chronological holdout data and MAE/RMSE.
- Add downloadable reports, alert thresholds, region comparisons and user-defined notifications.
- Add a verified public environmental-report lookup with source links.

## 11. References
- Open-Meteo Air Quality API: https://open-meteo.com/en/docs/air-quality-api
- Open-Meteo Geocoding API: https://open-meteo.com/en/docs/geocoding-api
- Leaflet: https://leafletjs.com/
- Chart.js: https://www.chartjs.org/
- scikit-learn Linear Regression: https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html
- OpenStreetMap: https://www.openstreetmap.org/copyright

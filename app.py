from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
import math
import requests
import os

app = Flask(__name__)
TIMEOUT = 15
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
POLLUTANTS = {
    "pm2_5": {"label": "PM₂.₅", "unit": "µg/m³"},
    "pm10": {"label": "PM₁₀", "unit": "µg/m³"},
    "nitrogen_dioxide": {"label": "NO₂", "unit": "µg/m³"},
    "sulphur_dioxide": {"label": "SO₂", "unit": "µg/m³"},
    "ozone": {"label": "O₃", "unit": "µg/m³"},
    "carbon_monoxide": {"label": "CO", "unit": "µg/m³"},
}


def finite(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def aqi_category(value):
    if value is None:
        return {"label": "Unavailable", "color": "neutral", "advice": "No provider AQI value is available for this timestamp."}
    if value <= 50:
        return {"label": "Good", "color": "green", "advice": "Air quality is generally satisfactory. Continue checking local conditions."}
    if value <= 100:
        return {"label": "Moderate", "color": "yellow", "advice": "Unusually sensitive people may wish to reduce prolonged, strenuous outdoor activity."}
    if value <= 150:
        return {"label": "Unhealthy for sensitive groups", "color": "orange", "advice": "Children, older adults, and people with heart or lung conditions should consider reducing strenuous outdoor activity."}
    if value <= 200:
        return {"label": "Unhealthy", "color": "red", "advice": "Consider reducing prolonged outdoor exertion and follow local health guidance."}
    if value <= 300:
        return {"label": "Very unhealthy", "color": "purple", "advice": "Reduce outdoor exposure and follow local public-health advisories."}
    return {"label": "Hazardous", "color": "maroon", "advice": "Avoid outdoor exertion where possible and follow official public-health advisories."}


def fit_damped_trend(values, steps=24):
    """Transparent least-squares trend with damped slope; returns no prediction for sparse data."""
    clean = [finite(v) for v in values]
    clean = [v for v in clean if v is not None]
    if len(clean) < 24:
        return []
    sample = clean[-72:]
    n = len(sample)
    xbar = (n - 1) / 2
    ybar = sum(sample) / n
    denominator = sum((i - xbar) ** 2 for i in range(n))
    slope = sum((i - xbar) * (v - ybar) for i, v in enumerate(sample)) / denominator if denominator else 0.0
    slope = max(-max(1.0, abs(ybar) * 0.25), min(max(1.0, abs(ybar) * 0.25), slope))
    result = []
    for step in range(1, steps + 1):
        seasonal = sample[-24 + ((step - 1) % 24)] if len(sample) >= 24 else None
        trend = sample[-1] + slope * sum(0.8 ** j for j in range(step))
        predicted = 0.6 * seasonal + 0.4 * trend if seasonal is not None else trend
        result.append(round(max(0.0, predicted), 3))
    return result


def validation(values):
    """Chronological walk-forward validation against a repeat-last-value baseline."""
    clean = [finite(v) for v in values]
    clean = [v for v in clean if v is not None]
    if len(clean) < 48:
        return {"mae": None, "rmse": None, "baseline_mae": None, "samples": 0,
                "note": "At least 48 valid observations are needed for a meaningful walk-forward check."}
    start = max(24, int(len(clean) * 0.8))
    errors, baseline_errors = [], []
    for i in range(start, len(clean)):
        train = clean[max(0, i - 72):i]
        if len(train) < 24:
            continue
        forecast = fit_damped_trend(train, 1)
        if not forecast:
            continue
        errors.append(forecast[0] - clean[i])
        baseline_errors.append(train[-1] - clean[i])
    if not errors:
        return {"mae": None, "rmse": None, "baseline_mae": None, "samples": 0,
                "note": "There were not enough contiguous values to evaluate this model."}
    return {
        "mae": round(sum(abs(e) for e in errors) / len(errors), 3),
        "rmse": round(math.sqrt(sum(e * e for e in errors) / len(errors)), 3),
        "baseline_mae": round(sum(abs(e) for e in baseline_errors) / len(baseline_errors), 3),
        "samples": len(errors),
        "note": "Chronological one-step walk-forward validation; baseline repeats the latest observed value."
    }


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "AeroSense AI", "forecast_method": "damped linear trend + same-hour daily reference"})


@app.get("/api/search")
def search_city():
    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"error": "Enter at least two characters to search."}), 400
    # Support queries such as "Bengaluru, Karnataka, India": Open-Meteo's
    # geocoder's name parameter should receive the place name, not the whole address.
    parts = [part.strip() for part in query.split(",") if part.strip()]
    place_query = parts[0] if parts else query
    hints = [part.casefold() for part in parts[1:]]
    try:
        response = requests.get(
            GEOCODE_URL,
            params={"name": place_query, "count": 100, "language": "en", "format": "json"},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        results = response.json().get("results") or []

        def text(item):
            return " ".join(str(item.get(k) or "") for k in
                            ("name", "admin1", "admin2", "admin3", "country", "country_code")).casefold()

        # If the user supplied state/country hints, prefer candidates matching them.
        # Keep results if no candidate matches, so a spelling variation doesn't hide everything.
        if hints:
            matched = [item for item in results if all(hint in text(item) for hint in hints)]
            if matched:
                results = matched

        q = place_query.casefold()
        def rank(item):
            name = str(item.get("name", "")).casefold().strip()
            hint_score = sum(1 for hint in hints if hint in text(item))
            return (-hint_score, 0 if name == q else 1 if name.startswith(q) else 2,
                    -int(item.get("population") or 0), name)
        results.sort(key=rank)
        return jsonify([{
            "name": item.get("name", "Unknown location"),
            "admin1": item.get("admin1", ""),
            "admin2": item.get("admin2", ""),
            "country": item.get("country", ""),
            "country_code": item.get("country_code", ""),
            "population": item.get("population"),
            "latitude": item["latitude"],
            "longitude": item["longitude"]
        } for item in results])
    except (requests.RequestException, ValueError, KeyError):
        return jsonify({"error": "Location search service failed. Check your internet connection and retry."}), 502


@app.get("/api/air")
def air_data():
    lat, lon = finite(request.args.get("lat")), finite(request.args.get("lon"))
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Valid latitude and longitude are required."}), 400
    try:
        params = {
            "latitude": lat, "longitude": lon,
            "hourly": "us_aqi," + ",".join(POLLUTANTS.keys()),
            "current": "us_aqi," + ",".join(POLLUTANTS.keys()),
            "past_days": 7, "forecast_days": 2, "timezone": "auto"
        }
        response = requests.get(AIR_URL, params=params, timeout=TIMEOUT)
        response.raise_for_status()
        raw = response.json()
        hourly = raw.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            return jsonify({"error": "The provider returned no hourly observations for this location."}), 502

        current_raw = raw.get("current") or {}
        current_time = current_raw.get("time")
        history = []
        for i, time_value in enumerate(times):
            # Open-Meteo can return historical and forecast hours in the same hourly
            # array. Exclude future timestamps so they cannot leak into history or validation.
            if current_time and str(time_value) > str(current_time):
                continue
            record = {"time": time_value}
            for key in ["us_aqi", *POLLUTANTS.keys()]:
                values = hourly.get(key) or []
                record[key] = finite(values[i]) if i < len(values) else None
            # Keep records with at least one usable pollutant, rather than inventing missing values.
            if any(record.get(k) is not None for k in ["us_aqi", *POLLUTANTS.keys()]):
                history.append(record)

        current = {"time": current_raw.get("time"), "us_aqi": finite(current_raw.get("us_aqi"))}
        for key in POLLUTANTS:
            current[key] = finite(current_raw.get(key))
        if not current.get("time"):
            # The last hourly timestamp is a truthful fallback for the most recent provider observation.
            current = dict(history[-1]) if history else current

        forecasts = []
        pollutant_evaluation = {}
        forecast_values = {}
        for key in POLLUTANTS:
            values = [row.get(key) for row in history]
            forecast_values[key] = fit_damped_trend(values, 24)
            pollutant_evaluation[key] = validation(values)
        aqi_values = [row.get("us_aqi") for row in history]
        aqi_forecast = fit_damped_trend(aqi_values, 24)
        for i in range(24):
            record = {"step": i + 1, "time": f"+{i + 1}h", "us_aqi": aqi_forecast[i] if len(aqi_forecast) > i else None}
            for key in POLLUTANTS:
                values = forecast_values[key]
                record[key] = values[i] if len(values) > i else None
            forecasts.append(record)

        current["category"] = aqi_category(current.get("us_aqi"))
        history_recent = history[-168:]
        available = [key for key in POLLUTANTS if current.get(key) is not None]
        return jsonify({
            "location": {"latitude": lat, "longitude": lon},
            "timezone": raw.get("timezone", "provider local time"),
            "current": current,
            "history": history_recent,
            "prediction": forecasts,
            "model": {
                "name": "Damped trend + same-hour daily reference",
                "method": "For each pollutant, least-squares slope over up to 72 recent valid values is damped by 0.8 per forecast step and blended 40% with 60% same-hour previous-day value when available.",
                "evaluation": pollutant_evaluation,
                "aqi_evaluation": validation(aqi_values),
                "available_pollutants": available
            },
            "source": "Open-Meteo Air Quality API",
            "source_url": "https://open-meteo.com/en/docs/air-quality-api",
            "source_note": "Open-Meteo air-quality fields are modelled atmospheric estimates, not guaranteed measurements from a physical monitor at the selected coordinates.",
            "limitations": ["Short-term prototype estimates are not official forecasts.", "Missing provider values remain null and are not replaced with zero.", "Forecast error metrics are retrospective walk-forward tests, not a confidence score."],
            "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z"
        })
    except requests.RequestException:
        return jsonify({"error": "Air-quality service could not be reached. Check internet access and retry."}), 502
    except (ValueError, TypeError, KeyError) as exc:
        app.logger.exception("Unexpected provider response")
        return jsonify({"error": "The provider returned unexpected data. Please retry."}), 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(debug=False, host="127.0.0.1", port=port)

"""Isolation Forest for the model owner.

Trains only on the nominal cruise, then scores the three demo scenarios.
The forest flags combined drift. The clinical rules in src/lib/engine.js
still decide the countermeasures.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ["hr", "hrv", "sbp", "aredMin", "dose", "crp", "sleep", "mood", "focus", "fatigue"]
SEED = 20261115


def matrix(days: list[dict]) -> np.ndarray:
    return np.array([[day[name] for name in FEATURES] for day in days], dtype=float)


def augment(nominal: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Small copies of the healthy cruise so the forest learns normal variation."""
    scale = np.maximum(nominal.std(axis=0), 1e-6) * 0.08
    copies = [nominal]
    for _ in range(9):
        copies.append(nominal + rng.normal(0, 1, nominal.shape) * scale)
    return np.vstack(copies)


def to_percent(score: float, normal_level: float) -> int:
    # decision_function is high for normal points and negative for outliers.
    raw = (normal_level - score) / 0.22 * 100
    return int(np.clip(np.rint(raw), 0, 100))


# Floors keep a constant self-report (mood stays at 4 on the cruise) from
# looking like a huge change when it moves by one point.
STD_FLOOR = np.array([3, 4, 4, 6, 0.25, 0.5, 0.35, 0.8, 0.8, 0.8])


def drivers(today: np.ndarray, mean: np.ndarray, std: np.ndarray) -> list[dict]:
    z = np.abs((today - mean) / np.maximum(std, STD_FLOOR))
    order = np.argsort(z)[::-1][:3]
    return [
        {"feature": FEATURES[index], "z": round(float(z[index]), 2)}
        for index in order
        if z[index] >= 2
    ]


def main() -> None:
    telemetry = json.loads((ROOT / "data" / "telemetry_data.json").read_text())
    by_scenario = {item["scenario"]: item["days"] for item in telemetry}
    nominal_days = by_scenario["nominal"]
    nominal = matrix(nominal_days)

    rng = np.random.default_rng(SEED)
    train = augment(nominal, rng)
    scaler = StandardScaler()
    train_scaled = scaler.fit_transform(train)

    forest = IsolationForest(
        n_estimators=200,
        contamination=0.02,
        max_samples=64,
        random_state=SEED,
    )
    forest.fit(train_scaled)
    normal_level = float(np.median(forest.decision_function(train_scaled)))
    nominal_mean = nominal.mean(axis=0)
    nominal_std = nominal.std(axis=0)

    scenarios = {}
    for name, days in by_scenario.items():
        scaled = scaler.transform(matrix(days))
        decision = forest.decision_function(scaled)
        labels = forest.predict(scaled)
        percents = [to_percent(float(value), normal_level) for value in decision]
        scenarios[name] = {
            "anomaly": percents[-1],
            "flaggedSols": int(np.sum(labels == -1)),
            "sols": len(days),
            "drivers": drivers(matrix(days)[-1], nominal_mean, nominal_std),
            "series": percents,
        }
        print(
            f"{name:8} forest {percents[-1]:3d}  flagged {scenarios[name]['flaggedSols']:2d}/30"
            f"  drivers {', '.join(item['feature'] for item in scenarios[name]['drivers']) or '-'}"
        )

    report = {
        "algorithm": "IsolationForest",
        "library": "scikit-learn",
        "trainedOn": "nominal cruise only, 30 sols x 10 with 8% noise",
        "features": FEATURES,
        "contamination": 0.02,
        "estimators": 200,
        "scenarios": scenarios,
    }
    target = ROOT / "data" / "model_scores.json"
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

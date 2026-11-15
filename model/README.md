# Modèle — référence Python

`model/train.py` peut encore écrire `data/model_scores.json` pour une comparaison hors navigateur. Le cockpit ne lit plus ce fichier. L’écran entraîne `src/ml/isolationForest.ts` en direct sur la période de référence chargée (200 arbres, sous-échantillon 256, contamination 0,02).

## Lancer

```bash
python3 -m venv .venv
.venv/bin/pip install -r model/requirements.txt
.venv/bin/python model/train.py
```

## Fichiers

- `model/train.py` — entraînement Python optionnel
- `src/ml/isolationForest.ts` — forêt utilisée à l’écran
- `data/telemetry_data.json` — les 3 scénarios déjà générés

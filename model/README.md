# Modèle — personne 2

Forêt d’isolement (Isolation Forest, scikit-learn). Elle apprend seulement la croisière nominale, puis elle note les trois scénarios. Un score haut veut dire que le jour s’éloigne de la croisière saine.

Le score de préparation et les protocoles restent dans `src/lib/engine.js` (règles cliniques). La forêt répond à une autre question : est-ce que ce sol ressemble encore à la croisière ?

## Lancer

```bash
python3 -m venv .venv
.venv/bin/pip install -r model/requirements.txt
.venv/bin/python model/train.py
```

Ça réécrit `data/model_scores.json`. L’écran lit ce fichier et affiche `FOREST`.

## Ce qu’il faut pouvoir dire

- Entraînement : 30 sols nominaux, élargis par un bruit de 8 % pour apprendre la variation normale. Tempête et fatigue ne sont pas dans l’entraînement.
- Signaux : FC, VFC, tension, ARED, dose, CRP, sommeil, humeur, netteté, fatigue.
- `contamination=0.02`, 200 arbres.
- La tempête doit sortir sur la dose et le CRP. L’isolement doit sortir sur le sommeil, l’ARED et la VFC.

## Fichiers

- `model/train.py` — entraînement et scores
- `data/telemetry_data.json` — les 3 scénarios déjà générés
- `data/model_scores.json` — ce que le cockpit affiche

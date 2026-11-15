# ASTRO-PULSE

Offline astronaut health console for the 2026 NASA Space Apps Challenge.

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions  
**Event:** Universal Event (online) · 14–15 November 2026

On a Mars transit the round trip to a flight surgeon is about 20 minutes. ASTRO-PULSE stays on board. It reads a 30-sol crew record, scores mission readiness from 0 to 100, and writes a countermeasure plan the astronaut can start before Earth answers.

The app makes no network calls. Fonts, the scoring engine, and the crew record all run in the browser.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173).

Demo keys: `1` nominal cruise, `2` solar storm, `3` isolation / fatigue and bone loss. The three-question self-check updates the score immediately. Mark a countermeasure done to show on-board validation.

```bash
npm run check   # regenerates data/ and checks the three scenarios
npm run build   # static bundle in dist/
```

## What the console does

1. **Telemetry, four NASA axes.** Cardiovascular (resting heart rate, HRV, blood pressure), bone and muscle (ARED minutes, bone-density proxy), radiation and immunity (daily and cumulative dose, CRP proxy), behavior (sleep plus a 3-question self-check).
2. **Cross-factor score.** Each axis is scored against an operational set-point. Combined drifts (particle dose with inflammation, short sleep with low HRV, missed ARED with faster bone loss) subtract a capped penalty. A cross-factor anomaly index measures how far today sits from the cruise baseline.
3. **Action copilot.** The active rules pick up to three protocols: storm shelter, inflammation watch, electrolytes, 4-7-8 breathing, ARED, sleep lock, or a crew check-in. Validated actions stay in local storage.
4. **Live demo switch.** Nominal, solar storm, and isolation / fatigue rebuild the same 30-sol window so a presentation can show the response in one click.

## NASA evidence used as set-points

These are published anchors, not a clinical clearance:

| Signal | Set-point in this build | Source |
| --- | --- | --- |
| Cruise dose equivalent | 1.84 mSv/day | Zeitlin et al., Science 2013. MSL RAD inside the spacecraft on the way to Mars (1.84 ± 0.30 mSv/day). |
| Bone loss | 1.2% over 30 sols | Inside the 1–1.5% per month loss reported for weight-bearing bone in microgravity (NASA Human Research Program). |
| Resistive exercise | 60 min/day ARED target | NASA resistive exercise on the Advanced Resistive Exercise Device is the in-flight countermeasure for bone and muscle. |
| Sleep | 8 h allotment | NASA protects an 8-hour sleep window; inflight sleep is often shorter. The fatigue scenario lets that gap show up in HRV. |

The 30-sol table in `data/telemetry_data.csv` and `data/telemetry_data.json` is **synthetic**. It is calibrated to those set-points so the console still runs when the link is down. It is not a NASA OSDR export and it is not a medical record.

A longer flight record can replace the generator without changing the UI: `generateMission()` is the only data source the score reads. Thirty points are too few for a meaningful Isolation Forest, so this version uses weighted clinical rules plus a baseline anomaly index. That keeps every alert explainable on stage.

## Scoring

- Axis weights: cardiovascular 30%, bone and muscle 22%, radiation and immunity 28%, behavior 20%.
- Cross-factor penalties are capped at 16 points so one bad day cannot zero the score.
- 80–99 READY, 60–79 DEGRADED, below 60 AT RISK.

## Project layout

```
src/lib/telemetry.js   30-sol generator
src/lib/engine.js      score, alerts, protocols
src/App.jsx            cockpit
data/                  CSV and JSON written by npm run check
public/slides.html     six presentation slides
SUBMISSION.md          text for the Space Apps project tab
```

## Slides

With the dev server running, open http://localhost:5173/slides.html. Arrow keys change slides. Six slides: problem, solution, demo, NASA data, Earth impact, team.

## Team

Fill the names in `SUBMISSION.md` and on slide 6 before upload.

| Role | Deliverable |
| --- | --- |
| Data, scoring, NASA calibration | Generator, engine, scenarios |
| Frontend | Cockpit UI |
| GitHub and Space Apps submission | This README, `SUBMISSION.md`, public links |
| Demo video | 2-minute English screen recording |

## Disclaimer

ASTRO-PULSE is a hackathon decision-support prototype. It does not diagnose, treat, or clear anyone for a mission. Thresholds are operational set-points for the demo, chosen so a crew could see a drift during a communications delay.

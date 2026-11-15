# Space Apps project tab — paste-ready text

Replace the bracketed team lines before submitting. Keep the video under 2 minutes 30 seconds, unlisted on YouTube.

## Project name

ASTRO-PULSE

## Summary

ASTRO-PULSE is an offline health console for astronauts on a Mars transit, where a flight surgeon is about 20 minutes away. It turns cardiovascular, bone and muscle, radiation, and behavioral signals into a Mission Readiness score and a short countermeasure plan the crew can start without waiting for Earth. One click switches a nominal cruise, a solar particle event, and an isolation-fatigue decline. The same local-first pattern fits clinics that lose connectivity.

## Project details

Long-duration flight combines radiation, isolation, distance from Earth, altered gravity, and a closed cabin. None of those risks arrives as a single alarm. Heart-rate variability, sleep, resistive exercise, and dose drift together, and the dangerous part is the combination.

ASTRO-PULSE is a local web app. It loads a 30-sol crew record and scores four axes used by NASA’s human research framing:

- Cardiovascular: resting heart rate, heart-rate variability, blood pressure.
- Bone and muscle: minutes on the Advanced Resistive Exercise Device and a bone-density proxy.
- Radiation and immunity: daily dose, cumulative dose, and an inflammation proxy.
- Behavior: seven-sol sleep plus a three-question self-check (mood, sharpness, exhaustion).

Each axis is compared with an operational set-point. When two or more drifts agree, a cross-factor rule fires, lowers Mission Readiness, and selects up to three actions: storm shelter, inflammation watch, electrolyte fluid, 4-7-8 breathing, an ARED session, a locked sleep window, or a crew check-in. The astronaut marks an action done on board. Nothing is sent to the ground.

The demo has three states. Nominal cruise stays in the READY band. Solar storm injects a particle event (peak 28 mSv on one sol, then a lower sol once the crew is sheltered) and a rising inflammation proxy. Isolation drops sleep toward 4.5 h, ARED toward 15 min, and mood with it, which accelerates bone loss past the 1.2% monthly set-point.

We did not ship a black-box model. Thirty sols are too short for a trustworthy Isolation Forest, so the engine is a weighted rule set plus an anomaly index against the cruise baseline. Every alert on screen says which signals fired it. A longer record can replace the synthetic generator without changing the console.

## NASA data

Physiological set-points are anchored to published NASA evidence:

- Cruise radiation: 1.84 ± 0.30 mSv/day dose equivalent measured by MSL RAD inside the spacecraft during the trip to Mars (Zeitlin et al., Science, 2013, doi:10.1126/science.1235989).
- Bone: 1–1.5% per month in weight-bearing bone during microgravity, from the NASA Human Research Program. The nominal record uses 1.2% over 30 sols. Missed ARED raises the rate.
- Exercise countermeasure: daily resistive loading on ARED. The console treats 60 minutes as the daily target.
- Sleep: NASA’s 8-hour sleep allotment. The fatigue scenario is what happens when that window is lost and HRV falls with it.

The file in the repository (`data/telemetry_data.csv`) is a synthetic 30-sol record calibrated to those set-points. It is not an OSDR or GeneLab export. Labeling it as simulated is intentional: the crew console has to run when the spacecraft cannot download a new dataset. The generator is isolated in `src/lib/telemetry.js` so a real exported series can be swapped in later.

NASA Human Research Program risks covered in spirit: radiation, isolation and confinement, distance from Earth, altered gravity, and hostile closed environment (RIDGE).

## Resources

- https://www.science.org/doi/10.1126/science.1235989
- https://humanresearchroadmap.nasa.gov/
- https://www.nasa.gov/missions/station/iss-research/astronaut-exercise/

## Demo video beats (about 2 minutes)

1. Open on Nominal. Point at Mission Readiness and the 20-minute delay.
2. Press 2. The dose chart spikes, readiness drops, the shelter protocol appears.
3. Press 3. Sleep, ARED, and bone move together. Show the three actions.
4. Drag Exhaustion and Mood. The self-check changes the score without a ground call.
5. Mark one action done. Close on the Earth line: same offline pattern for a clinic with no stable link.

## Team

- Team name: [team name]
- Data, scoring, NASA calibration: [name]
- Frontend: [name]
- GitHub and submission: [name]
- Demo video: [name]

## Links to paste

- GitHub: [public repo URL]
- Demo video (YouTube, unlisted): [URL]
- Live or local run notes: `npm install && npm run dev`

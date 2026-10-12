# 01. Narrative

## The story, in one paragraph

RESQ helps forest teams in India decide where to look for fire tomorrow, tells them the moment a satellite or a person sees smoke, and — only once someone on the ground has confirmed a fire is real — shows a rough, labeled guess at how far it might spread. It is three separate tools wearing one interface: a ranking (not a prediction) of which forest cells deserve attention tomorrow; a queue (not an alarm) of things a satellite or a person noticed that still need a human to check; and, only after that check, a scenario (not a forecast) built from a fire-spread simulator that, when tested against four real Indian fires, did not beat a simple "fire stays near where it started" guess. RESQ's job is to make each of those three things usable without ever letting a user mistake one for another.

## The promise

We will tell you, honestly and at the moment you need it, how much to trust what you're looking at — and we will never make a number look more precise, more predictive, or more validated than it is.

## What RESQ refuses to claim

- It does not predict fires. It ranks forest cells by relative risk for tomorrow only — never a multi-day forecast.
- It does not confirm fires. A satellite detection or field report is a thing to check, not a thing that happened.
- It does not forecast fire spread. The spread scenario is one uncalibrated simulation run, shown beside a baseline it did not beat on three of the four Indian fires tested, and should be read as "what one simulator run looks like," not "what will happen."
- It does not say "AI-powered," "predicts," or state any number from the model that isn't backed by a figure that actually exists in this repo's data or results files.
- It does not imply the four replay incidents are a validated test set — they are development incidents, used to build the pipeline, not held out to judge it.

## Tone of voice

Plain, specific, calm. Say what a thing is, then say what it is not, in the same breath. Prefer "ranked," "unverified," "uncalibrated scenario," and "did not beat" over softer or vaguer language. Never apologize for the limits — state them once, clearly, and move on. No marketing superlatives, no urgency theatre, no invented precision ("92% accurate" has no source and will never appear).

## The exact words for each trust level

| Trust level | Where it appears | Exact wording |
|---|---|---|
| Forecast (tomorrow only) | Today screen, every risk cell | "Risk rank for tomorrow. Not a prediction of where fire will start." |
| Detection (unverified) | Watch screen, every detection card | "Detected by satellite. Not yet verified." / "Reported by [name/role]. Not yet verified." |
| Verified incident | Incident header, once a human confirms | "Verified by [name], [time]." |
| Spread scenario | Every scenario view, persistent badge | "Uncalibrated scenario — one simulation run, not a forecast." |
| Baseline comparison | Scenario and replay screens | "Shown beside a simple distance-based guess that used no simulator." |
| Replay evidence | Replay/evidence screen header | "Tested against 4 real fires used to build this tool (not held out, not independent)." |
| Fuel assumption | Assumptions panel | "Fuel type is assumed from land cover, not measured. India-specific fuel data is not yet available." |
| Wind source | Wind control | "Wind source changes this scenario more than anything else we tested. Switch it to see how much." |

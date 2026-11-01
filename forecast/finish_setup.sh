#!/bin/sh
# Final steps after PR #7 is merged. Run from the website folder:  sh forecast/finish_setup.sh
# 1 post today's run to production  2 drop the old date pin and redeploy  3 create the state release  4 start the daily workflow once
set -eu
R=Terra-Watch/dashboard; STATE=${STATE:-/tmp/state.tar.gz}; RUN=${RUN:-../wildfire-ml-v4/live_state/runs/2026-11-01}
export RISK_INGEST_TOKEN=$(cat ~/.terrawatch/risk_ingest_token)
echo "waiting for the production deployment of main..."
until npx --yes vercel@latest ls 2>/dev/null | head -8 | grep -q "Ready"; do sleep 20; done
python3 forecast/live/post_run.py "$RUN" https://terra-watch-server.vercel.app/api/risk/runs
npx --yes vercel@latest env rm RISK_FORECAST_DATE production --yes
(cd backend && npx --yes vercel@latest redeploy "$(npx --yes vercel@latest ls 2>/dev/null | awk '/Production/ && /Ready/ {print $3; exit}')" >/dev/null) || echo "redeploy by hand: Vercel > terra-watch-server > latest deployment > Redeploy"
gh release create forecast-state "$STATE" -R $R --title "forecast state" --notes "Model bundle, weather and fire stores and past runs for the daily forecast job (replaced by each run)." --prerelease
gh workflow run daily-forecast.yml -R $R
echo "done: watch the run with: gh run watch -R $R"

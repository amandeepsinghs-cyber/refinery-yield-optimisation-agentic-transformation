#!/usr/bin/env bash
# Launch the lever-coverage batch (scenario 'lever' in scenario.m): same crude walk / labs as 'random' plus designed
# ramped moves of preheat SP, regenerator T SP (air), PA2 duty, reflux, cooling-water flow and overhead T SP, so the
# regime surrogates (E2) and the recipe engine (E4) learn the levers full_v1 never moves.
#   ./run_lever_batch.sh <n_runs> <minutes> <out_dir> [seed_offset] [--after-full-v1]
# --after-full-v1 waits (polling every 5 min) until no Octave process is writing to data/full_v1, then launches.
# Outputs <out_dir>/lever_sNNN.csv and logs in <out_dir>/logs/. One single-threaded Octave process per run.
set -euo pipefail
n=${1:?n_runs}; minutes=${2:?minutes}; out=${3:?out_dir}; off=${4:-200}; wait_flag=${5:-}
cd "$(dirname "$0")"
mkdir -p "$out/logs"
if [[ "$wait_flag" == "--after-full-v1" ]]; then
  echo "$(date -u +%FT%TZ) waiting for full_v1 Octave processes to finish..."
  while pgrep -f "octave-cli.*data/full_v1" > /dev/null; do sleep 300; done
  echo "$(date -u +%FT%TZ) full_v1 finished — launching lever batch"
fi
for i in $(seq 0 $((n - 1))); do
  seed=$((off + i)); tag=$(printf 'lever_s%03d' "$seed")
  OMP_NUM_THREADS=1 setsid nohup octave-cli --no-gui --quiet \
    --eval "run_sim($minutes, 'lever', '$out/$tag.csv', $seed)" \
    > "$out/logs/$tag.log" 2>&1 &
done
echo "$(date -u +%FT%TZ) launched $n lever runs x $minutes min -> $out (seeds $off..$((off + n - 1)))"

#!/usr/bin/env bash
# Launch N randomised campaign runs in parallel (one Octave process per core).
#   ./run_random_batch.sh <n_runs> <minutes> <out_dir> [seed_offset]
# Outputs <out_dir>/random_sNNN.csv (seed NNN) and logs in <out_dir>/logs/.
# setsid: Octave installs its own SIGHUP handler, so nohup alone does not survive the shell exiting.
# Each run is reproducible from its seed; a crash loses at most the last 60 simulated minutes.
set -euo pipefail
n=${1:?n_runs}; minutes=${2:?minutes}; out=${3:?out_dir}; off=${4:-100}
cd "$(dirname "$0")"
mkdir -p "$out/logs"
for i in $(seq 0 $((n - 1))); do
  seed=$((off + i)); tag=$(printf 'random_s%03d' "$seed")
  OMP_NUM_THREADS=1 setsid nohup octave-cli --no-gui --quiet \
    --eval "run_sim($minutes, 'random', '$out/$tag.csv', $seed)" \
    > "$out/logs/$tag.log" 2>&1 &
done
echo "launched $n runs x $minutes min -> $out (seeds $off..$((off + n - 1)))"

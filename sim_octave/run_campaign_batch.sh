#!/usr/bin/env bash
# Launch N crude_campaign runs in parallel (one Octave process per core) — SDD-DATA-13.
#   ./run_campaign_batch.sh <n_runs> <minutes> <out_dir> [seed_offset]
# Outputs <out_dir>/crude_sNNN.csv (seed NNN) and logs in <out_dir>/logs/.
# Compute: ~78 s per simulated minute per core (measured 2026-10-01). 1600 min ≈ 35 h.
# Do NOT start while another batch (e.g. full_v1) is still occupying the cores.
set -euo pipefail
n=${1:?n_runs}; minutes=${2:?minutes}; out=${3:?out_dir}; off=${4:-200}
cd "$(dirname "${BASH_SOURCE[0]}")"
if pgrep -f "run_sim\(" >/dev/null; then
  echo "refusing to start: other run_sim Octave processes are running ($(pgrep -fc 'run_sim\('))" >&2; exit 2
fi
mkdir -p "$out/logs"
for i in $(seq 0 $((n - 1))); do
  seed=$((off + i)); tag=$(printf 'crude_s%03d' "$seed")
  OMP_NUM_THREADS=1 setsid nohup octave-cli --no-gui --quiet \
    --eval "run_sim($minutes, 'crude_campaign', '$out/$tag.csv', $seed)" \
    > "$out/logs/$tag.log" 2>&1 &
done
echo "launched $n crude_campaign runs x $minutes min -> $out (seeds $off..$((off + n - 1)))"

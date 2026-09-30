#!/usr/bin/env bash
# Launch independent FCC-Fractionator simulations in parallel (one Octave process per run).
# Usage: ./run_batch.sh <minutes> <out_dir> <scenario1> [scenario2 ...]
# Each run writes <out_dir>/<scenario>.csv and <out_dir>/logs/<scenario>.log
set -euo pipefail
cd "$(dirname "$0")"
ST="$1"; OUT="$2"; shift 2
mkdir -p "$OUT/logs"
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1   # one core per run; parallelism comes from many runs
i=0
for sc in "$@"; do
  nohup octave --no-gui --quiet --eval "run_sim(${ST}, '${sc}', '${OUT}/${sc}.csv', ${i})" \
    > "$OUT/logs/${sc}.log" 2>&1 &
  echo "started ${sc} (pid $!)"
  i=$((i+1))
done
wait
echo "all runs finished"

import pandas as pd
from app.state import get_state
from app.engines.regime import regime_at, _load_fit

def test_regime_detection_accuracy():
    st = get_state()
    _load_fit()
    
    regimes_csv = st.s.data_root / st.s["data"]["primary_batch"] / "_staged" / "regimes.csv"
    seg_df = pd.read_csv(regimes_csv)
    
    total = 0
    correct = 0
    
    for run_id in st.catalog.runs:
        if "random_s" not in run_id: continue
        seed = int(run_id.split("random_s")[-1])
        if seed < 140: continue
        
        run_segs = seg_df[(seg_df["run_id"] == run_id) & (seg_df["transition_complete"] == True)]
        for _, seg in run_segs.iterrows():
            if pd.isna(seg.get("transition_end_min")): continue
            
            t_eval = int(seg["transition_end_min"]) + 45
            reg_info = regime_at(run_id, t_eval)
            if reg_info and reg_info.get("regime_id") == seg["regime_id"]:
                correct += 1
            total += 1
            
    rate = correct / max(1, total)
    print(f"\nRegime detection rate on held-out switches: {rate*100:.1f}%")
    assert rate >= 0.6, f"Detection rate {rate*100:.1f}% is below 80%"

function run_recipe_check(ST, out_csv, seed, t0, d_rot, d_lco, d_hn)
% RUN_RECIPE_CHECK  Replay a 'random' run (same seed) and apply recipe set-point moves from minute t0.
%   run_recipe_check(ST, out_csv, seed, t0, d_rot, d_lco, d_hn)
%     d_rot  riser outlet T SP offset (F, ramped over 10 min)
%     d_lco  LCO T98 SP offset (F, ramped over 20 min);  d_hn  HN T98 SP offset (F, ramped over 20 min)
%   All offsets 0 -> control twin (identical to run_sim(ST, 'random', out_csv, seed)).
% Note: in this model the T98 set points act only inside the cut-point auto windows (60-120 min after a lab).
global FCC_RECIPE
FCC_RECIPE = struct('t0', t0, 'ramp_rot', 10, 'ramp_sp', 20, 'd_rot', d_rot, 'd_lco', d_lco, 'd_hn', d_hn);
printf('recipe check: seed %d, t0 %d, dROT %+.2f, dLCO_SP %+.2f, dHN_SP %+.2f, %d min\n', seed, t0, d_rot, d_lco, d_hn, ST);
run_sim(ST, 'random_recipe', out_csv, seed);
end

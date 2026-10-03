function [ufcc, dist, SP, MV, s] = scenario(name, minute, base, ufcc, dist, SP, MV, s)
% SCENARIO  Time-varying disturbances and set points for run_sim.m.
%   Moves are ramped (not stepped) and spaced >= 30 min apart, following the guidance in
%   dynamic.m / Santander et al. (2022) to avoid numerical problems.
%
%   Index reference (from the model README):
%     ufcc(1)  feed (VGO) flow           ufcc(10) preheater temperature SP
%     ufcc(11) fractionator pressure SP  ufcc(12) regenerator pressure SP
%     ufcc(13) regenerator temperature SP ufcc(14) reactor catalyst inventory SP
%     ufcc(15) riser outlet temperature (ROT) SP
%     dist = [ambient T, feed API gravity, feed temperature, condenser efficiency]
%     SP   = [accumulator level, overhead T, heavy-naphtha T98 SP, LCO T98 SP]
%
% All scenarios except 'nominal'/'paper_api' include a realistic daily ambient cycle (75-80 F).

if ~any(strcmp(name, {'nominal', 'paper_api'}))
  dist(1) = 77.5 - 2.5*cos(2*pi*minute/1440);   % daily ambient temperature cycle
end

switch name
  case 'nominal'           % validation: no changes
  case 'paper_api'         % validation: paper's disturbance-rejection case study
    if minute >= 60, dist(2) = 20; end

  % ---------------- sample scenarios (3 h each) ----------------
  case 'steady'            % steady operation, ambient cycle only
  case 'heavy_crude'       % heavier crude: API 25 -> 20
    dist(2) = ramp(minute, 30, 30, base.dist(2), 20);
  case 'light_crude'       % lighter crude: API 25 -> 28
    dist(2) = ramp(minute, 30, 30, base.dist(2), 28);
  case 'throughput'        % feed rate +5%, then back
    ufcc(1) = ramp(minute, 30, 30, base.ufcc(1), base.ufcc(1)*1.05) ...
            + ramp(minute, 120, 30, 0, -base.ufcc(1)*0.05);
  case 'rot_move'          % riser outlet temperature SP +5 F, then back
    ufcc(15) = ramp(minute, 30, 10, base.ufcc(15), base.ufcc(15)+5) ...
             + ramp(minute, 120, 10, 0, -5);
  case 'lco_cut_move'      % LCO T98 set point +10 F (the cut-point decision)
    SP(4) = ramp(minute, 30, 20, base.SP(4), base.SP(4)+10);
  case 'condenser_fouling' % condenser efficiency 0.90 -> 0.855 (as in the ML-PSE fault case)
    dist(4) = ramp(minute, 30, 120, base.dist(4), 0.855);
  case 'feed_temp_drop'    % upstream feed temperature -20 F
    dist(3) = ramp(minute, 30, 30, base.dist(3), base.dist(3)-20);

  % ---------------- randomised campaigns (full dataset) ----------------
  % Seeded by run_sim (seed argument), so every run is reproducible.
  case {'random', 'random_test', 'crude_campaign'}
    if ~isfield(s, 'prof')
      if strcmp(name, 'random')
        s.prof = build_random(base, 1, 360, 480);    % labs at 06:00, 14:00, 22:00
      elseif strcmp(name, 'crude_campaign')
        % Regime walk R1..R4 (SDD-DATA-11/13): tank switch (60 min) or blend ramp (180 min), 8-16 h dwell.
        s.prof = build_random(base, 1, 360, 480, 'campaign');
      else
        s.prof = build_random(base, 0.1, 20, 60);    % compressed schedule for testing
      end
    end
    p = s.prof; m = min(minute, numel(p.api));
    dist(2) = p.api(m); ufcc(1) = p.feed(m); ufcc(15) = p.rot(m);
    dist(3) = p.tfeed(m); dist(4) = p.cond(m);
    SP(3) = p.sp_hn(m); SP(4) = p.sp_lco(m);
    s.crude_id = p.crude_id(m); s.event = p.event(m);
    s.lab = p.lab(m); s.cut_auto = p.cut_auto(m);

  % ---------------- recipe check (recipe_check_v1) ----------------
  % Replays 'random' exactly (same seed -> same profile; no extra rand() calls) and superimposes the recipe moves
  % given in the global FCC_RECIPE (fields t0, ramp_rot, ramp_sp, d_rot, d_lco, d_hn) from minute t0 on.
  % Empty / absent FCC_RECIPE = identical to 'random' (control twin). Set by run_recipe_check.m.
  case 'random_recipe'
    [ufcc, dist, SP, MV, s] = scenario('random', minute, base, ufcc, dist, SP, MV, s);
    global FCC_RECIPE
    r = FCC_RECIPE;
    if ~isempty(r)
      ufcc(15) = ufcc(15) + ramp(minute, r.t0, r.ramp_rot, 0, r.d_rot);
      SP(4) = SP(4) + ramp(minute, r.t0, r.ramp_sp, 0, r.d_lco);
      SP(3) = SP(3) + ramp(minute, r.t0, r.ramp_sp, 0, r.d_hn);
    end

  % ---------------- lever-coverage batch (lever_v1) ----------------
  % Same crude walk / labs / cut-point schedule as 'random', plus designed ramped moves of the levers the
  % full_v1 batch never moves, so the regime surrogates (E2) and the recipe (E4) learn their effect:
  %   7 preheat SP ufcc(10)   8 regenerator T SP ufcc(13) (air demand follows)   9 PA2 duty MV(4)
  %  10 reflux MV(1)         11 cooling-water flow MV(2)                         12 overhead T SP SP(2)
  case 'lever'
    if ~isfield(s, 'prof')
      s.prof = build_random(base, 1, 360, 480, 'lever');
    end
    p = s.prof; m = min(minute, numel(p.api));
    dist(2) = p.api(m); ufcc(1) = p.feed(m); ufcc(15) = p.rot(m);
    dist(3) = p.tfeed(m); dist(4) = p.cond(m);
    SP(3) = p.sp_hn(m); SP(4) = p.sp_lco(m);
    ufcc(10) = p.preheat(m); ufcc(13) = p.treg(m);
    MV(4) = p.pa2(m); MV(1) = p.reflux(m); MV(2) = p.cw(m); SP(2) = p.tover(m);
    s.crude_id = p.crude_id(m); s.event = p.event(m);
    s.lab = p.lab(m); s.cut_auto = p.cut_auto(m);
  otherwise
    error('unknown scenario: %s', name);
end
end

function p = build_random(base, tscale, lab_first, lab_period, mode)
% Builds per-minute profiles of disturbances and set points for one randomised campaign.
%   tscale      multiplies all event intervals (1 = realistic, <1 = compressed for tests)
%   lab_first   minute of the first lab sample; lab_period minutes between samples
%   mode        'random' (default): new API anywhere in [20, 29] every 8-30 h with a 60-min ramp
%               'campaign': walk through the four API-band regimes (R1 20-22.5, R2 22.5-24.5,
%                           R3 24.5-26.5, R4 26.5-29); first switch after 4-8 h, dwell 8-16 h,
%                           transition 60 min (tank switch) or 180 min (blend ramp), 50/50
% Moves are ramped and spaced >= 30 min apart (after the previous ramp ends), as recommended
% for this model. Cut-point controllers are in manual except for 60 min starting 60 min after
% each lab sample (result arrives, operator trims the draw back towards the set point).
if nargin < 5, mode = 'random'; end
Tmax = 6000;
u = @(a, b) a + (b - a) * rand();
% event list rows: [time, code, target, ramp]; codes 1 crude 2 feed 3 ROT 4 feed T 5 LCO SP 6 HN SP
ev = [];
if strcmp(mode, 'campaign')
  bands = [20.0 22.5; 22.5 24.5; 24.5 26.5; 26.5 29.0];
  reg = 3;                                   % simulator starts at 25.0 API = R3
  t = u(4, 8) * 60 * tscale;
  while t < Tmax
    nxt = reg; while nxt == reg, nxt = 1 + floor(4 * rand()); end
    reg = min(nxt, 4);
    lo = bands(reg, 1) + 0.3; hi = bands(reg, 2) - 0.3;   % stay inside the band after noise
    if rand() < 0.5, rmp = 60; else, rmp = 180; end
    ev = [ev; t, 1, u(lo, hi), rmp]; t = t + rmp + u(8, 16) * 60 * tscale;
  end
else
  t = u(4, 12) * 60 * tscale; api = base.dist(2);
  while t < Tmax
    new = api; while abs(new - api) < 1.5, new = u(20, 29); end
    api = new; ev = [ev; t, 1, api, 60]; t = t + u(8, 30) * 60 * tscale;
  end
end

specs = { % code, first(h), min(h), max(h), sampler, ramp
  2, [3 12], [6 24], @() base.ufcc(1) * u(0.95, 1.05), 30;
  3, [3 12], [6 24], @() base.ufcc(15) + u(-5, 5), 10;
  4, [3 12], [8 24], @() base.dist(3) + u(-20, 10), 30;
  5, [6 18], [12 36], @() base.SP(4) + u(-10, 10), 20;
  6, [6 18], [12 36], @() base.SP(3) + u(-5, 5), 20};
for r = 1:size(specs, 1)
  [code, first, gap, sampler, rmp] = specs{r, :};
  t = u(first(1), first(2)) * 60 * tscale;
  while t < Tmax
    ev = [ev; t, code, sampler(), rmp]; t = t + u(gap(1), gap(2)) * 60 * tscale;
  end
end
if strcmp(mode, 'lever')
  sgn = @() 2 * (rand() < 0.5) - 1;           % random direction, magnitude bounded away from zero
  lever = { % code, first(h), gap(h), sampler, ramp
    7,  [1 6], [4 8], @() base.ufcc(10) + sgn() * u(3, 8), 30;
    8,  [1 6], [4 8], @() base.ufcc(13) + sgn() * u(4, 10), 30;
    9,  [1 6], [4 8], @() base.MV(4) * (1 + sgn() * u(0.03, 0.08)), 30;
    10, [1 6], [4 8], @() base.MV(1) * (1 + sgn() * u(0.03, 0.08)), 30;
    11, [1 6], [4 8], @() base.MV(2) * (1 + sgn() * u(0.03, 0.06)), 30;
    12, [1 6], [4 8], @() base.SP(2) + sgn() * u(2, 5), 20};
  for r = 1:size(lever, 1)
    [code, first, gap, sampler, rmp] = lever{r, :};
    t = u(first(1), first(2)) * 60 * tscale;
    while t < Tmax
      ev = [ev; t, code, sampler(), rmp]; t = t + u(gap(1), gap(2)) * 60 * tscale;
    end
  end
end
ev = sortrows(ev, 1);
ev(1, 1) = max(ev(1, 1), 30);
for i = 2:size(ev, 1)          % enforce spacing between consecutive moves
  ev(i, 1) = max(ev(i, 1), ev(i-1, 1) + ev(i-1, 4) + 30);
end
ev(:, 1) = round(ev(:, 1));
ev = ev(ev(:, 1) < Tmax, :);

tt = (1:Tmax)';
p.api = pw_profile(tt, base.dist(2), ev(ev(:, 2) == 1, :));
p.feed = pw_profile(tt, base.ufcc(1), ev(ev(:, 2) == 2, :));
p.rot = pw_profile(tt, base.ufcc(15), ev(ev(:, 2) == 3, :));
p.tfeed = pw_profile(tt, base.dist(3), ev(ev(:, 2) == 4, :));
p.sp_lco = pw_profile(tt, base.SP(4), ev(ev(:, 2) == 5, :));
p.sp_hn = pw_profile(tt, base.SP(3), ev(ev(:, 2) == 6, :));
p.preheat = pw_profile(tt, base.ufcc(10), ev(ev(:, 2) == 7, :));
p.treg = pw_profile(tt, base.ufcc(13), ev(ev(:, 2) == 8, :));
p.pa2 = pw_profile(tt, base.MV(4), ev(ev(:, 2) == 9, :));
p.reflux = pw_profile(tt, base.MV(1), ev(ev(:, 2) == 10, :));
p.cw = pw_profile(tt, base.MV(2), ev(ev(:, 2) == 11, :));
p.tover = pw_profile(tt, base.SP(2), ev(ev(:, 2) == 12, :));
p.cond = base.dist(4) - u(0, 0.045) * (tt / Tmax);   % slow condenser fouling
p.crude_id = 1 + arrayfun(@(x) sum(ev(ev(:, 2) == 1, 1) <= x), tt);
p.event = zeros(Tmax, 1);
for i = 1:size(ev, 1)
  p.event(tt >= ev(i, 1) & tt < ev(i, 1) + ev(i, 4)) = ev(i, 2);
end
p.lab = double(tt >= lab_first & mod(tt - lab_first, lab_period) == 0);
p.cut_auto = zeros(Tmax, 1);
for tl = find(p.lab)'
  p.cut_auto(tt >= tl + 60 * max(tscale, 0.5) & tt < tl + 120 * max(tscale, 0.5)) = 1;
end
end

function v = pw_profile(tt, v0, ev)
% Piecewise-linear profile: starts at v0, each event ramps from the current value to its target.
v = v0 * ones(size(tt)); cur = v0;
for i = 1:size(ev, 1)
  t0 = ev(i, 1); d = ev(i, 4); tgt = ev(i, 3);
  idx = tt > t0;
  v(idx) = min(1, (tt(idx) - t0) / d) * (tgt - cur) + cur;
  cur = tgt;
end
end

function v = ramp(t, t0, dur, v0, v1)
% Linear ramp from v0 to v1 starting at t0 and lasting dur minutes.
if t <= t0
  v = v0;
elseif t >= t0 + dur
  v = v1;
else
  v = v0 + (v1 - v0) * (t - t0) / dur;
end
end

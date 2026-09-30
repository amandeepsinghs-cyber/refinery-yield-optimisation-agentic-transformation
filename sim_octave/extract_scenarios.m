addpath('model');
fid = fopen('../knowledge/inputs/events_data.json', 'w');
fprintf(fid, '{\n');

NAMES = {'Crude change', 'Feed rate change', 'ROT set-point change', ...
         'Feed temperature change', 'LCO T98 set-point change', 'HN T98 set-point change'};

for seed = 100:109
  rand('seed', seed); randn('seed', seed);
  base = struct('ufcc', [165,zeros(1,14)], 'dist', [75,25,460.9,0.9], ...
                'SP', [70;245.93;530.33;755.33], 'MV', zeros(6,1));
  s = struct();
  [~, ~, ~, ~, s] = scenario('random', 1, base, zeros(1,15), base.dist, base.SP, base.MV, s);
  p = s.prof;
  
  ev_list = {};
  c_prev = 0;
  i = 1;
  while i <= numel(p.event)
    c = p.event(i);
    if c > 0 && c ~= c_prev
      j = i;
      while j + 1 <= numel(p.event) && p.event(j+1) == c
        j = j + 1;
      end
      ev_struct = struct('time_min', i, 'code', c, 'ramp', j - i + 1, 'crude_id', p.crude_id(j));
      if c == 1
        ev_struct.from_val = p.api(max(i-1, 1));
        ev_struct.to_val = p.api(j);
      elseif c == 2
        ev_struct.from_val = p.feed(max(i-1, 1));
        ev_struct.to_val = p.feed(j);
      elseif c == 3
        ev_struct.from_val = p.rot(max(i-1, 1));
        ev_struct.to_val = p.rot(j);
      elseif c == 4
        ev_struct.from_val = p.tfeed(max(i-1, 1));
        ev_struct.to_val = p.tfeed(j);
      elseif c == 5
        ev_struct.from_val = p.sp_lco(max(i-1, 1));
        ev_struct.to_val = p.sp_lco(j);
      elseif c == 6
        ev_struct.from_val = p.sp_hn(max(i-1, 1));
        ev_struct.to_val = p.sp_hn(j);
      end
      ev_list{end+1} = ev_struct;
      i = j;
    end
    c_prev = c;
    i = i + 1;
  end
  
  labs = find(p.lab == 1);
  first_crude = 360;
  for k = 1:numel(ev_list)
    if ev_list{k}.code == 1
      first_crude = ev_list{k}.time_min;
      break;
    end
  end
  tod = mod(first_crude, 1440);
  if tod >= 360 && tod < 840
    sh = 360; sh_name = 'Day'; sh_idx = 0;
  elseif tod >= 840 && tod < 1320
    sh = 840; sh_name = 'Evening'; sh_idx = 1;
  else
    sh = 1320; sh_name = 'Night'; sh_idx = 2;
  end
  w0 = first_crude - mod(tod - sh, 1440);
  w1 = w0 + 480;
  
  fprintf(fid, '  "random_s%d": {\n', seed);
  fprintf(fid, '    "seed": %d,\n', seed);
  fprintf(fid, '    "first_crude": %d,\n', first_crude);
  fprintf(fid, '    "shift_name": "%s",\n', sh_name);
  fprintf(fid, '    "shift_index": %d,\n', sh_idx);
  fprintf(fid, '    "w0": %d,\n', w0);
  fprintf(fid, '    "w1": %d,\n', w1);
  fprintf(fid, '    "events": [\n');
  for k = 1:numel(ev_list)
    e = ev_list{k};
    fprintf(fid, '      {"time_min": %d, "code": %d, "name": "%s", "from_val": %.2f, "to_val": %.2f, "ramp": %d, "crude_id": %d, "in_shift": %s}%s\n', ...
            e.time_min, e.code, NAMES{e.code}, e.from_val, e.to_val, e.ramp, e.crude_id, ...
            ifelse(e.time_min >= w0 && e.time_min < w1, 'true', 'false'), ...
            ifelse(k == numel(ev_list), '', ','));
  end
  fprintf(fid, '    ],\n');
  fprintf(fid, '    "labs": [\n');
  for k = 1:numel(labs)
    lt = labs(k);
    fprintf(fid, '      {"time_min": %d, "in_shift": %s}%s\n', ...
            lt, ifelse(lt >= w0 && lt < w1, 'true', 'false'), ...
            ifelse(k == numel(labs), '', ','));
  end
  fprintf(fid, '    ]\n');
  fprintf(fid, '  }%s\n', ifelse(seed == 109, '', ','));
end
fprintf(fid, '}\n');
fclose(fid);
disp('Exported ../knowledge/inputs/events_data.json successfully.');

function r = ifelse(c, a, b)
  if c, r = a; else, r = b; end
end

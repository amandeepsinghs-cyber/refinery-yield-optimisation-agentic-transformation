function a = cutpoint_auto()
% CUTPOINT_AUTO  True if the HN/LCO cut-point controllers are in automatic.
%   Set by run_sim.m via the global FCC_CUTPOINT_AUTO. Defaults to true (original model
%   behaviour: controllers act on the true cut point every step).
global FCC_CUTPOINT_AUTO
if isempty(FCC_CUTPOINT_AUTO)
  a = true;
else
  a = FCC_CUTPOINT_AUTO ~= 0;
end
end

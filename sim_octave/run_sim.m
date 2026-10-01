function run_sim(ST, scenario_name, out_csv, seed)
% RUN_SIM  Octave driver for the Santander et al. (2022) FCC-Fractionator model.
%
%   run_sim(ST, scenario_name, out_csv, seed)
%     ST            simulation length in minutes
%     scenario_name name of a scenario defined in scenario.m ('nominal', 'campaign', ...)
%     out_csv       output CSV path (one row per simulated minute)
%     seed          random seed for scenario noise (optional, default 0)
%
% Derived from dynamic.m of https://github.com/Baldea-Group/FCC-Fractionator (MIT licence).
% Initial conditions and the integration scheme are copied verbatim from dynamic.m.
% Changes vs. dynamic.m (no physics changes):
%   - ode15s is called with anonymous functions (Octave syntax) instead of string names + extra args
%   - MATLAB table() console displays and Plotall are removed
%   - set points / disturbances come from scenario.m instead of hard-coded case studies
%   - results are written to CSV (checkpointed every 60 min)

if nargin < 4, seed = 0; end
rand('seed', seed); randn('seed', seed);
here = fileparts(mfilename('fullpath'));
addpath(fullfile(here, 'model'));

global yp FCC_CUTPOINT_AUTO
%%%%%%%%%%%%%%%%%%%%%%%%%% FCC initial data (verbatim from dynamic.m) %%%%%%%%%%%%%%%%%%%%%%%%%%
xfcc=[1564.06758445685,616,24.0440758965397,24.9000000145994,40.0420669348231,28.0000000041903,3.16075658859897,35.0875282505755,0.0101439627122109,0.00250580481493606,1249.99997383664,9350.79072581430,271210.435908199,246.810877809621,98098.9991960623,968.999859177516,2.68045714195376,30.4463683645626,14.6380093682365,-24.2765676899209,-0.612986761842691,0.611929610398922,-5641.47052429781,-30153150.1669079,-1879.52204006479,0.00468987379029097,0.0481251434795964,0.527273962836787,0.357213788281919,2.47339657486076,1.41455228053760,2.70179775410060,2.44381704476869,0.631637205219422,0.627951527686494,457.718461235902,6.31203102548586];
ufcc=[165,0,1,0,0,0,0.431260000000000,0,0,616,24.9000000000000,28,1250,98100,969];
dist=[75,25,460.900000000000,0.900000000000000];
Flpg=457.718467816417;
Tcondenser=310.707095521277;
%%%%%%%%%%%%%%%%%%%%%%%%%% Fractionator initial data (verbatim from dynamic.m) %%%%%%%%%%%%%%%%%
MV=[0.747045932872508;298.895742822403;32;216.5;35.0441537396814;1243.39471672084];
ufra=[1647.78648413911;3547.63742893480;3382.54085689940;3077.23029277231;3039.30039378578;3038.30153796675;3031.04170871230;2992.96394430377;2929.38471956076;3035.21348344919;3023.22094129519;3055.92931441955;3054.01364490236;3044.12036102462;3036.53284553629;3032.88546649540;3031.43608755138;3030.73615977709;3031.85542990300;3317.69553572937;310.707095521277;392.000195034657;423.489189888333;449.071037007143;455.829436826681;457.278865297285;458.591772080347;463.785597803382;472.370698542057;509.816789386916;517.590163820810;519.337427827793;520.027072886078;521.878006501369;523.251988845496;523.948479342715;524.270766239095;524.490435402004;594.289627412580;628.139421202578];
xfra=[69.9992488400148;10.6316859735314;5.54317455602710;4.91100895722520;4.89436078215364;3.09047029825112;2.45584074341618;1.39618700941233;3.74406892836788;3.54419293748662;3.50526289424775;3.47333455975866;0.581208632217122;0.454748252715454;0.393957106911256;0.369799493313600;0.358132864975684;21.1000283535949;25.8640187364202;0.332060339295454;-0.224208017297567;-0.246522780582604;-0.310253017194136;-0.335719668638253;-0.338098963445289;-0.338858427183761;-0.345902800895044;-0.377049332312538;-0.414759572319589;-0.430408083956499;-0.433430113589529;-0.434099943180356;-0.435987977736354;-0.447571182665404;-0.455658696962468;-0.459238836223210;-0.460571288645674;-0.461449885379717;-0.438370329521518;-0.445316469740412;-0.112072792215712;-0.142025512847148;-0.142222571040525;-0.138762351945039;-0.139091175556689;-0.139256499719380;-0.138852001804254;-0.136654245646270;-0.133003418846954;-0.136537633847564;-0.136534687842125;-0.136518050403360;-0.136377516308497;-0.135533047296566;-0.134886368848381;-0.134573362425308;-0.134446050237712;-0.134380488991606;-0.174913487206278;-0.188804971011267;802.998070714435;637.901158411887;332.590473361626;294.660537433512;293.661646929218;185.428217895067;147.350444604971;83.7712205647395;224.644135702073;212.651576249197;210.315773654865;208.400073585520;34.8725179330273;27.2848951629272;23.6374264146753;22.1879695988160;21.4879718985410;1266.00170121569;1551.84112418521;16.6030169647727];
xc=[0.000730235602087646,0.00372006166875014,0.0449160106227330,0.139356343425088,0.240492627626492,0.569407502810893,0.00137721823703024,6.92087648762089e-12,2.04168509426954e-26,-2.61959392296970e-32;0.000334414014146372,0.00101897523290478,0.00909809956114959,0.0245075757206946,0.0715197965665978,0.805646930325290,0.0878741953189763,1.32602379525904e-08,1.29974453508235e-21,-1.98249322448692e-26;0.000342118151941009,0.000893370382498736,0.00695902081404365,0.0156121143250025,0.0314699456549243,0.399614511665990,0.545107423462561,1.49554304830301e-06,2.96879527394061e-18,-2.75777850354419e-22;0.000371388883508717,0.000877397119630828,0.00634125405177895,0.0131255127127142,0.0215961342254390,0.171830359349128,0.785828872994828,2.90806629994151e-05,8.42206265615051e-16,-1.80720718410264e-19;0.000376010088946707,0.000867105833276753,0.00615685670928431,0.0125119274032362,0.0197775706298387,0.137004471256256,0.822924231092917,0.000381826986099046,1.49185925868036e-13,-5.52729229133610e-18;0.000377686686936986,0.000866438571228639,0.00612870663488887,0.0124061114677264,0.0194546642445798,0.131871471895551,0.824176152207220,0.00471876826742203,2.44541519224196e-11,-5.00042931705508e-18;0.000382424464862341,0.000872714357434769,0.00614904136734986,0.0123981956806917,0.0192966364602325,0.129311838919261,0.777598256545508,0.0539908885592787,3.64539017432342e-09,2.64911772315457e-18;0.000400024361159347,0.000894464046521220,0.00620717285729142,0.0123246547582017,0.0186353777333138,0.120111722966723,0.567507352385685,0.273919017903400,2.12987711525807e-07,3.97613996517875e-15;0.000427241272341516,0.000925755578058187,0.00627589413791006,0.0121702193459629,0.0176002587126851,0.106771477968750,0.303198883002485,0.552625672209204,4.59777197822388e-06,6.31957010925434e-13;0.000407916325876747,0.000793998858013799,0.00498411857163051,0.00895451675892823,0.0112995627973560,0.0588093259148082,0.131227318685345,0.783477776273698,4.54657911118516e-05,2.32345765950015e-11;0.000412498322946457,0.000786765714755351,0.00486595642129017,0.00861093864290391,0.0105525371159684,0.0525248500042417,0.0817559529664807,0.840138634350095,0.000351865520279224,9.41039657478064e-10;0.000415155511979851,0.000788232479792742,0.00485884617664370,0.00856952430654025,0.0104356385084450,0.0514852009202325,0.0715441547694136,0.849372900295214,0.00253031204434431,3.49873936726212e-08;0.000418360041155387,0.000792769986141187,0.00487966144310618,0.00859353569841551,0.0104360573494958,0.0513038373319371,0.0692294158287375,0.836734392764956,0.0176107175926509,1.25196340150351e-06;0.000427546260085840,0.000805887972276076,0.00494005727792305,0.00866390904419732,0.0104402136533784,0.0508309412334667,0.0664551855722971,0.748314031869416,0.109083000839452,3.92262775067903e-05;0.000435251299540706,0.000817153698635069,0.00499374213634322,0.00873095847947023,0.0104602272900075,0.0505628114883548,0.0647351428226610,0.685024872680089,0.174050512715489,0.000189327389406824;0.000440155250103753,0.000824648894646010,0.00503150547762483,0.00878283682022606,0.0104908347464279,0.0505221650529794,0.0640013231762480,0.656191870114909,0.203040134656338,0.000674525810499191;0.000443502100289954,0.000830064244467471,0.00506053522234762,0.00882646341733982,0.0105273010849871,0.0506049588009945,0.0637876034966238,0.645424036922622,0.212336574881648,0.00215895982867887;0.000446517466546717,0.000835077087487109,0.00508812112220212,0.00886935714915974,0.0105668971603744,0.0507273893435450,0.0637247509928538,0.640446001911348,0.212719562435708,0.00657632533077642;0.000332071030021883,0.000539365817469141,0.00297548888672389,0.00470816869014084,0.00476067446478888,0.0195481864673815,0.0266278610329684,0.544238039047297,0.379906302722132,0.0163638418410765;0.000320842222488389,0.000491881890237686,0.00259910319544938,0.00393312933850515,0.00364120715415336,0.0130801198927189,0.0112100934166477,0.281216487377775,0.607390131596276,0.0761170039157492];
SP=[70;245.93;530.33;755.33];
Distillateini=xfra(20*3+1)/MV(1);
products=[Distillateini;100.973572040226;163.634173822281];
errord=[0.136692017830002;-0.0707331131770190;-0.352870002514544;-2.77937044322705];
Xfilin=[3025.85220559869,793.705291729987,0.0559148422896900,0.0562430796039667,0.217605876121722,0.240577895792075,0.125956811268771,0.220240485954903,0.0318076418832473,0.0469505105292196,0.00428524729043614,0.000417609265968941,1.71679455003844]';

[~,yp]=FCC(xfcc,dist,ufcc,Flpg,Tcondenser,1);
options=[];
h = 10;           % integration step (s), as in dynamic.m
T = 0.0;
MWp5=446.094358949534; MWp4=378.894679684485; MWp3=292.185529267655; MWp2=206.951432493898;
MWp1=120.941794467086; MWc5=85.1347950005991; MWb=58.12; MWp=44.1; MWe=30.07; MWm=16.04;
MWT=[MWm,MWe,MWp,MWb,MWc5,MWp1,MWp2,MWp3,MWp4,MWp5];

header = csv_header();
fid = fopen(out_csv, 'w'); fprintf(fid, '%s\n', strjoin(header, ',')); fclose(fid);
buf = [];
base = struct('ufcc', ufcc, 'dist', dist, 'SP', SP, 'MV', MV);
sstate = struct();
lsode_options("step limit", 500);
tic;
for minute=1:ST
  [ufcc, dist, SP, MV, sstate] = scenario(scenario_name, minute, base, ufcc, dist, SP, MV, sstate);
  % labels / controller mode (defaults = original model: cut-point controllers in auto)
  lbl = [getf(sstate, 'cut_auto', 1), getf(sstate, 'lab', 0), getf(sstate, 'crude_id', 0), getf(sstate, 'event', 0)];
  FCC_CUTPOINT_AUTO = lbl(1);

  % Keep a backup of the last valid state in case lsode/fsolve hits a stiff transient
  T_bak = T; xfcc_bak = xfcc; yp_bak = yp; Flpg_bak = Flpg; Tcond_bak = Tcondenser;
  Xfilin_bak = Xfilin; xfra_bak = xfra; ufra_bak = ufra; xc_bak = xc;
  prod_bak = products; err_bak = errord;
  step_ok = true;
  try
    for j=1:(60/h)
      tspan=[T T+h];
      % Stiff BDF integration with Octave's lsode (ode15s needs SUNDIALS, absent in this Octave build)
      y = lsode(@(x,t) FCND(t,x,[],dist,ufcc,Flpg,Tcondenser,minute), real(xfcc(:)), tspan);
      xfcc=real(y(end,:));
      [~,yp]=FCC(xfcc,dist,ufcc,Flpg,Tcondenser,minute);  % measurements at the end-of-step state
      yp=real(yp);
      Frout=[(yp(36)/MWp5) (yp(37)/MWp4) (yp(38)/MWp3) (yp(39)/MWp2) (yp(40)/MWp1) (yp(41)/MWc5) (yp(42)/MWb) (yp(43)/MWp) (yp(44)/MWe) (yp(45)/MWm)]*(453.59);
      FRT=Frout*ones(10,1);
      xfeedfrac=(fliplr(Frout))/FRT;
      FtotalF=FRT*(60*60/1000);
      Pin=yp(28)*(1/14.503773773);
      ToutF=(yp(7)-32)*(5/9)+273.15;
      Dist=[FtotalF;ToutF;xfeedfrac'];
      ufilter=[Dist;Pin];
      yfilter = lsode(@(x,t) Filter(t,x,[],ufilter), real(Xfilin(:)), tspan);
      Xfilin=real(yfilter(end,:)');
      T=T+h;
      if rem(j,2)==1
        [Temperatureout,Vaporout,xcout,Liqout,Holdout,EnthalLout,EnthalVout,LN,HN,LCO,ELC2,ETC4,ETC5,ETC6,Ttrack1,Ttrack2,yout,Valvesf]=Fractionator(xfra,ufra,xc,MV,SP,products,errord,Xfilin,dist,minute);
      else
        [Temperatureout,Vaporout,xcout,Liqout,Holdout,EnthalLout,EnthalVout,LN,HN,LCO,ELC2,ETC4,ETC5,ETC6,Ttrack1,Ttrack2,yout,Valvesf]=Fractionatori(xfra,ufra,xc,MV,SP,products,errord,yout,Xfilin,dist,minute);
      end
      xfra=real([Holdout;EnthalLout;EnthalVout;Liqout]);
      ufra=real([Vaporout;Temperatureout]);
      xc=real(xcout);
      products=real([LN;HN;LCO]);
      % Anti-windup clamp on HN/LCO cut-point integral errors to prevent singular Jacobians on mode switches
      ETC5 = max(-15, min(15, real(ETC5)));
      ETC6 = max(-35, min(35, real(ETC6)));
      errord=real([ELC2;ETC4;ETC5;ETC6]);
      Flpg=real((ones(1,10)*(yout(1,:)'*Vaporout(1)))*(1000/3600));
      Tcondenser=real(Temperatureout(1));
      LPGMB=real(((1/3.6)*(1/453.59)*Vaporout(1)*yout(1,:).*MWT)*ones(10,1));
      LNMB=real(((1/3.6)*(1/453.59)*LN*xcout(1,:).*MWT)*ones(10,1));
      HNMB=real(((1/3.6)*(1/453.59)*HN*xcout(6,:).*MWT)*ones(10,1));
      LCOMB=real(((1/3.6)*(1/453.59)*LCO*xcout(13,:).*MWT)*ones(10,1));
      SMB=real(((1/3.6)*(1/453.59)*Liqout(end)*xcout(20,:).*MWT)*ones(10,1));
      TMB=real((ufcc(1)-(yp(35)/60+LPGMB+LNMB+HNMB+LCOMB+SMB))*(100/ufcc(1)));
      Conversion=real(((LPGMB+LNMB+HNMB+LCOMB)/ufcc(1))*100);
    end
    t1_F = (Ttrack1-273.15)*9/5+32;
    t2_F = (Ttrack2-273.15)*9/5+32;
    if any(~isfinite(xfcc)) || any(~isfinite(Temperatureout)) || t1_F < 350 || t1_F > 700 || t2_F < 550 || t2_F > 900
      step_ok = false;
    end
  catch
    step_ok = false;
  end

  if ~step_ok
    xfcc = xfcc_bak; yp = yp_bak; Flpg = Flpg_bak; Tcondenser = Tcond_bak;
    Xfilin = Xfilin_bak; xfra = xfra_bak; ufra = ufra_bak; xc = xc_bak;
    products = prod_bak; errord = [err_bak(1:2); 0.8*err_bak(3:4)];
    T = T_bak + 60;
    if ~isempty(buf)
      row = buf(end, :);
      row(1) = minute;
      row(2:5) = dist; row(6) = ufcc(1); row(7:12) = ufcc(10:15);
      row(end-3:end) = lbl;
    else
      row = [minute, dist, ufcc(1), ufcc(10:15), yp(1:52), ...
             (Temperatureout(:)'-273.15)*9/5+32, ...
             [LPGMB LNMB HNMB LCOMB SMB yp(35)/60]*60, Conversion, TMB, ...
             (Ttrack1-273.15)*9/5+32, (Ttrack2-273.15)*9/5+32, ...
             SP(:)', MV(:)', Valvesf(:)', lbl];
    end
  else
    % ---- record one row per minute ----
    row = [minute, dist, ufcc(1), ufcc(10:15), yp(1:52), ...
           (Temperatureout(:)'-273.15)*9/5+32, ...
           [LPGMB LNMB HNMB LCOMB SMB yp(35)/60]*60, Conversion, TMB, ...
           (Ttrack1-273.15)*9/5+32, (Ttrack2-273.15)*9/5+32, ...
           SP(:)', MV(:)', Valvesf(:)', lbl];
  end
  buf = [buf; row];
  if mod(minute,60)==0 || minute==ST
    dlmwrite(out_csv, buf, '-append', 'precision', '%.8g');
    buf = [];
    printf('[%s] minute %d/%d  elapsed %.1f s  LCO_T98=%.2f F  API=%.2f\n', scenario_name, minute, ST, toc, (Ttrack2-273.15)*9/5+32, dist(2));
    fflush(stdout);
  end
end
printf('done: %s (%d min) in %.1f s\n', out_csv, ST, toc);
end

function h = csv_header()
h = {'time_min','dist_T_ambient_F','dist_feed_API','dist_T_feed_in_F','dist_condenser_eff', ...
     'feed_flow_lb_s','SP_T_preheat_F','SP_P_frac_psia','SP_P_reg_psia','SP_T_reg_F','SP_W_reactor_inv_lb','SP_T_riser_ROT_F'};
yp = {'P4_reactor_psia','dP_reactor_frac','F_air_x29','P6_regen_psia','T3_furnace_F','T2_preheat_F','Tr_riser_F', ...
      'Treg_F','standpipe_level','Tcyc_F','dT_cyc_reg_F','fluegas_CO_ppm','fluegas_O2_pct','C_spent_cat','C_regen_cat', ...
      'Fair','W_riser','W_regen','W_standpipe','P5_frac_psia','V4','V6','V7','V3','V1','V2', ...
      'T2_dup','P5_dup','P6_dup','Tr_dup','Treg_dup','Wr_reactor_inv','F_regen_cat','F_spent_cat','F_coke', ...
      'eff_VGO','eff_p1','eff_p2','eff_p3','eff_p4','eff_C5','eff_C4','eff_C3','eff_C2','eff_C1', ...
      'reactor_MB','power_CAB','power_WGC','F5_fuel','F7','F_fluegas','F_V11'};
trays = arrayfun(@(k) sprintf('T_tray%02d_F', k), 1:20, 'UniformOutput', false);
tail = {'prod_LPG','prod_LN','prod_HN','prod_LCO','prod_slurry','prod_coke','conversion_pct','mass_balance_err_pct', ...
        'HN_T98_F','LCO_T98_F','SP_acc_level','SP_T_overhead','SP_HN_T98','SP_LCO_T98', ...
        'MV_reflux_ratio','MV_cw_flow','MV_PA1','MV_PA2','MV_PA3','MV_PA4','valve_V9','valve_V8','valve_V10','valve_V11', ...
        'cutpoint_auto','lab_sample','crude_id','event_code'};
h = [h, yp, trays, tail];
end

function v = getf(s, f, default)
% Field f of struct s, or default if absent.
if isfield(s, f), v = s.(f); else, v = default; end
end

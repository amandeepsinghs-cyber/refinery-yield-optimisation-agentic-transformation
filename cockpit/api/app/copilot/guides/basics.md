# Start here: the FCC from zero

> **In one line:** a refinery boils crude oil into fuels, a heavy leftover called gas oil goes to the FCC, which breaks it into petrol, diesel and LPG on a hot powder; product quality is checked by the lab only every 8 hours, and this app fills the gap with an estimate every minute, says "Not yet" when it is unsure, and leaves every decision to a person.

---

## 1. What a refinery does with crude oil

Crude oil is a mixture of thousands of different molecules. Some are small and light, like the gas in a camping stove. Some are big and heavy, like tar. A refinery's job is to sort that mixture and reshape it into products people can use: LPG, petrol, diesel, jet fuel.

Think of crude as a bag of mixed Lego: tiny pieces, medium pieces and huge clumps. The refinery first sorts the pieces by size. Then it breaks the huge clumps into useful medium pieces.

Crude arrives by ship or pipeline and waits in tanks. The refinery changes which crude it runs every one to two days. The mix of crudes being run is called the **crude slate**.

**Note:** This app simulates only the FCC (six sections). The other refinery units named on the Overview page (crude unit, reformer, hydrotreaters, coker, alkylation) are context, not simulated.

---

## 2. The crude unit, and why heavy gas oil is left over

The first stop is the **crude unit**, often written **CDU / VDU** (crude distillation unit / vacuum distillation unit). It heats the crude and lets it boil in a tall column.

**Distillation** means separating a mixture by boiling point. Light molecules boil at low temperatures and rise to the top. Heavy molecules boil at high temperatures and stay low. So the column splits the crude into bands: gas at the top, then naphtha (raw petrol), kerosene, diesel, and heavier oils at the bottom.

After this sorting, a thick, heavy oil remains. It is called **heavy gas oil**, or **VGO** (vacuum gas oil). It is too heavy to sell as petrol or diesel. Burning it as fuel oil wastes most of its potential. So it becomes the **feed** of the FCC. "Feed" simply means what goes into a unit.

---

## 3. What "cracking" means

**Cracking** means breaking big molecules into smaller ones. Heavy gas oil is made of long chains of carbon atoms (20 to 50 carbon atoms long). Petrol molecules are short chains (about 5 to 12). Break a long chain in the right places and you get petrol, diesel and gas.

**Everyday analogy:** a long baguette is too big for a sandwich. Cut it into pieces and you have sandwich-sized bread. Cracking does the same with molecules. Heat and a special powder do the cutting.

Cracking is not perfect. Some pieces come out too small (gas), and some carbon is left behind as a black solid called **coke**, like the burnt crust at the bottom of a pan.

---

## 4. What a catalyst is

A **catalyst** is a material that makes a reaction happen faster, or at a lower temperature, without being used up itself.

**Everyday analogy:** a matchmaker. The matchmaker brings two people together, then moves on to the next couple, unchanged. Or a pizza stone: it helps the pizza cook evenly but is not eaten.

In the FCC the catalyst is a fine powder, like flour or very fine sand. When air or vapour is blown through it, the powder flows like a liquid. That is the **F** in **FCC: Fluid Catalytic Cracker**. Fluid (the powder flows), catalytic (it uses a catalyst), cracker (it cracks molecules).

The catalyst has one problem: coke from the cracking sticks to it and blocks it. A coked catalyst is called **spent catalyst**. It must be cleaned before it can work again. That cleaning is the job of the regenerator (Section 5).

---

## 5. The six sections, in the order the oil meets them

The drawing on **FCC → Whole unit** shows the six sections left to right. Solid lines carry oil and vapour; the curved dotted line marked **catalyst loop** carries the powder. Each section has its own page under the top tabs **Furnace**, **Riser**, **Regenerator**, **Fractionator**, **Gas plant**, **Stabiliser**.

| # | Section | What goes in | What it does | What comes out | Number under it on the drawing |
|---|---|---|---|---|---|
| 1 | **Feed furnace** | Heavy gas oil (the feed) | Heats the feed, like preheating an oven, so it is ready to meet the hot catalyst | Hot feed (about 616 °F in the default scenario) to the riser | **preheat** (°F) |
| 2 | **Riser reactor** | Hot feed + hot catalyst from the regenerator | A tall pipe. Feed and catalyst shoot up it together; the feed vaporises and cracks in a few seconds. Coke builds up on the catalyst | Cracked vapour to the fractionator; spent catalyst to the regenerator | **conversion** (% of the feed cracked into lighter products) |
| 3 | **Regenerator** | Spent catalyst + air | Air burns the coke off the catalyst. The burning reheats the catalyst (to about 1250 °F), and that heat drives the cracking in the riser | Hot, clean catalyst back to the riser; flue gas out | **afterburn ΔT** (°F): burning in the wrong place, a warning sign |
| 4 | **Main fractionator** | Cracked vapour from the riser | A tall column with about 20 trays. It separates the vapour by boiling point, like the crude unit does | Gas and light naphtha go out the top to the gas plant; **heavy naphtha (HN)** and **light cycle oil (LCO)** drawn from the side; **slurry** from the bottom | **LCO T98** (°F): the product-quality number |
| 5 | **Gas plant** | Overhead vapour from the fractionator | Cools the vapour with cooling water so most of it turns liquid; the **wet-gas compressor** squeezes the remaining gas so it can be recovered | Liquids and gas to the stabiliser | **CW flow** (cooling-water flow) |
| 6 | **Stabiliser** | Liquids from the gas plant | A smaller column that splits the lightest liquids from the rest | **LPG** out the top, **light naphtha** (petrol) out the bottom | **C5 recovery** (how much of the petrol-range material stays in the petrol) |

Under each section on the drawing the main number is followed by a small signed number, for example **LCO T98 750.9 −1.8**. The second number is the gap from what is expected for this feed. Exact values change with the scenario and the minute.

---

## 6. The catalyst loop and the heat balance

**The riser and the regenerator form one loop.** The powder goes round and round, non-stop. In the default scenario about 50,000 lb of catalyst passes each way every minute:

1. Hot, clean catalyst enters the bottom of the riser and meets the feed.
2. It cracks the feed in seconds and picks up coke.
3. The spent catalyst goes to the regenerator, where air burns the coke off.
4. The burning reheats the catalyst, which goes back to the riser.

**The heat balance.** The FCC has no big heater on the riser. The heat for cracking comes from burning the coke in the regenerator, carried over by the hot powder. Think of a wood-fired pizza oven where the leftovers of each pizza are the fuel for the next. More coke means more heat, which means hotter catalyst, which changes how much coke the next pass makes. Everything is linked.

**Why catalyst flow is a result, not a lever.** A valve (the slide valve) opens or closes automatically to send just enough hot catalyst to hold the riser at its temperature target. So the amount of catalyst circulating (the **catalyst-to-oil** ratio) follows from the heat balance. Operators do not set it directly, and the app never advises it.

**The three levers the app does advise** (a **lever** is a setting an operator can move):

| Lever | Where | What it changes |
|---|---|---|
| **Riser outlet temperature** (ROT) | Riser | How hard the unit cracks (its **severity**). Hotter cracks more, but makes more gas and coke |
| **Feed preheat** | Furnace | How hot the feed arrives. Hotter feed needs less hot catalyst, so catalyst-to-oil drops |
| **Regenerator air** | Regenerator | How much air burns the coke. Too little leaves coke on the catalyst; the wrong balance causes afterburn |

The app also advises the **cut points** on the fractionator and the **overhead temperature target** on the gas plant and stabiliser (Sections 8 and 11).

---

## 7. The products

| Product | Plain meaning | Size (carbon atoms) | Goes to |
|---|---|---|---|
| **LPG** | Liquefied petroleum gas: propane and butane, the gas in cooking cylinders | 3–4 | LPG and alkylation feed |
| **Light naphtha** | The lightest petrol-range liquid (gasoline) | 5–7 | Petrol pool |
| **Heavy naphtha (HN)** | Heavier petrol-range liquid | 7–12 | Petrol pool or reformer feed |
| **Light cycle oil (LCO)** | Diesel-range oil | 12–20 | Diesel pool, after sulphur removal |
| **Slurry** (decant oil) | The heaviest leftover, with catalyst dust in it | 20+ | Fuel oil or carbon-black feed |

The fractionator page shows this same table under **What the FCC makes — by molecule size and boiling range**.

---

## 8. Product quality, cut points and T98

**Product quality** means: does the product meet its **spec** (specification), the written limits a product must meet to be sold as that product? For diesel, one key limit is how heavy its heaviest part is.

**Kitchen analogy.** Heat a pan of mixed liquids, say a little alcohol in water with some oil. The alcohol boils off first, then the water, and the oil last. Every oil product is a mixture like this. If you keep heating and note the temperature when 98 of every 100 drops have boiled away, that temperature is the **T98**. It tells you how heavy the heaviest part of the product is. A higher T98 means heavier "last drops".

**The cut point** is where one product ends and the next begins, like drawing a line between shelves in the fractionator. The operator moves it by changing how much is drawn off at each side outlet. The app expresses each cut point as a T98 **set point** (the target value the control system holds).

| If the cut is set… | What happens |
|---|---|
| **Too high** | Heavy molecules slip into the diesel (LCO). Its T98 rises above the spec limit (765 °F in this simulation). The product is **off spec**: it fails its test and must be reprocessed or downgraded |
| **Too low** | Good diesel slips down into the slurry below. The product is safe, but useful product is given away |
| **Just right** | T98 sits close to its target (LCO 755.3 °F, HN 530.3 °F here), below the spec limit (LCO 765 °F, HN 540 °F) with a safe margin |

**Note:** This simulated FCC cuts heavier than a typical one, so its T98 numbers sit above the textbook boiling ranges. Real plants usually use T90 or T95 in their specs; T98 stands in for the heavy-end limit here.

---

## 9. Why the lab every 8 hours leaves operators half-blind

Temperatures, pressures and flows are measured by sensors every second and stored every minute in the **historian** (the plant's database of sensor readings). But T98 cannot be read by a sensor. Someone must take a sample to the lab.

In this app a sample is drawn at **06:00, 14:00 and 22:00**, and the result comes back about **one hour later**. So, just before a result arrives, the latest known quality can be up to about 9 hours old.

**Analogy:** driving with a speedometer that updates every 8 hours. You can still look out of the window (the tray temperatures), but you do not know your exact speed. So operators either run well below the limit to be safe, giving away product, or risk going off spec without knowing.

---

## 10. Why the feed changes, and what API gravity is

When the refinery switches crude, every 12 to 48 hours, the heavy gas oil coming to the FCC changes too. A heavier feed cracks differently from a lighter one. The settings that were right yesterday are wrong today. And the change does not always arrive exactly when the schedule says.

**API gravity** is the oil industry's scale for how light an oil is. Higher API means lighter. Water is 10 on this scale. FCC feeds here sit between about 20 and 29. The app sorts the feed into three classes: **heavy** (API below 22), **intermediate** (22 to 26) and **light** (26 and above). In the default scenario the feed is about **API 23.2**, intermediate.

The app's **feed model** estimates the feed's API every minute from how the unit behaves, flags when the feed is changing, and holds advice until the new feed has settled.

---

## 11. Why a move in one section shows up 1 to 3 hours later elsewhere

The six sections are connected in series and in a loop. A change at the front takes time to ripple through: hot equipment heats and cools slowly, and liquid levels in columns take time to refill. So a move at the furnace or riser is felt at the fractionator and gas plant one to three hours later.

**Analogy:** adjusting a shower with a long pipe. Turn the tap and nothing seems to happen, so you turn it more; then the water arrives scalding. Each console operator also sees mainly their own section. In the default scenario, for example, the riser's conversion has run high since 07:00, and the app warns the regenerator should feel it within about 45 minutes.

---

## 12. What this app adds

| Gap | What the app does |
|---|---|
| Quality known only every 8 h | A **soft sensor** (a set of models that estimates a lab number from live sensor data) gives T98 **every minute**, with how sure it is |
| Feed changes every 1–2 days | The **feed model** spots the change and every piece of advice says which feed it was sized for ("For this feed, API ≈ 23.2") |
| Effects arrive hours later | One ranked list across all six sections. The most urgent decision is marked **act first** |
| A tool that always answers is dangerous | When the models disagree or lack data, the app says **Not yet**. That is a deliberate safety answer, not a failure |

**A person decides.** Each proposal offers **Accept**, **Hold 30 min** or **Decline**. The choice goes only to the **Decision record** page. **Nothing is written to the control system**; the app is advisory only. **Ask Gemini** answers questions about the screen in English, Hinglish or Hindi, and is read-only.

All data comes from a simulated FCC: a published FCC simulator run many times with feed changes and disturbances, so the numbers behave like a real unit.

**Next:** read [the models, from zero](/explainer/models), then [how to read the Whole unit page](/explainer/whole-unit). Look up any word in the [glossary](/explainer/glossary).

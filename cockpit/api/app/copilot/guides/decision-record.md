# How to read: Decision record

> **In one line:** This page is the logbook of the cockpit: every time a person pressed **Accept**, **Hold 30 min** or **Decline**, and every time the trust checks kept advice off the screen, written as one plain sentence, and none of it ever sent to the control system.

## 1. What this page is for

Think of an aircraft's flight recorder: it does not fly the plane, it writes down what happened. The Decision record does the same for the cockpit. It answers four questions:

- **Who** decided? (a person, or the automatic trust checks)
- **What** did they decide? (accept a move, park it, or turn it down)
- **Where?** (which unit of the FCC, for example the Main fractionator)
- **When?** (the clock time the button was pressed)

Some words you will need:

- **Decision**: a piece of advice the cockpit shows on a unit page, for example "move the LCO cut point from 752.8 to 754.8 °F". Each has a short code such as **D1** or **D3** (see [the decisions list on the Overview](/explainer/overview)).
- **Move**: a change to a **set point**. A set point is the target value a controller holds, like the temperature you dial on a home thermostat.
- **Trust checks**: fixed rules that run before any advice is shown. If the models are unsure, the checks hide the advice and the screen says "Not yet". See [the glossary](/explainer/glossary).
- **Control system**: the plant's own computers that actually turn valves (often called the DCS). The cockpit is advisory only. **Nothing on this page, or anywhere in the cockpit, writes to it.**

The page opens with the people's decisions only. The thousands of small automatic events stay one click away.

## 2. What you see, top to bottom

### Part 1: The header

- **FCC Complex / Decision record**: the breadcrumb at the top left. Click **FCC Complex** to go back to the whole-unit page.
- **Decision record**: the page title.
- The sentence under it: "Who decided what, on which unit, and every time the trust checks held advice back. Recorded only — **nothing here was written to the control system.**" This is the promise of the page, in bold.

### Part 2: The four count tiles

Four boxes across the page. Each shows a big number, a label and a short explanation. In the default demo you see roughly **4 Accepted**, **0 Held**, **0 Declined** and **263 Withheld by checks**. Your numbers will differ, because they grow each time someone clicks on a unit page.

| Tile | Small text on screen | What it means in plain words |
|---|---|---|
| **Accepted** (green) | "moves a person agreed to make" | Someone read the advice and said yes. The move is recorded as agreed. The operator still makes the change on the plant by hand. |
| **Held** (amber) | "parked to wait for the lab or a check" | Someone pressed **Hold 30 min**: "not now, ask me again shortly". |
| **Declined** (red) | "advice a person chose not to follow" | Someone said no. That is a valid, recorded answer. |
| **Withheld by checks** | "times the system stayed silent" | The trust checks hid advice because the models were not sure enough. This number is large on purpose: it shows the system knows when to keep quiet. |

**The tiles are also buttons.** Click one and the list below shows only that kind of entry. Click it again to go back to the default view.

Two details matter when you quote the numbers:

- The counts follow the search box and the **Include test runs** box, but not the unit drop-down.
- The page loads the latest 500 entries. The counts cover those entries.

### Part 3: The filter bar

From left to right:

1. **People's decisions** / **Everything**: a two-way switch. **People's decisions** (the default) hides the automatic trust-check entries. **Everything** shows both people and the trust checks.
2. **All units**: a drop-down. It only lists units that already have entries, for example **Riser reactor**, **Regenerator**, **Main fractionator**.
3. **Include test runs**: a tick box, off by default. See Part 6.
4. **Search person, unit, set point…**: a search box on the right. It looks through the person, the action, the decision code and the hidden details. Try "fractionator", "D3" or "operator".

If nothing matches, the page says "Nothing matches these filters." If the record is empty, it says "No decisions recorded yet. Accept, Hold or Decline on a unit page and it appears here."

### Part 4: The timeline

Entries are grouped by day, newest first. Each day has a heading such as **SUNDAY 11 OCTOBER** with the number of events next to it ("4 events").

Each entry has, left to right:

- **The time**, for example **16:15**. This is the real clock time the button was pressed (in UTC, universal time). It is *not* the simulated plant time.
- **A coloured dot** on a vertical line: green for accepted, amber for held, red for declined, grey for trust-check events.
- **The sentence** (see Part 5).
- **A coloured badge** at the end of the sentence: **Accepted**, **Held**, **Declined**, **Advice withheld** or **Advice released**.

Under the sentence there can be up to four more lines:

| Line | Example from the default demo | What it is |
|---|---|---|
| The move | **Riser outlet temperature 969.0 → 972.5 °F** | The exact change, from → to, with its unit. A multi-move recipe shows each move separated by "·". |
| The reason (trust checks only) | "Held back because the prediction spread was too wide · 90 % spread 18.3 °F. request a lab sample; hold current set point." | Why advice was hidden, and what the system suggested instead. |
| The note | "…" in quotes | A comment the person typed, if any. |
| The tags | **UC-01** · **P2** · **P3** · **Decision D3** · **No control-system write** · **Raw entry** | Labels that link the entry back to the use case and problem it serves. |

The tags, in the order they appear:

- **UC-01**, **UC-04**…: the use case. This is the row on the client's own list of use cases (IOCL #1, #4…). See [the Overview guide](/explainer/overview).
- **P1** to **P4**: the business problem the decision tackles. P1 = quality is only known from the lab every 8 hours. P2 = the feed keeps changing. P3 = a move in one unit shows up hours later in another. P4 = an AI that always answers is dangerous; it must say when it does not know.
- **Decision D1**, **D3**, **D5**…: which decision type the entry belongs to.
- For trust-check entries, a tag such as **run s153 · 07:00 sim time**: which simulated run and which simulated clock time the event happened at.
- **No control-system write** (green outline): a stamp on every entry. It confirms in writing that nothing went to the plant.
- **Raw entry** (far right): click to unfold the original stored record, exactly as saved. This is for an auditor who wants the data, not the sentence.

### Part 5: How each entry becomes a sentence

The cockpit stores each event as a data row: who, what action, which decision, and details. The page turns that row into English with one simple pattern:

**Who** + **verb** + **what** + "on" + **unit**

Example: "**Operator** accepted **a move** on **Main fractionator**".

| Part | Where it comes from | What you can see |
|---|---|---|
| **Who** | The user name saved with the click | **Operator**; a shift lead (a user saved as "shift_lead_asha" would show as **Asha, shift lead**); **Trust checks** for the automatic rules; **Test run** for automated tests; any other name with dashes turned into spaces |
| **Verb** | The button pressed | accepted · put on hold · declined · withheld advice on · released advice on |
| **What** | The details | **a move** or **2 moves** for people; for trust checks, the product, **LCO T98** or **HN T98** |
| **Unit** | The details | A link such as **Main fractionator**. Click it to open that unit page. |

**LCO T98** and **HN T98** are the two product qualities the models estimate every minute (the lab measures them every 8 h). T98 is the temperature at which 98 % of a product has boiled off: its "heavy end". LCO is light cycle oil (goes to diesel); HN is heavy naphtha (goes to petrol).

The reason words for trust checks are translated too:

| Stored code | Shown as |
|---|---|
| wide | "the prediction spread was too wide" |
| bimodal | "the models disagreed" |
| ood | "inputs were outside the training range" |
| stale | "the data was stale" |

"Prediction spread" means how far apart the estimates are. The "90 % spread" is the width that holds 9 in 10 likely values. If it is wider than the limit (14 °F for these products), the advice is hidden. When the checks pass again, an **Advice released** entry reads "Checks passed again — advice is shown on screen."

### Part 6: Why test runs are hidden

The developers run an automatic test suite that presses the buttons to prove they work. Those clicks carry the user name "pytest" (the name of the test tool). They are not real decisions, so the page hides them. Tick **Include test runs** to see any that exist; they appear as **Test run**. Today's tests write to a throw-away file, so normally there are none.

## 3. What "held", "expired" and "withheld" mean

- **Held** is a person's choice. **Hold 30 min** parks a decision for 30 minutes of *simulated* plant time. Move the scenario clock 30 minutes or more past the hold and the decision re-opens on the unit page. The record keeps the original "put on hold" entry. It does not add a second entry when the decision re-opens.
- **Withheld** is the system's choice. The trust checks would not show the advice at all. A person cannot accept a withheld decision. The cockpit refuses, because there is no move to accept. The same applies to "watch only" items.
- **Expired** never appears on this page. The decision engine has the word in its list of states, but no current rule sets it, and the record has no "expired" badge.

## 4. What resets, and when

- **On the hosted demo**, the record starts from a fixed starting copy (the "seed") each time a new version is deployed. Clicks made during a demo stay until the next deploy, then disappear.
- **On a developer's machine**, the record keeps growing until someone runs the reset step. That step first archives a copy, then removes the people's clicks. It keeps the trust-check entries.
- The trust-check entries are written when the models are trained, all with the training time. That is why, under **Everything**, hundreds of them sit under one earlier day at the same minute. The simulated time of each one is in its **run … sim time** tag.

## 5. What to click

1. Start on the default view, **People's decisions**. Read one sentence aloud.
2. Click the green move line, then the unit link (for example **Main fractionator**) to show where the decision came from.
3. Click the **Withheld by checks** tile. Read one reason line aloud: "the models disagreed".
4. Switch to **Everything** to show people and checks side by side.
5. Open **Raw entry** on one row to show that the original data sits behind every sentence.

## 6. What to say in the demo

- "Every Accept, Hold and Decline lands here as one plain sentence: who, what, which unit, when."
- "Look at this number: 263 times, the system chose to stay silent because it was not sure. That is the safety feature, not a bug."
- "Every entry carries this green stamp: no control-system write. The cockpit advises; people decide; the plant is untouched."
- "If your auditor wants the raw data, it is one click away under each sentence."

## 7. Questions people ask (and honest answers)

**Does accepting a move change the plant?**
No. Accept only records the decision. The operator makes the change through the plant's own control system, by hand, under their normal procedure.

**Why is the time different from the time on the unit page?**
The record shows the real clock time of the click. The unit page shows simulated plant time. The simulated minute is inside the decision code in **Raw entry** (for example "…random_s144-0525" means minute 525, 08:45 sim time).

**Can someone edit or delete an entry?**
Not from the screen. The page is read-only. The only clean-up is the developer reset step, which archives a full copy first.

**Is the context saved?**
Yes. Each click is saved with a full snapshot of what the screen showed at that moment. For how the models learn, see [the models guide](/explainer/models).

**Is this real plant data?**
No. All entries come from the cockpit running on a simulated FCC.

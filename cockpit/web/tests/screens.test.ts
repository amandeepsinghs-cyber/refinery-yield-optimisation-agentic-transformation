import { describe, expect, it } from "vitest";
import { intentPathFor, screenPathFor } from "@/lib/screens";

describe("screen navigation intents", () => {
  it("routes direct status and unit requests to the right cockpit screens", () => {
    expect(intentPathFor("What's the status in the refinery? What needs attention?")).toBe("/twin");
    expect(intentPathFor("What is going on?")).toBe("/twin");
    expect(intentPathFor("Tell me what's going on in the refinery")).toBe("/twin");
    expect(intentPathFor("What is the LCO cut point?")).toBe("/twin/unit/unit_4_fractionator");
    expect(intentPathFor("Take me to the furnace preheat")).toBe("/twin/unit/unit_1_furnace");
    expect(screenPathFor("open_screen", { screen: "fractionator" })).toBe("/twin/unit/unit_4_fractionator");
    expect(screenPathFor("get_refinery_status", {})).toBe("/twin");
  });

  it("does not hijack greetings, conceptual questions, or management-story framing", () => {
    expect(intentPathFor("Hi Aman, how are you? Good morning.")).toBeNull();
    expect(intentPathFor("What is a soft sensor?")).toBeNull();
    expect(
      intentPathFor(
        "So I'm trying to make a story for me to explain to the management what is going on and showcase the value of agentic transformation in refinery",
      ),
    ).toBeNull();
  });
});

import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * The "Assigned To" picker.
 *
 * It has real state — a dropdown that can turn into a text field and back —
 * and the case that matters most is the quiet one: an item assigned to
 * somebody who is no longer on the roster must still show their name. A picker
 * that silently blanked it would lose the assignment the next time anyone
 * opened the editor to change something else.
 */

let ROSTER = [];

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: ROSTER, error: null }) }),
    }),
  },
}));

async function mount(ui) {
  let out;
  await act(async () => {
    out = render(ui);
    await new Promise((r) => setTimeout(r, 0));
  });
  return out;
}

beforeEach(async () => {
  ROSTER = [
    { name: "Cameron Pearson", active: true },
    { name: "Karl Bagley", active: true },
    { name: "Someone Moved Away", active: false },
  ];
  const mod = await import("../src/components/AssigneePicker");
  mod.refreshMemberNames();
});
afterEach(cleanup);

describe("AssigneePicker", () => {
  it("offers the roster as a dropdown", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    await mount(<AssigneePicker value="" onChange={() => {}} />);

    const select = screen.getByRole("combobox");
    const options = [...select.options].map((o) => o.text);
    expect(options).toContain("Cameron Pearson");
    expect(options).toContain("Karl Bagley");
  });

  it("leaves inactive members off the list", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    await mount(<AssigneePicker value="" onChange={() => {}} />);

    const options = [...screen.getByRole("combobox").options].map((o) => o.text);
    expect(options).not.toContain("Someone Moved Away");
  });

  it("labels itself Assigned To", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    await mount(<AssigneePicker value="" onChange={() => {}} />);

    expect(screen.getByRole("combobox").options[0].text).toBe("Assigned To…");
  });

  it("reports the name that was picked", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    const onChange = vi.fn();
    await mount(<AssigneePicker value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Karl Bagley" } });
    expect(onChange).toHaveBeenCalledWith("Karl Bagley");
  });

  it("opens a text field for someone not on the roster", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    await mount(<AssigneePicker value="" onChange={() => {}} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__other__" } });
    expect(screen.getByPlaceholderText("Assigned To")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps a name the roster has never heard of", async () => {
    // The case this exists for: an assignment to a bishop, a family, or
    // somebody's wife — none of whom are on the elders quorum roster.
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    await mount(<AssigneePicker value="The Stones" onChange={() => {}} />);

    expect(screen.getByDisplayValue("The Stones")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("opens the text field when an off-roster value arrives after mount", async () => {
    // The picker starts on the dropdown, then the parent hands it a name the
    // roster doesn't have. Without the effect that watches the value, it would
    // stay on the dropdown — which has no option matching the name, so the
    // select falls back to showing the blank placeholder and the assignment
    // looks empty while the database still holds it.
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    const dom = await mount(<AssigneePicker value="" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeTruthy();

    await act(async () => {
      dom.rerender(<AssigneePicker value="Retired Brother" onChange={() => {}} />);
    });

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(dom.container.querySelector("input").value).toBe("Retired Brother");
  });

  it("can go back to the list", async () => {
    const { default: AssigneePicker } = await import("../src/components/AssigneePicker");
    const onChange = vi.fn();
    await mount(<AssigneePicker value="The Stones" onChange={onChange} />);

    fireEvent.click(screen.getByText("List"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("combobox")).toBeTruthy();
  });
});

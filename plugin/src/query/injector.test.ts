import { describe, expect, it } from "vitest";

import { handleMarginMousedown, isMarginClick } from "@/query/injector";

// jsdom gives every element a zero rect, so the band has to be stated.
const blockAt = (top: number, bottom: number) => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top, bottom, height: bottom - top, left: 200, right: 800 }) as DOMRect;
  return el;
};

describe("isMarginClick", () => {
  it("blocks a click level with the block but outside the text column", () => {
    const block = blockAt(100, 300);
    // The target is CodeMirror's content padding, not the block.
    expect(isMarginClick(block, document.createElement("div"), 200)).toBe(true);
  });

  it("blocks a click on the block's own padding", () => {
    const block = blockAt(100, 300);
    expect(isMarginClick(block, block, 200)).toBe(true);
  });

  it("allows a click on a control inside the block", () => {
    const block = blockAt(100, 300);
    const button = block.appendChild(document.createElement("button"));
    expect(isMarginClick(block, button, 200)).toBe(false);
  });

  it("allows a click in the margin level with something else", () => {
    const block = blockAt(100, 300);
    expect(isMarginClick(block, document.createElement("div"), 400)).toBe(false);
    expect(isMarginClick(block, document.createElement("div"), 50)).toBe(false);
  });

  it("owns no clicks when the block has no height", () => {
    const block = blockAt(100, 100);
    expect(isMarginClick(block, document.createElement("div"), 100)).toBe(false);
  });

  it("blocks a click with no target, level with the block", () => {
    const block = blockAt(100, 300);
    expect(isMarginClick(block, null, 200)).toBe(true);
  });
});

describe("handleMarginMousedown", () => {
  const setup = (opts: { inEditor?: boolean } = {}) => {
    const editor = document.createElement("div");
    editor.classList.add("cm-editor");
    const content = editor.appendChild(document.createElement("div"));
    const block = content.appendChild(document.createElement("div"));
    block.getBoundingClientRect = () =>
      ({ top: 100, bottom: 300, height: 200, left: 200, right: 800 }) as DOMRect;

    const target = opts.inEditor === false ? document.createElement("div") : content;
    const calls = { prevented: 0, stopped: 0 };
    const evt = {
      target,
      clientY: 200,
      preventDefault: () => {
        calls.prevented++;
      },
      stopPropagation: () => {
        calls.stopped++;
      },
    };
    return { block, evt, calls };
  };

  it("stops the event as well as the default action", () => {
    const { block, evt, calls } = setup();
    expect(handleMarginMousedown(block, evt)).toBe(true);
    // stopPropagation is what actually keeps CodeMirror from moving the
    // cursor; preventDefault alone left the block dropping to source.
    expect(calls.stopped).toBe(1);
    expect(calls.prevented).toBe(1);
  });

  it("ignores a click in another pane", () => {
    const { block, evt, calls } = setup({ inEditor: false });
    expect(handleMarginMousedown(block, evt)).toBe(false);
    expect(calls.stopped).toBe(0);
  });

  it("ignores a block that is not inside an editor", () => {
    const { evt, calls } = setup();
    const orphan = document.createElement("div");
    orphan.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200 }) as DOMRect;
    expect(handleMarginMousedown(orphan, evt)).toBe(false);
    expect(calls.stopped).toBe(0);
  });
});

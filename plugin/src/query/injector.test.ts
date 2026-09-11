import { describe, expect, it } from "vitest";

import { isMarginClick } from "@/query/injector";

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

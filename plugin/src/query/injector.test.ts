import { describe, expect, it } from "vitest";

import { isMarginClick } from "@/query/injector";

describe("isMarginClick", () => {
  const wrapper = (...classes: string[]) => {
    const el = document.createElement("div");
    el.classList.add(...classes);
    return el;
  };

  it("blocks a click on the Live Preview wrapper itself", () => {
    const el = wrapper("cm-embed-block");
    expect(isMarginClick(el, el)).toBe(true);
  });

  it("allows a click on anything inside the block", () => {
    const el = wrapper("cm-embed-block");
    const button = el.appendChild(document.createElement("button"));
    expect(isMarginClick(el, button)).toBe(false);
  });

  it("allows a click when there is no cursor to place", () => {
    const el = wrapper("block-language-todoist");
    expect(isMarginClick(el, el)).toBe(false);
  });

  it("allows a click with no target", () => {
    const el = wrapper("cm-embed-block");
    expect(isMarginClick(el, null)).toBe(false);
  });
});

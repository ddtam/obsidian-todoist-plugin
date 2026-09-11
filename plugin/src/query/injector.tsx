import type { MarkdownPostProcessorContext } from "obsidian";
import { MarkdownRenderChild } from "obsidian";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import { create, type StoreApi, type UseBoundStore } from "zustand";

import type TodoistPlugin from "@/index";
import { debug } from "@/log";
import { parseQuery } from "@/query/parser";
import { applyReplacements } from "@/query/replacements";
import { taskRefQueryDefinition } from "@/query/schema/taskRef";
import { taskQueryDefinition } from "@/query/schema/tasks";
import {
  type MarkdownEditButton,
  MarkdownEditButtonContext,
  PluginContext,
  RenderChildContext,
} from "@/ui/context";
import { QueryError } from "@/ui/query/QueryError";
import { QueryRoot } from "@/ui/query/QueryRoot";
import { TaskBadge } from "@/ui/taskBadge/TaskBadge";

export class QueryInjector {
  private readonly plugin: TodoistPlugin;
  constructor(plugin: TodoistPlugin) {
    this.plugin = plugin;
  }

  onNewBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    let child: MarkdownRenderChild;

    try {
      const [query, warnings] = parseQuery(source, taskQueryDefinition);
      applyReplacements(query, ctx);

      debug({
        msg: "Parsed query",
        context: query,
      });

      child = new ReactRenderer(
        el,
        this.plugin,
        QueryRoot,
        {
          query,
          warnings,
        },
        true,
      );
    } catch (e) {
      console.error(e);
      child = new ReactRenderer(
        el,
        this.plugin,
        QueryError,
        {
          error: e,
        },
        false,
      );
    }

    ctx.addChild(child);
  }

  onNewTaskRefBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    let child: MarkdownRenderChild;

    try {
      const [query] = parseQuery(source, taskRefQueryDefinition);

      debug({
        msg: "Parsed task ref",
        context: query,
      });

      child = new ReactRenderer(el, this.plugin, TaskBadge, { query }, true);
    } catch (e) {
      console.error(e);
      child = new ReactRenderer(el, this.plugin, QueryError, { error: e }, false);
    }

    ctx.addChild(child);
  }
}

/**
 * Whether a mousedown landed in the margin beside a rendered block.
 *
 * True only for the Live Preview wrapper itself: in reading mode there is no
 * cursor to place and the wrapper carries no `cm-embed-block` class, and any
 * hit on a descendant is a real interaction with the block's own controls.
 * `classList` rather than Obsidian's `hasClass` so this holds in a plain DOM.
 */
export function isMarginClick(wrapper: HTMLElement, target: EventTarget | null): boolean {
  return wrapper.classList.contains("cm-embed-block") && target === wrapper;
}

class ReactRenderer<T extends {}> extends MarkdownRenderChild {
  private readonly plugin: TodoistPlugin;
  private readonly props: T;
  private readonly component: React.FC<T>;
  private readonly reactRoot: Root;

  private readonly observer: MutationObserver;

  private readonly store: UseBoundStore<StoreApi<MarkdownEditButton>>;

  constructor(
    container: HTMLElement,
    plugin: TodoistPlugin,
    component: React.FC<T>,
    props: T,
    interceptEditButton: boolean,
  ) {
    super(container);
    this.plugin = plugin;
    this.component = component;
    this.props = props;
    this.reactRoot = createRoot(this.containerEl);
    this.store = create(() => {
      return { click: () => {} };
    });

    this.observer = new MutationObserver((mutations) => {
      if (!interceptEditButton) {
        return;
      }

      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (!(addedNode instanceof HTMLElement)) {
            continue;
          }

          if (!addedNode.classList.contains("edit-block-button")) {
            continue;
          }

          addedNode.hide();
          this.store.setState({
            click: () => addedNode.click(),
          });
          return;
        }
      }
    });
  }

  onload(): void {
    const wrapper = this.containerEl.parentElement;
    if (wrapper !== null) {
      this.observer.observe(wrapper, {
        childList: true,
      });
      this.guardAgainstCursorPlacement(wrapper);
    }

    const Component = this.component;
    this.reactRoot.render(
      <MarkdownEditButtonContext.Provider value={this.store}>
        <RenderChildContext.Provider value={this}>
          <PluginContext.Provider value={this.plugin}>
            <Component {...this.props} />
          </PluginContext.Provider>
        </RenderChildContext.Provider>
      </MarkdownEditButtonContext.Provider>,
    );
  }

  /**
   * Stop a click beside the block from dropping it back to source.
   *
   * In Live Preview the rendered block is a widget on one CodeMirror line, and
   * the line is wider than the widget. A click in that margin, to the left or
   * right of the card, lands on the wrapper rather than on anything of ours,
   * and CodeMirror answers it by putting the cursor on the line, which swaps
   * the widget for its source. Leaving and re-entering then remounts the React
   * root and refetches, so the block flickers and the page jumps under the
   * reader, for a click that was never asking to edit anything.
   *
   * Preventing the default on mousedown is what stops the selection moving;
   * doing it on click is too late. Only a hit on the wrapper itself is
   * guarded, so every control, checkbox and text selection inside the block
   * behaves exactly as before, and the header's edit button is still the way
   * in to the source.
   */
  private guardAgainstCursorPlacement(wrapper: HTMLElement): void {
    this.registerDomEvent(wrapper, "mousedown", (evt: MouseEvent) => {
      if (isMarginClick(wrapper, evt.target)) {
        evt.preventDefault();
      }
    });
  }

  onunload(): void {
    this.reactRoot.unmount();
    this.observer.disconnect();
  }
}

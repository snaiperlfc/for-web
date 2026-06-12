import { Accessor, JSX } from "solid-js";

import { cva } from "styled-system/css";

const baseStyles = cva({
  base: {
    willChange: "transform",
    scrollbarWidth: "none",

    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  variants: {
    direction: {
      x: {
        overflowX: "scroll",
      },
      y: {
        overflowY: "scroll",
      },
    },
  },
  defaultVariants: {
    direction: "y",
  },
});

/**
 * Add styles for an invisible scrollable container
 * @param el Element
 * @param accessor Parameters
 */
// STELLIS: true on phones/tablets (no hover, coarse pointer).
const COARSE_POINTER =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export function invisibleScrollable(
  el: HTMLDivElement,
  accessor: Accessor<JSX.Directives["invisibleScrollable"] & object>,
) {
  const props = accessor();

  el.classList.add(...baseStyles().split(" "));

  if (props.class) {
    props.class.split(" ").forEach((cls) => el.classList.add(cls));
  }

  // STELLIS: clear `will-change: transform` on touch — it breaks native
  // iOS touch scrolling of the overflow container. See scrollable.ts.
  if (COARSE_POINTER) {
    el.style.willChange = "auto";
  }
}

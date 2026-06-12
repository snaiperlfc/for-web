import { type Accessor, type JSX, onCleanup } from "solid-js";

import { cva } from "styled-system/css";

// STELLIS: true on phones/tablets (no hover, coarse pointer). Used to work
// around iOS touch-scroll quirks below.
const COARSE_POINTER =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export const scrollableStyles = cva({
  base: {
    willChange: "transform",
    scrollbarColor: "var(--md-sys-color-primary) transparent",
  },
  variants: {
    direction: {
      x: {
        overflowX: "auto",
        overflowY: "hidden",
      },
      y: {
        overflowY: "auto",
        overflowX: "hidden",
      },
    },
    showOnHover: {
      true: {
        overflow: "hidden !important",
        scrollbarGutter: "stable",
      },
    },
  },
  defaultVariants: {
    direction: "y",
    showOnHover: false,
  },
});

const hoverStyles = cva({
  variants: {
    direction: {
      x: {
        overflowX: "scroll !important",
        overflowY: "hidden !important",
      },
      y: {
        overflowY: "scroll !important",
        overflowX: "hidden !important",
      },
    },
  },
  defaultVariants: {
    direction: "y",
  },
});

/**
 * Add styles and events for a scrollable container
 * @param el Element
 * @param accessor Parameters
 */
export function scrollable(
  el: HTMLDivElement,
  accessor: Accessor<JSX.Directives["scrollable"] & object>,
) {
  const props = accessor();
  if (!props) return;

  if (props.offsetTop) {
    el.style.paddingTop = props.offsetTop + "px";
  }

  el.classList.add(
    ...scrollableStyles({
      direction: props.direction,
      showOnHover: props.showOnHover,
    }).split(" "),
  );

  if (props.class) {
    props.class.split(" ").forEach((cls) => el.classList.add(cls));
  }

  // STELLIS: `will-change: transform` promotes this container to its own
  // compositing layer, which on iOS Safari/PWA silently disables native
  // touch scrolling of the overflow area (the chat list and sidebars
  // simply wouldn't scroll on a real iPhone — fine in desktop emulation).
  // Clear it on touch devices.
  if (COARSE_POINTER) {
    el.style.willChange = "auto";
  }

  if (props.showOnHover) {
    const showClass = hoverStyles({ direction: props.direction }).split(" ");

    // STELLIS: touch devices never fire mouseenter, so a showOnHover
    // container (e.g. the members sidebar) would stay `overflow: hidden`
    // and never scroll. Reveal the scroll overflow immediately on touch.
    if (COARSE_POINTER) {
      el.classList.add(...showClass);
      return;
    }

    /**
     * Handle mouse entry
     */
    const onMouseEnter = () => {
      const isOverflowing =
        props.direction === "x"
          ? el.scrollWidth > el.clientWidth
          : el.scrollHeight > el.clientHeight;

      if (isOverflowing) {
        el.classList.add(...showClass);
      }
    };

    /**
     * Handle mouse leave
     */
    const onMouseLeave = () => {
      el.classList.remove(...showClass);
    };

    el.addEventListener("mouseenter", onMouseEnter);
    el.addEventListener("mouseleave", onMouseLeave);

    onCleanup(() => {
      el.removeEventListener("mouseenter", onMouseEnter);
      el.removeEventListener("mouseleave", onMouseLeave);
    });
  }
}

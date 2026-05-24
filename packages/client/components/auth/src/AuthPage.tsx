import { JSX, Suspense, lazy } from "solid-js";

import { styled } from "styled-system/jsx";

import { Titlebar } from "@revolt/app/interface/desktop/Titlebar";
import { useState } from "@revolt/state";
import { IconButton, iconSize } from "@revolt/ui";

import MdDarkMode from "@material-design-icons/svg/filled/dark_mode.svg?component-solid";

import { FlowBase } from "./flows/Flow";

// STELLIS: 3D background is ~150KB three.js — lazy-load so the auth form
// paints immediately and the scene fades in once WebGL is ready.
const AuthBackground3D = lazy(() => import("./AuthBackground3D"));

/**
 * Authentication page layout
 *
 * STELLIS: 3D canvas sits at `position: absolute; inset: 0; z-index: 0`
 * behind everything else. Nav + form get `position: relative; z-index: 1`
 * so they always sit on top of the canvas.
 */
const Base = styled("div", {
  base: {
    position: "relative",
    isolation: "isolate",
    width: "100%",
    height: "100%",
    padding: "40px 35px",

    userSelect: "none",
    overflowY: "scroll",

    color: "var(--md-sys-color-on-surface)",
    background:
      "radial-gradient(circle at 50% 40%, #1A1F2E 0%, #11141C 60%, #07090E 100%)",

    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",

    mdDown: {
      padding: "30px 20px",
    },
  },
});

/**
 * Top and bottom navigation bars
 */
const Nav = styled("div", {
  base: {
    height: "32px",
    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",

    textDecoration: "none",
  },
});

/**
 * Authentication page
 */
export function AuthPage(props: { children: JSX.Element }) {
  const state = useState();

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
      }}
    >
      <Titlebar />
      <Base css={{ scrollbar: "hidden" }}>
        <Suspense fallback={null}>
          <AuthBackground3D />
        </Suspense>
        <Nav style={{ position: "relative", "z-index": 1 }}>
          <div />
          <IconButton
            variant="tonal"
            onPress={() =>
              state.theme.setMode(
                state.theme.activeTheme.darkMode ? "light" : "dark",
              )
            }
          >
            <MdDarkMode {...iconSize("24px")} />
          </IconButton>
        </Nav>
        <div style={{ position: "relative", "z-index": 1 }}>
          <FlowBase>{props.children}</FlowBase>
        </div>
        {/* STELLIS: closed instance — Stoat community nav + unsplash credit убраны */}
        <div style={{ height: "32px" }} />
      </Base>
    </div>
  );
}

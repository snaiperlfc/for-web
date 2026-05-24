import { JSXElement } from "solid-js";

/**
 * STELLIS: AgeGate disabled (closed instance, trusted users only).
 * Always passes children through — no NSFW prompt, no geo-blocking.
 */
export function AgeGate(props: {
  enabled: boolean;
  contentId: string;
  contentName: string;
  contentType: "channel";
  children: JSXElement;
}) {
  return <>{props.children}</>;
}

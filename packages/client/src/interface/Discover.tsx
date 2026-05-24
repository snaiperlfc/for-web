import { onMount } from "solid-js";

import { useNavigate } from "@revolt/routing";

/**
 * STELLIS: Discover page disabled (closed instance, single server).
 * Redirect to home.
 */
export function Discover() {
  const navigate = useNavigate();

  onMount(() => {
    navigate("/", { replace: true });
  });

  return null;
}

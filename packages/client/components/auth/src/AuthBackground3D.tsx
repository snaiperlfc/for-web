import { createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";

/**
 * 3D background for the auth page.
 *
 * Mirrors the landing-page Hero3D scene (gold ✦ + particle field + gentle
 * pointer parallax) but written in vanilla three.js so it compiles into the
 * Solid auth bundle without dragging in React/@react-three/fiber.
 *
 * Lazy-load this from AuthPage so the form paints before the WebGL context
 * compiles (~50–150ms even on a midrange phone).
 *
 * Honors prefers-reduced-motion: renders one static frame, no rAF.
 */
export function AuthBackground3D() {
  let canvasEl: HTMLCanvasElement | undefined;
  const [ready, setReady] = createSignal(false);

  onMount(() => {
    if (!canvasEl) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

    // ---- the central ✦ star ----------------------------------------------
    const shape = new THREE.Shape();
    const r = 1;
    const inner = 0.18 * r;
    shape.moveTo(0, r);
    shape.lineTo(inner, inner);
    shape.lineTo(r, 0);
    shape.lineTo(inner, -inner);
    shape.lineTo(0, -r);
    shape.lineTo(-inner, -inner);
    shape.lineTo(-r, 0);
    shape.lineTo(-inner, inner);
    shape.closePath();

    const starGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.03,
      bevelSegments: 4,
    });
    starGeometry.computeVertexNormals();
    starGeometry.center();

    const starMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5a857,
      metalness: 0.75,
      roughness: 0.22,
      emissive: 0xe5a857,
      emissiveIntensity: 0.14,
    });
    const star = new THREE.Mesh(starGeometry, starMaterial);

    const rimMaterial = new THREE.MeshBasicMaterial({
      color: 0xf3c57a,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
    });
    const starRim = new THREE.Mesh(starGeometry, rimMaterial);
    starRim.scale.setScalar(1.04);

    const starGroup = new THREE.Group();
    starGroup.add(star);
    starGroup.add(starRim);

    // ---- particle field --------------------------------------------------
    const PARTICLE_COUNT = 140;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const radius = 3 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[3 * i] = radius * Math.sin(phi) * Math.cos(theta);
      positions[3 * i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[3 * i + 2] = radius * Math.cos(phi) - 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      color: 0xf4f1e8,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);

    // ---- parallax pivot (rotates with pointer) ---------------------------
    const pivot = new THREE.Group();
    pivot.add(starGroup);
    pivot.add(particles);
    scene.add(pivot);

    // ---- lights ----------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.PointLight(0xffd9a8, 1.4);
    key.position.set(5, 5, 5);
    scene.add(key);
    const fill = new THREE.PointLight(0xffb347, 0.5);
    fill.position.set(-5, -3, 3);
    scene.add(fill);

    // ---- resize + responsive camera --------------------------------------
    const resize = () => {
      const w = canvasEl!.clientWidth;
      const h = canvasEl!.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      const aspect = camera.aspect;
      const z = aspect < 0.8 ? 9 : aspect < 1.2 ? 7 : 6;
      camera.position.set(0, 0, z);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvasEl);

    // ---- pointer parallax ------------------------------------------------
    const pointerTarget = { x: 0, y: 0 };
    const handlePointer = (e: PointerEvent) => {
      pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 0.3;
      pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 0.3;
    };
    if (!reduceMotion) {
      window.addEventListener("pointermove", handlePointer, { passive: true });
    }

    // ---- render loop -----------------------------------------------------
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      const dt = clock.getDelta();
      const t = clock.elapsedTime;

      if (!reduceMotion) {
        starGroup.rotation.y += dt * 0.25;
        starGroup.rotation.x = Math.sin(t * 0.4) * 0.12;
        particles.rotation.y = t * 0.03;
        const breath = 1 + Math.sin(t * 0.6) * 0.02;
        particles.scale.setScalar(breath);
        pivot.rotation.y += (pointerTarget.x - pivot.rotation.y) * 0.04;
        pivot.rotation.x += (-pointerTarget.y - pivot.rotation.x) * 0.04;
      }

      renderer.render(scene, camera);
      if (!reduceMotion) raf = requestAnimationFrame(tick);
    };
    tick();
    requestAnimationFrame(() => setReady(true));

    // ---- cleanup ---------------------------------------------------------
    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", handlePointer);
      starGeometry.dispose();
      starMaterial.dispose();
      rimMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    });
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        "z-index": 0,
        "pointer-events": "none",
        overflow: "hidden",
        // Radial vignette so the form stays readable over busy areas.
        background:
          "radial-gradient(ellipse at center, transparent 0%, rgba(17,20,28,0.55) 55%, var(--md-sys-color-surface, #11141C) 100%)",
      }}
    >
      <canvas
        ref={canvasEl}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          opacity: ready() ? 1 : 0,
          transition: "opacity 600ms ease",
        }}
      />
    </div>
  );
}

export default AuthBackground3D;

import React from "react";
import * as THREE from "three";
import type { TaskQueue, VisualizerEvent } from "@jsv/protocol";
import { useRectRegistry } from "./RectRegistry";

const TASK_QUEUE_TO_BOX: Record<TaskQueue, string> = {
  timers: "box-timers",
  pending: "box-pending",
  poll: "box-poll",
  io: "box-poll",
  check: "box-check",
  close: "box-close",
};

type FlowSpec = {
  fromId: string;
  toId: string;
  color: number;
  label: string;
  fallbackFromId?: string;
  fallbackToId?: string;
};

type FlowParticle = {
  curve: THREE.CubicBezierCurve3;
  group: THREE.Group;
  node: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  labelSprite: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  labelMaterial: THREE.SpriteMaterial;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  trailPoints: THREE.Vector3[];
  startedAt: number;
  durationMs: number;
};

function resolveFlow(event: VisualizerEvent): FlowSpec | null {
  switch (event.type) {
    case "WEBAPI_SCHEDULE":
      if (!event.source) {
        return null;
      }
      return {
        fromId: `code-line-${event.source.line}`,
        toId: "box-webapi",
        color: 0xd946ef,
        label: "schedule",
      };
    case "HANDLE_OPEN":
      return {
        fromId: event.source ? `code-line-${event.source.line}` : "box-code",
        toId: "box-webapi",
        color: 0xd946ef,
        label: event.label,
      };
    case "REQUEST_START":
      return {
        fromId: event.source ? `code-line-${event.source.line}` : "box-code",
        toId: "box-webapi",
        color: 0xd946ef,
        label: event.label,
      };
    case "TIMER_HEAP_SCHEDULE":
      return {
        fromId: event.source ? `code-line-${event.source.line}` : "box-webapi",
        fallbackFromId: "box-code",
        toId: "box-timer-heap",
        color: 0xfb7185,
        label: event.label,
      };
    case "TIMER_HEAP_READY":
      return {
        fromId: `token-timer-heap-${event.timerId}`,
        fallbackFromId: "box-timer-heap",
        toId: "box-timers",
        color: 0xfbbf24,
        label: event.label,
      };
    case "ENQUEUE_TASK":
      if (event.queue === "timers") {
        return {
          fromId: "box-timer-heap",
          toId: "box-timers",
          color: 0xfbbf24,
          label: event.label,
        };
      }
      if (event.queue === "poll" || event.queue === "io") {
        return {
          fromId: `token-webapi-${event.taskId}`,
          fallbackFromId: "box-webapi",
          toId: TASK_QUEUE_TO_BOX[event.queue],
          color: 0xc084fc,
          label: event.label,
        };
      }
      if (event.queue === "pending") {
        return {
          fromId: "box-webapi",
          toId: TASK_QUEUE_TO_BOX[event.queue],
          color: 0xfb923c,
          label: event.label,
        };
      }
      return {
        fromId: event.source ? `code-line-${event.source.line}` : "box-loop",
        toId: TASK_QUEUE_TO_BOX[event.queue],
        color: 0xfbbf24,
        label: event.label,
      };
    case "ENQUEUE_MICROTASK":
      return {
        fromId: event.source ? `code-line-${event.source.line}` : "box-stack",
        toId: "box-microtask",
        color: 0x22d3ee,
        label: event.label,
      };
    case "DEQUEUE_TASK":
      return {
        fromId: `token-${event.taskId}`,
        fallbackFromId: TASK_QUEUE_TO_BOX[event.queue],
        toId: "box-stack",
        color:
          event.queue === "check"
            ? 0xfbbf24
            : event.queue === "close"
              ? 0x94a3b8
              : event.queue === "pending"
                ? 0xfb923c
                : event.queue === "poll" || event.queue === "io"
                  ? 0xc084fc
                  : 0xfbbf24,
        label: event.taskId,
      };
    case "DEQUEUE_MICROTASK":
      return {
        fromId: `token-${event.id}`,
        fallbackFromId: "box-microtask",
        toId: "box-stack",
        color: 0x22d3ee,
        label: event.id,
      };
    case "CONSOLE":
      return {
        fromId: "anchor-stack-center",
        fallbackFromId: "box-stack",
        toId: "anchor-code-output-center",
        fallbackToId: "box-code-output-body",
        color: event.level === "error" ? 0xef4444 : event.level === "warn" ? 0xf59e0b : 0x22c55e,
        label: `console.${event.level}`,
      };
    case "RUNTIME_ERROR":
      return {
        fromId: "anchor-stack-center",
        fallbackFromId: "box-stack",
        toId: "anchor-code-output-center",
        fallbackToId: "box-code-output-body",
        color: 0xef4444,
        label: "runtime error",
      };
    default:
      return null;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function createLabelSprite(text: string): {
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  sprite: THREE.Sprite;
} {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 768;
  canvas.height = 192;

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const radius = 24;
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(
      canvas.width,
      canvas.height,
      canvas.width - radius,
      canvas.height,
    );
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 46px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const normalized =
      text.length > 24 ? `${text.slice(0, 24).trimEnd()}...` : text;
    ctx.fillText(normalized, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(250, 64, 1);

  return { texture, material, sprite };
}

export function FlowGpuOverlay({
  lastEvent,
  resetKey,
}: {
  lastEvent: VisualizerEvent | null;
  resetKey: number;
}) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.OrthographicCamera | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const particlesRef = React.useRef<FlowParticle[]>([]);
  const frameTimeRef = React.useRef<number>(0);
  const { getRect } = useRectRegistry();

  const resolveRect = React.useCallback(
    (id: string) => {
      const domRect = document.getElementById(id)?.getBoundingClientRect() ?? null;
      if (domRect && domRect.width > 0 && domRect.height > 0) {
        return domRect;
      }
      // Use cached rects only for moving tokens that may unmount before animation spawns.
      if (!id.startsWith("token-")) {
        return null;
      }
      const cachedRect = getRect(id);
      if (!cachedRect || cachedRect.width <= 0 || cachedRect.height <= 0) {
        return null;
      }
      return cachedRect;
    },
    [getRect],
  );

  const clearParticles = React.useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) {
      particlesRef.current = [];
      return;
    }

    for (const particle of particlesRef.current) {
      scene.remove(particle.group);
      scene.remove(particle.trail);
      particle.node.geometry.dispose();
      particle.node.material.dispose();
      particle.glow.geometry.dispose();
      particle.glow.material.dispose();
      particle.labelTexture.dispose();
      particle.labelMaterial.dispose();
      particle.trail.geometry.dispose();
      particle.trail.material.dispose();
    }
    particlesRef.current = [];
  }, []);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(
      0,
      window.innerWidth,
      0,
      window.innerHeight,
      -1000,
      1000,
    );
    camera.position.z = 10;
    cameraRef.current = camera;

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current) {
        return;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;
      rendererRef.current.setSize(width, height, false);
      cameraRef.current.left = 0;
      cameraRef.current.right = width;
      // Match DOM coordinates directly: x grows right, y grows down.
      cameraRef.current.top = 0;
      cameraRef.current.bottom = height;
      cameraRef.current.updateProjectionMatrix();
    };

    handleResize();
    mount.appendChild(renderer.domElement);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    const animate = (now: number) => {
      const rendererCurrent = rendererRef.current;
      const sceneCurrent = sceneRef.current;
      const cameraCurrent = cameraRef.current;
      if (!rendererCurrent || !sceneCurrent || !cameraCurrent) {
        return;
      }

      frameTimeRef.current = now;
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const tRaw = (now - particle.startedAt) / particle.durationMs;
        const t = Math.max(0, Math.min(1, tRaw));
        const eased = easeInOutCubic(t);
        const point = particle.curve.getPoint(eased);

        particle.group.position.copy(point);
        particle.node.material.opacity = 0.98 - t * 0.45;
        particle.glow.material.opacity = 0.55 - t * 0.28;
        particle.labelMaterial.opacity = 0.98 - t * 0.35;
        particle.trail.material.opacity = 0.78 - t * 0.45;

        particle.trailPoints.unshift(point.clone());
        if (particle.trailPoints.length > 28) {
          particle.trailPoints.pop();
        }

        const positions = particle.trail.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const oldest =
          particle.trailPoints[particle.trailPoints.length - 1] ?? point;
        for (let p = 0; p < 28; p++) {
          const src = particle.trailPoints[p] ?? oldest;
          positions.setXYZ(p, src.x, src.y, src.z);
        }
        positions.needsUpdate = true;

        if (tRaw >= 1) {
          sceneCurrent.remove(particle.group);
          sceneCurrent.remove(particle.trail);
          particle.node.geometry.dispose();
          particle.node.material.dispose();
          particle.glow.geometry.dispose();
          particle.glow.material.dispose();
          particle.labelTexture.dispose();
          particle.labelMaterial.dispose();
          particle.trail.geometry.dispose();
          particle.trail.material.dispose();
          particles.splice(i, 1);
        }
      }

      rendererCurrent.render(sceneCurrent, cameraCurrent);
      rafRef.current = window.requestAnimationFrame(animate);
    };

    rafRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      clearParticles();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [clearParticles]);

  const spawnFlow = React.useCallback(
    (event: VisualizerEvent) => {
      const spec = resolveFlow(event);
      const scene = sceneRef.current;
      if (!spec || !scene) {
        return;
      }

      // Keep one active moving entity to avoid visual clutter.
      clearParticles();

      const fromRect =
        resolveRect(spec.fromId) ??
        (spec.fallbackFromId ? resolveRect(spec.fallbackFromId) : null);
      const toRect =
        resolveRect(spec.toId) ??
        (spec.fallbackToId ? resolveRect(spec.fallbackToId) : null);
      if (!fromRect || !toRect) {
        return;
      }

      const from = new THREE.Vector3(
        fromRect.left + fromRect.width / 2,
        fromRect.top + fromRect.height / 2,
        0,
      );
      const to = new THREE.Vector3(
        toRect.left + toRect.width / 2,
        toRect.top + toRect.height / 2,
        0,
      );

      const distance = from.distanceTo(to);
      const verticalDelta = Math.abs(to.y - from.y);
      const arc = Math.max(
        100,
        Math.min(300, 80 + distance * 0.32 + verticalDelta * 0.18),
      );
      const c1 = new THREE.Vector3(
        from.x + (to.x - from.x) * 0.25,
        from.y - arc,
        0,
      );
      const c2 = new THREE.Vector3(
        from.x + (to.x - from.x) * 0.75,
        to.y - arc,
        0,
      );
      const curve = new THREE.CubicBezierCurve3(from, c1, c2, to);

      const material = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.98,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.5,
      });
      const node = new THREE.Mesh(new THREE.SphereGeometry(8, 18, 18), material);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(16, 16, 16),
        glowMaterial,
      );

      const { texture: labelTexture, material: labelMaterial, sprite: labelSprite } =
        createLabelSprite(spec.label);
      labelSprite.position.set(0, -34, 0);

      const group = new THREE.Group();
      group.add(glow);
      group.add(node);
      group.add(labelSprite);
      group.position.copy(from);
      scene.add(group);

      const trailMaterial = new THREE.LineBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.7,
      });
      const trailGeometry = new THREE.BufferGeometry();
      const trailPositions = new Float32Array(28 * 3);
      for (let i = 0; i < 28; i++) {
        trailPositions[i * 3] = from.x;
        trailPositions[i * 3 + 1] = from.y;
        trailPositions[i * 3 + 2] = from.z;
      }
      trailGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(trailPositions, 3),
      );
      const trail = new THREE.Line(trailGeometry, trailMaterial);
      scene.add(trail);

      particlesRef.current.push({
        curve,
        group,
        node,
        glow,
        labelSprite,
        labelTexture,
        labelMaterial,
        trail,
        trailPoints: [],
        startedAt: frameTimeRef.current || performance.now(),
        durationMs: Math.max(1150, Math.min(2100, 900 + distance * 1.35)),
      });
    },
    [clearParticles, resolveRect],
  );

  React.useEffect(() => {
    if (!lastEvent) {
      return;
    }
    spawnFlow(lastEvent);
  }, [lastEvent, spawnFlow]);

  React.useEffect(() => {
    clearParticles();
  }, [resetKey, clearParticles]);

  return (
    <div
      ref={mountRef}
      className="pointer-events-none fixed inset-0 z-[90]"
      aria-hidden
    />
  );
}

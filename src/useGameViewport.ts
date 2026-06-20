import { useState, useEffect, useRef, useCallback } from "react";
import { CANVAS_W, CANVAS_H } from "./levels";

export interface ViewportInfo {
  scale: number;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  canvasHeight: number;
  isLandscape: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function calculateViewport(
  containerWidth: number,
  containerHeight: number
): { scale: number; offsetX: number; offsetY: number } {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scaleX = containerWidth / CANVAS_W;
  const scaleY = containerHeight / CANVAS_H;
  const scale = Math.min(scaleX, scaleY);

  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;

  const offsetX = (containerWidth - scaledW) / 2;
  const offsetY = (containerHeight - scaledH) / 2;

  return { scale, offsetX, offsetY };
}

function getWindowOrientation(): boolean {
  if (typeof window === "undefined") return true;
  const aspectRatio = window.innerWidth / window.innerHeight;
  return aspectRatio >= 1.3;
}

export function useGameViewport(): ViewportInfo {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    isLandscape: true,
  });

  const updateViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const isLandscape = getWindowOrientation();

    const { scale, offsetX, offsetY } = calculateViewport(width, height);

    setViewport({
      scale,
      offsetX,
      offsetY,
      canvasWidth: width,
      canvasHeight: height,
      isLandscape,
    });
  }, []);

  useEffect(() => {
    updateViewport();

    const resizeObserver = new ResizeObserver(updateViewport);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener("orientationchange", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("orientationchange", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [updateViewport]);

  return {
    ...viewport,
    containerRef,
  };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportInfo
): { x: number; y: number } {
  const x = (screenX - viewport.offsetX) / viewport.scale;
  const y = (screenY - viewport.offsetY) / viewport.scale;
  return { x, y };
}

import { ViewportInfo, screenToWorld } from "./useGameViewport";

export interface InputCallbacks {
  onDragStart?: (x: number, y: number) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onKeyDown?: (key: string, e: KeyboardEvent) => void;
  onVisibilityChange?: (hidden: boolean) => void;
}

export interface InputControllerOptions {
  touchRadius?: number;
  checkCanStartDrag?: (x: number, y: number) => boolean;
  getBallPosition?: () => { x: number; y: number };
}

export class InputController {
  private canvas: HTMLCanvasElement;
  private viewport: ViewportInfo;
  private callbacks: InputCallbacks;
  private options: InputControllerOptions;
  private isDragging: boolean = false;

  private boundOnDown: (e: MouseEvent | TouchEvent) => void;
  private boundOnMove: (e: MouseEvent | TouchEvent) => void;
  private boundOnUp: (e: MouseEvent | TouchEvent) => void;
  private boundOnLeave: (e: MouseEvent | TouchEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnVisibilityChange: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: ViewportInfo,
    callbacks: InputCallbacks = {},
    options: InputControllerOptions = {}
  ) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.callbacks = callbacks;
    this.options = options;

    this.boundOnDown = this.onDown.bind(this);
    this.boundOnMove = this.onMove.bind(this);
    this.boundOnUp = this.onUp.bind(this);
    this.boundOnLeave = this.onLeave.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnVisibilityChange = this.onVisibilityChange.bind(this);

    this.attachEventListeners();
  }

  setViewport(viewport: ViewportInfo): void {
    this.viewport = viewport;
  }

  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setOptions(options: InputControllerOptions): void {
    this.options = { ...this.options, ...options };
  }

  private attachEventListeners(): void {
    const canvas = this.canvas;

    canvas.addEventListener("mousedown", this.boundOnDown);
    canvas.addEventListener("mousemove", this.boundOnMove);
    canvas.addEventListener("mouseup", this.boundOnUp);
    canvas.addEventListener("mouseleave", this.boundOnLeave);
    canvas.addEventListener("touchstart", this.boundOnDown, { passive: false });
    canvas.addEventListener("touchmove", this.boundOnMove, { passive: false });
    canvas.addEventListener("touchend", this.boundOnUp, { passive: false });
    canvas.addEventListener("touchcancel", this.boundOnUp, { passive: false });

    window.addEventListener("keydown", this.boundOnKeyDown);
    document.addEventListener("visibilitychange", this.boundOnVisibilityChange);
  }

  destroy(): void {
    const canvas = this.canvas;

    canvas.removeEventListener("mousedown", this.boundOnDown);
    canvas.removeEventListener("mousemove", this.boundOnMove);
    canvas.removeEventListener("mouseup", this.boundOnUp);
    canvas.removeEventListener("mouseleave", this.boundOnLeave);
    canvas.removeEventListener("touchstart", this.boundOnDown);
    canvas.removeEventListener("touchmove", this.boundOnMove);
    canvas.removeEventListener("touchend", this.boundOnUp);
    canvas.removeEventListener("touchcancel", this.boundOnUp);

    window.removeEventListener("keydown", this.boundOnKeyDown);
    document.removeEventListener("visibilitychange", this.boundOnVisibilityChange);
  }

  private getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      clientX = t.clientX;
      clientY = t.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return screenToWorld(screenX, screenY, this.viewport);
  }

  private canStartDrag(x: number, y: number): boolean {
    if (this.options.checkCanStartDrag) {
      return this.options.checkCanStartDrag(x, y);
    }

    if (this.options.getBallPosition && this.options.touchRadius) {
      const ballPos = this.options.getBallPosition();
      const dx = x - ballPos.x;
      const dy = y - ballPos.y;
      return Math.sqrt(dx * dx + dy * dy) < this.options.touchRadius;
    }

    return true;
  }

  private onDown(e: MouseEvent | TouchEvent): void {
    if (this.options.checkCanStartDrag && !this.options.checkCanStartDrag(0, 0)) {
      return;
    }

    e.preventDefault();
    const pos = this.getPos(e);

    if (!this.canStartDrag(pos.x, pos.y)) {
      return;
    }

    this.isDragging = true;
    this.callbacks.onDragStart?.(pos.x, pos.y);
  }

  private onMove(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    e.preventDefault();
    const pos = this.getPos(e);
    this.callbacks.onDragMove?.(pos.x, pos.y);
  }

  private onUp(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    e.preventDefault();
    const pos = this.getPos(e);
    this.isDragging = false;
    this.callbacks.onDragEnd?.(pos.x, pos.y);
  }

  private onLeave(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    this.onUp(e);
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.callbacks.onKeyDown?.(e.key, e);
  }

  private onVisibilityChange(): void {
    this.callbacks.onVisibilityChange?.(document.hidden);
  }

  getIsDragging(): boolean {
    return this.isDragging;
  }
}

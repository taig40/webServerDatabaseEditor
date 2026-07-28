/**
 * PetAnimator.tsx — Canvas-based sprite animator for rAthena pets.
 *
 * Renders the pet's idle animation via the `/api/pets/{mobAegisName}/animation`
 * endpoint.  When `equipAegisName` is provided, a second transparent canvas is
 * rendered on top using `/api/pets/{mob}/equip_animation?equip={equipAegisName}`,
 * compositing the accessory sprite over the base mob.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patch {
  x: number;
  y: number;
  mirror: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  sheet_x: number;
  sheet_y: number;
  w: number;
  h: number;
  /** RGBA tint from the .act file [R, G, B, A]. A=255 means fully opaque. */
  rgba?: [number, number, number, number];
  /** Sprite type: 0 = Indexed palette, 1 = BGRA32. */
  spr_type?: number;
}

interface Frame {
  patches: Patch[];
}

interface AnimationData {
  spritesheet: string;
  frame_duration: number;
  frames: Frame[];
}

/** Props for the {@link PetAnimator} component. */
interface PetAnimatorProps {
  /** AegisName of the pet's base mob (e.g. `"PORING"`). */
  mobAegisName: string;
  /**
   * Optional AegisName of the pet accessory item (EquipItem).
   * When provided, a second canvas layer renders the accessory sprite on top.
   */
  equipAegisName?: string;
  /** Accessible label used for `data-testid`. */
  label?: string;
  /** Canvas preset size. Defaults to `'md'`. */
  size?: 'sm' | 'md' | 'lg';
}

const CANVAS_SIZES = {
  sm: { width: 120, height: 120 },
  md: { width: 200, height: 200 },
  lg: { width: 280, height: 280 },
} as const;

// ─── Rendering hook ───────────────────────────────────────────────────────────

interface AnimLayer {
  data: AnimationData;
  sheet: HTMLImageElement;
}

/**
 * Loads animation data + spritesheet image for a given URL.
 * Returns `null` while loading and `false` on error.
 */
function useAnimLayer(url: string | null): AnimLayer | null | false {
  const [state, setState] = useState<AnimLayer | null | false>(null);

  useEffect(() => {
    if (!url) {
      setState(null);
      return;
    }
    let active = true;
    setState(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((data: AnimationData) => {
        if (!active) return;
        const img = new Image();
        img.src = data.spritesheet;
        img.onload = () => { if (active) setState({ data, sheet: img }); };
        img.onerror = () => { if (active) setState(false); };
      })
      .catch(() => { if (active) setState(false); });

    return () => { active = false; };
  }, [url]);

  return state;
}

// ─── Canvas draw helper ───────────────────────────────────────────────────────

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: AnimLayer,
  frameIdx: number,
  cx: number,
  cy: number,
  scale: number,
) {
  const frame = layer.data.frames[frameIdx % layer.data.frames.length];
  if (!frame?.patches) return;
  frame.patches.forEach((p) => {
    ctx.save();
    ctx.translate(cx, cy);
    const sx = (p.mirror === 1 ? -p.scale_x : p.scale_x) * scale;
    const sy = p.scale_y * scale;
    ctx.scale(sx, sy);
    if (p.rotation !== 0) ctx.rotate((p.rotation * Math.PI) / 180);

    // Apply ACT alpha tint — always set (even 1.0) so ctx.save/restore cleanly isolates it.
    const alpha = p.rgba ? p.rgba[3] / 255.0 : 1.0;
    ctx.globalAlpha = alpha;

    ctx.drawImage(
      layer.sheet,
      p.sheet_x, p.sheet_y, p.w, p.h,
      p.x - p.w / 2, p.y - p.h / 2, p.w, p.h,
    );
    ctx.restore();
  });
}

/** Calculates a scale factor so the sprite fits within `targetPx` pixels. */
function calcAutoScale(layer: AnimLayer, targetPx: number, maxScale: number): number {
  let minX = 99999, maxX = -99999, minY = 99999, maxY = -99999;
  layer.data.frames.forEach((frame) => {
    frame.patches?.forEach((p) => {
      const hw = (p.w / 2) * Math.abs(p.scale_x);
      const hh = (p.h / 2) * Math.abs(p.scale_y);
      if (p.x - hw < minX) minX = p.x - hw;
      if (p.x + hw > maxX) maxX = p.x + hw;
      if (p.y - hh < minY) minY = p.y - hh;
      if (p.y + hh > maxY) maxY = p.y + hh;
    });
  });
  const mw = maxX - minX;
  const mh = maxY - minY;
  if (mw > 0 && mh > 0) {
    return Math.min((targetPx * 0.75) / mw, (targetPx * 0.75) / mh, maxScale);
  }
  return 1.0;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders an animated pet sprite on Canvas.
 * Optionally renders the equipped pet sprite via a second endpoint if available.
 */
const PetAnimator: React.FC<PetAnimatorProps> = ({
  mobAegisName,
  equipAegisName,
  label,
  size = 'md',
}) => {
  const t = useLanguageStore((s) => s.t);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentFrameRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const dims = CANVAS_SIZES[size];
  const testId = `pet-animator-${label ?? mobAegisName}`;

  const baseUrl = mobAegisName
    ? `${API_URL}/api/pets/${encodeURIComponent(mobAegisName)}/animation`
    : null;

  const equipUrl =
    equipAegisName && mobAegisName
      ? `${API_URL}/api/pets/${encodeURIComponent(mobAegisName)}/equip_animation?equip=${encodeURIComponent(equipAegisName)}`
      : null;

  const baseLayer = useAnimLayer(baseUrl);
  const equipLayer = useAnimLayer(equipUrl);

  // Auto-scale based on base layer bounding box
  const autoScale = React.useMemo(() => {
    if (!baseLayer) return 1.0;
    const raw = calcAutoScale(baseLayer, dims.width, size === 'sm' ? 1.0 : 1.5);
    return Math.max(raw, 0.35);
  }, [baseLayer, dims.width, size]);

  // Composite render loop — draws equip layer if available, otherwise base
  useEffect(() => {
    if (!baseLayer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    currentFrameRef.current = 0;
    lastFrameTimeRef.current = performance.now();

    const renderLoop = (time: number) => {
      const duration = baseLayer.data.frame_duration || 150;
      if (time - lastFrameTimeRef.current >= duration) {
        currentFrameRef.current = (currentFrameRef.current + 1) % baseLayer.data.frames.length;
        lastFrameTimeRef.current = time;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.75;

      // In kRO, pet equipments are full sprites (pet body + accessory).
      // We draw the equipped sprite if loaded; otherwise we draw the base sprite.
      if (equipLayer !== null && equipLayer !== false) {
        drawLayer(ctx, equipLayer, currentFrameRef.current, cx, cy, autoScale);
      } else {
        drawLayer(ctx, baseLayer, currentFrameRef.current, cx, cy, autoScale);
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [baseLayer, equipLayer, autoScale]);

  // ── States ────────────────────────────────────────────────────────────────

  if (baseLayer === null) {
    return (
      <div
        data-testid={testId}
        style={dims}
        className="flex flex-col items-center justify-center bg-dark-800/60 border border-dark-600 rounded-lg gap-2 text-gray-500"
      >
        <Loader2 className="animate-spin text-pink-400" size={20} />
        <span className="text-[10px]">{t('common.loading')}</span>
      </div>
    );
  }

  if (baseLayer === false) {
    return (
      <div
        data-testid={testId}
        style={dims}
        className="flex flex-col items-center justify-center bg-dark-800/60 border border-dark-600 rounded-lg text-center p-3 text-gray-500 gap-1"
      >
        <AlertCircle size={18} className="text-red-500/60" />
        <span className="text-[10px] text-gray-600">{t('monster_animator.no_sprite_kro')}</span>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="relative group bg-dark-800/50 border border-dark-600 rounded-lg p-2 flex items-center justify-center shadow-lg hover:border-pink-500/40 transition-all duration-300"
      style={dims}
    >
      <canvas
        ref={canvasRef}
        width={dims.width}
        height={dims.height}
        className="pixelated"
      />
      {/* Equip loading indicator */}
      {equipUrl && equipLayer === null && (
        <div className="absolute bottom-1 right-1 opacity-50">
          <Loader2 size={10} className="animate-spin text-pink-400" />
        </div>
      )}
      <div className="absolute bottom-1 left-2 text-[9px] text-gray-500 bg-dark-900/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
        {baseLayer.data.frames.length}f
      </div>
    </div>
  );
};

export default PetAnimator;

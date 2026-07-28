/**
 * PetAnimator.tsx — Canvas-based sprite animator for rAthena pets.
 *
 * Consumes the `/api/pets/{mobAegisName}/animation` endpoint and renders
 * the idle animation frame-by-frame on an HTML Canvas, reusing the same
 * rendering pipeline as {@link MonsterAnimator} but keyed by AegisName.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

/** Single sprite patch drawing instruction from the server. */
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
}

/** Animation frame containing layered patches. */
interface Frame {
  patches: Patch[];
}

/** Complete spritesheet animation definition returned by the server. */
interface AnimationData {
  spritesheet: string;
  frame_duration: number;
  frames: Frame[];
}

/** Props for the {@link PetAnimator} component. */
interface PetAnimatorProps {
  /** AegisName of the pet's base mob (e.g. `"PORING"`). */
  mobAegisName: string;
  /** Accessible label used as the card title and for `data-testid`. */
  label?: string;
  /** Canvas preset size. Defaults to `'md'`. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Optional overlay element rendered on top of the canvas (e.g. accessory icon).
   * Positioned absolutely at the bottom-center of the canvas container.
   */
  overlay?: React.ReactNode;
}

const CANVAS_SIZES = {
  sm: { width: 120, height: 120 },
  md: { width: 200, height: 200 },
  lg: { width: 280, height: 280 },
} as const;

/**
 * Renders an animated pet sprite inside a Canvas element.
 * Fetches animation data from `/api/pets/{mobAegisName}/animation`.
 */
const PetAnimator: React.FC<PetAnimatorProps> = ({
  mobAegisName,
  label,
  size = 'md',
  overlay,
}) => {
  const t = useLanguageStore((s) => s.t);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentFrameRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animData, setAnimData] = useState<AnimationData | null>(null);
  const [sheet, setSheet] = useState<HTMLImageElement | null>(null);
  const [autoScale, setAutoScale] = useState(1.0);

  const dims = CANVAS_SIZES[size];
  const testId = `pet-animator-${label ?? mobAegisName}`;

  // Fetch animation JSON whenever the AegisName changes
  useEffect(() => {
    if (!mobAegisName) return;
    let active = true;
    setLoading(true);
    setError(null);
    setAnimData(null);
    setSheet(null);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    fetch(`${API_URL}/api/pets/${encodeURIComponent(mobAegisName)}/animation`)
      .then((res) => {
        if (!res.ok) throw new Error(t('monster_animator.animation_not_found'));
        return res.json();
      })
      .then((data: AnimationData) => {
        if (!active) return;
        setAnimData(data);
        const img = new Image();
        img.src = data.spritesheet;
        img.onload = () => {
          if (!active) return;
          setSheet(img);
          setLoading(false);
        };
        img.onerror = () => {
          if (!active) return;
          setError(t('monster_animator.error_spritesheet'));
          setLoading(false);
        };
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || t('common.error'));
        setLoading(false);
      });

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mobAegisName]);

  // Auto-scale: fit the sprite bounding box within 75% of the canvas
  useEffect(() => {
    if (!animData) return;
    let minX = 99999, maxX = -99999, minY = 99999, maxY = -99999;
    animData.frames.forEach((frame) => {
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
      const s = Math.min(
        (dims.width * 0.75) / mw,
        (dims.height * 0.75) / mh,
        size === 'sm' ? 1.0 : 1.5,
      );
      setAutoScale(Math.max(s, 0.35));
    } else {
      setAutoScale(1.0);
    }
  }, [animData, dims.width, dims.height, size]);

  // Render loop
  useEffect(() => {
    if (!sheet || !animData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    currentFrameRef.current = 0;
    lastFrameTimeRef.current = performance.now();

    const renderLoop = (time: number) => {
      const duration = animData.frame_duration || 150;
      if (time - lastFrameTimeRef.current >= duration) {
        currentFrameRef.current = (currentFrameRef.current + 1) % animData.frames.length;
        lastFrameTimeRef.current = time;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const frame = animData.frames[currentFrameRef.current];
      if (frame?.patches) {
        frame.patches.forEach((p) => {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height * 0.75);
          const sx = (p.mirror === 1 ? -p.scale_x : p.scale_x) * autoScale;
          const sy = p.scale_y * autoScale;
          ctx.scale(sx, sy);
          if (p.rotation !== 0) ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.drawImage(sheet, p.sheet_x, p.sheet_y, p.w, p.h, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
          ctx.restore();
        });
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [sheet, animData, autoScale]);

  if (loading) {
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

  if (error || !animData) {
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
      {overlay && (
        <div className="absolute bottom-2 right-2 pointer-events-none">
          {overlay}
        </div>
      )}
      <div className="absolute bottom-1 left-2 text-[9px] text-gray-500 bg-dark-900/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
        {animData.frames.length}f
      </div>
    </div>
  );
};

export default PetAnimator;

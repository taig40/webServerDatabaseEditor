/**
 * MonsterAnimator.tsx — Canvas-based sprite animator for rAthena monsters using server-generated animation patches.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../config/env';
import { useLanguageStore } from '../store/useLanguageStore';

/** Single sprite patch drawing instruction. */
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

/** Props for the monster animation canvas component. */
interface MonsterAnimatorProps {
  mobId: number;
  mobName: string;
  size?: 'sm' | 'md' | 'lg';
  spriteKey?: number;
}

/**
 * Renders an animated monster sprite inside a dynamic canvas.
 */
const MonsterAnimator: React.FC<MonsterAnimatorProps> = ({ mobId, mobName, size = 'md', spriteKey = 0 }) => {
  const t = useLanguageStore(state => state.t);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [animData, setAnimData] = useState<AnimationData | null>(null);
  const [spritesheetImg, setSpritesheetImg] = useState<HTMLImageElement | null>(null);
  const currentFrameRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const [autoScale, setAutoScale] = useState<number>(1.0);

  const canvasDimensions = {
    sm: { width: 120, height: 120 },
    md: { width: 220, height: 220 },
    lg: { width: 320, height: 320 },
  }[size];

  useEffect(() => {
    if (!animData) return;
    let minX = 99999, maxX = -99999, minY = 99999, maxY = -99999;
    
    animData.frames.forEach(frame => {
      if (frame.patches) {
        frame.patches.forEach(patch => {
          const scaleX = Math.abs(patch.scale_x);
          const scaleY = Math.abs(patch.scale_y);
          const halfW = (patch.w / 2) * scaleX;
          const halfH = (patch.h / 2) * scaleY;
          const x1 = patch.x - halfW;
          const x2 = patch.x + halfW;
          const y1 = patch.y - halfH;
          const y2 = patch.y + halfH;
          if (x1 < minX) minX = x1;
          if (x2 > maxX) maxX = x2;
          if (y1 < minY) minY = y1;
          if (y2 > maxY) maxY = y2;
        });
      }
    });

    const mobW = maxX - minX;
    const mobH = maxY - minY;

    if (mobW > 0 && mobH > 0) {
      const scaleLimitX = (canvasDimensions.width * 0.75) / mobW;
      const scaleLimitY = (canvasDimensions.height * 0.75) / mobH;
      let computed = Math.min(scaleLimitX, scaleLimitY);
      
      computed = Math.min(Math.max(computed, 0.35), size === 'sm' ? 1.0 : 1.5);
      setAutoScale(computed);
    } else {
      setAutoScale(1.0);
    }
  }, [animData, size, canvasDimensions.width, canvasDimensions.height]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAnimData(null);
    setSpritesheetImg(null);
    
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    fetch(`${API_URL}/api/mobs/${mobId}/animation?_t=${spriteKey}`)
      .then(res => {
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
          setSpritesheetImg(img);
          setLoading(false);
        };
        img.onerror = () => {
          if (!active) return;
          setError(t('monster_animator.error_spritesheet'));
          setLoading(false);
        };
      })
      .catch(err => {
        if (!active) return;
        setError(err.message || t('common.error'));
        setLoading(false);
      });

    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [mobId, spriteKey]);

  useEffect(() => {
    if (!spritesheetImg || !animData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    currentFrameRef.current = 0;
    lastFrameTimeRef.current = performance.now();

    const renderLoop = (time: number) => {
      const duration = animData.frame_duration || 150;
      const elapsed = time - lastFrameTimeRef.current;

      if (elapsed >= duration) {
        currentFrameRef.current = (currentFrameRef.current + 1) % animData.frames.length;
        lastFrameTimeRef.current = time;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const frame = animData.frames[currentFrameRef.current];
      if (frame && frame.patches) {
        frame.patches.forEach(patch => {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height * 0.75);

          const scaleX = (patch.mirror === 1 ? -patch.scale_x : patch.scale_x) * autoScale;
          const scaleY = patch.scale_y * autoScale;
          ctx.scale(scaleX, scaleY);

          if (patch.rotation !== 0) {
            ctx.rotate((patch.rotation * Math.PI) / 180);
          }

          const destX = patch.x - patch.w / 2;
          const destY = patch.y - patch.h / 2;

          ctx.drawImage(
            spritesheetImg,
            patch.sheet_x,
            patch.sheet_y,
            patch.w,
            patch.h,
            destX,
            destY,
            patch.w,
            patch.h
          );

          ctx.restore();
        });
      }

      animationFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [spritesheetImg, animData]);

  if (loading) {
    if (size === 'sm') {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <Loader2 className="animate-spin text-violet-400" size={14} />
        </div>
      );
    }
    return (
      <div 
        style={canvasDimensions}
        className="flex flex-col items-center justify-center bg-dark-700 border border-dark-600 rounded gap-2 text-gray-500 shadow-inner"
      >
        <Loader2 className="animate-spin text-primary" size={24} />
        <span className="text-xs">{t('common.loading')}</span>
      </div>
    );
  }

  if (error || !animData) {
    if (size === 'sm') {
      return (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-600 bg-dark-900/50 font-bold" title={t('monster_animator.no_sprite_kro')}>
          N/A
        </div>
      );
    }
    return (
      <div 
        style={canvasDimensions}
        className="flex flex-col items-center justify-center bg-dark-700 border border-dark-600 rounded text-center p-3 text-gray-500 shadow-inner gap-1"
      >
        <AlertCircle size={20} className="text-red-500 opacity-60" />
        <span className="text-xs font-semibold">{mobName}</span>
        <span className="text-[10px] text-gray-600">{t('monster_animator.no_sprite_kro')}</span>
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <canvas 
        ref={canvasRef}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        className="w-full h-full object-contain pixelated"
      />
    );
  }

  return (
    <div className="relative group bg-dark-800/50 border border-dark-600 rounded-lg p-2 flex items-center justify-center shadow-lg hover:border-primary/50 transition-all duration-300">
      <canvas 
        ref={canvasRef}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        className="pixelated"
      />
      <div className="absolute bottom-1 right-2 text-[9px] text-gray-500 bg-dark-900/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
        {t('monster_animator.frames_count', { count: animData.frames.length })}
      </div>
    </div>
  );
};

export default MonsterAnimator;

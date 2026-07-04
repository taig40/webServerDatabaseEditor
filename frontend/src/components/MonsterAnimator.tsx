import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_URL } from '../config/env';

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

interface Frame {
  patches: Patch[];
}

interface AnimationData {
  spritesheet: string;
  frame_duration: number;
  frames: Frame[];
}

interface MonsterAnimatorProps {
  mobId: number;
  mobName: string;
  size?: 'sm' | 'md' | 'lg';
}

const MonsterAnimator: React.FC<MonsterAnimatorProps> = ({ mobId, mobName, size = 'md' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [animData, setAnimData] = useState<AnimationData | null>(null);
  const [spritesheetImg, setSpritesheetImg] = useState<HTMLImageElement | null>(null);
  const currentFrameRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const canvasDimensions = {
    sm: { width: 120, height: 120 },
    md: { width: 220, height: 220 },
    lg: { width: 320, height: 320 },
  }[size];

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

    // Call local FastAPI backend
    fetch(`${API_URL}/api/mobs/${mobId}/animation`)
      .then(res => {
        if (!res.ok) throw new Error("Animação não encontrada");
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
          setError("Erro ao carregar spritesheet");
          setLoading(false);
        };
      })
      .catch(err => {
        if (!active) return;
        setError(err.message || "Erro desconhecido");
        setLoading(false);
      });

    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [mobId]);

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
          // Center anchor resting at 70% height
          ctx.translate(canvas.width / 2, canvas.height * 0.7);

          const scaleX = patch.mirror === 1 ? -patch.scale_x : patch.scale_x;
          const scaleY = patch.scale_y;
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
    return (
      <div 
        style={canvasDimensions}
        className="flex flex-col items-center justify-center bg-dark-700 border border-dark-600 rounded gap-2 text-gray-500 shadow-inner"
      >
        <Loader2 className="animate-spin text-primary" size={24} />
        <span className="text-xs">Carregando...</span>
      </div>
    );
  }

  if (error || !animData) {
    return (
      <div 
        style={canvasDimensions}
        className="flex flex-col items-center justify-center bg-dark-700 border border-dark-600 rounded text-center p-3 text-gray-500 shadow-inner gap-1"
      >
        <AlertCircle size={20} className="text-red-500 opacity-60" />
        <span className="text-xs font-semibold">{mobName}</span>
        <span className="text-[10px] text-gray-600">Sem sprite no kRO</span>
      </div>
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
        {animData.frames.length} frames
      </div>
    </div>
  );
};

export default MonsterAnimator;

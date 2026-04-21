import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { useStore } from '../store';

export default function VideoPlayerWidget({ id, url, fileName, x, y, width, scale, color, isSelected, onContextMenu }) {
   const [isPlaying, setIsPlaying] = useState(false);
   const [progress, setProgress] = useState(0);
   const [duration, setDuration] = useState(0);
   const [isMuted, setIsMuted] = useState(false);
   const [localWidth, setLocalWidth] = useState(width);
   
   const videoRef = useRef(null);
   const containerRef = useRef(null);
   const resizingRef = useRef(false);
   const resizeStartRef = useRef({ x: 0, startWidth: 0 });
   const { updateObject } = useStore();

   // ─── Playback ────────────────────────────────────────────────────
   const togglePlay = () => {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
   };

   const handleTimeUpdate = () => setProgress(videoRef.current.currentTime);
   const handleLoadedMetadata = () => setDuration(videoRef.current.duration);

   const formatTime = (time) => {
      if (!time || isNaN(time)) return '0:00';
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
   };

   // ─── Custom Resize Handle ─────────────────────────────────────────
   const onResizeMouseDown = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = true;
      resizeStartRef.current = { x: e.clientX, startWidth: localWidth };

      const onMouseMove = (ev) => {
         if (!resizingRef.current) return;
         const delta = (ev.clientX - resizeStartRef.current.x) / scale;
         const newWidth = Math.max(260, resizeStartRef.current.startWidth + delta);
         setLocalWidth(newWidth);
      };

      const onMouseUp = (ev) => {
         if (!resizingRef.current) return;
         resizingRef.current = false;
         const delta = (ev.clientX - resizeStartRef.current.x) / scale;
         const newWidth = Math.max(260, resizeStartRef.current.startWidth + delta);
         updateObject(id, { width: newWidth });
         window.removeEventListener('mousemove', onMouseMove);
         window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
   }, [id, localWidth, scale, updateObject]);

   useEffect(() => { setLocalWidth(width); }, [width]);

   return (
      <div
         style={{
            position: 'absolute',
            left: x,
            top: y,
            width: localWidth,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            pointerEvents: 'none',
            zIndex: 50,
         }}
      >
         <div
            ref={containerRef}
            className="flex flex-col rounded-3xl overflow-hidden group/player"
            onContextMenu={(e) => {
               e.preventDefault();
               e.stopPropagation();
               if (onContextMenu) onContextMenu(e.clientX, e.clientY);
            }}
            style={{
               backdropFilter: 'blur(30px)',
               WebkitBackdropFilter: 'blur(30px)',
               backgroundColor: isSelected
                  ? 'rgba(30, 30, 30, 0.75)'
                  : 'rgba(20, 20, 20, 0.65)',
               border: isSelected
                  ? `1px solid ${color}80`
                  : `1px solid ${color}30`,
               boxShadow: isSelected
                  ? `0 0 0 1px ${color}20, 0 0 25px 5px ${color}20, 0 15px 45px rgba(0,0,0,0.4)`
                  : '0 10px 30px rgba(0,0,0,0.3)',
               pointerEvents: 'none',
               position: 'relative',
               transition: 'box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease',
            }}
         >
            {/* Drag Handle (Top Bar) - Pointer events are NONE so it passes through to Konva Stage for dragging */}
            <div className="h-8 w-full flex items-center justify-center bg-white/5 border-b border-white/5 cursor-grab">
               <div className="w-12 h-1 rounded-full bg-white/20" />
            </div>

            {/* Video Element */}
            <div className="relative aspect-video bg-black w-full" style={{ pointerEvents: 'auto' }}>
               <video
                  ref={videoRef}
                  src={url}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  muted={isMuted}
                  onClick={togglePlay}
               />
               
               {/* Centered Play Button Overlay on hover/pause */}
               {(!isPlaying || isSelected) && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity cursor-pointer"
                    onClick={togglePlay}
                  >
                     <div className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
                        {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
                     </div>
                  </div>
               )}
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col gap-2 p-4 bg-black/40 backdrop-blur-md">
                {/* File name */}
                {fileName && (
                   <div className="truncate font-medium text-[11px] mb-1 opacity-70" style={{ color }}>
                      📹 {fileName.replace(/\.[^.]+$/, '')}
                   </div>
                )}

                <div className="flex items-center gap-3">
                   <button
                      onClick={togglePlay}
                      style={{ color, pointerEvents: 'auto' }}
                      className="hover:scale-110 transition-transform cursor-pointer"
                   >
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                   </button>

                   {/* Seek bar */}
                   <div className="flex-grow flex flex-col gap-1">
                      <div
                         className="w-full h-1.5 rounded-full bg-white/10 cursor-pointer overflow-hidden relative"
                         style={{ pointerEvents: 'auto' }}
                         onClick={(e) => {
                            if (!videoRef.current || duration === 0) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                         }}
                      >
                         <div
                            className="h-full rounded-full transition-[width] duration-100"
                            style={{
                               width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                               backgroundColor: color,
                            }}
                         />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono opacity-50" style={{ color }}>
                         <span>{formatTime(progress)}</span>
                         <span>{formatTime(duration)}</span>
                      </div>
                   </div>

                   {/* Volume */}
                   <button
                      onClick={() => setIsMuted(!isMuted)}
                      style={{ color, pointerEvents: 'auto' }}
                      className="opacity-70 hover:opacity-100 transition-all cursor-pointer"
                   >
                      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                   </button>

                   <button 
                     onClick={() => videoRef.current.requestFullscreen()}
                     style={{ color, pointerEvents: 'auto' }}
                     className="opacity-70 hover:opacity-100 transition-all cursor-pointer"
                   >
                      <Maximize size={16} />
                   </button>
                </div>
            </div>

            {/* Resize Handle */}
            <div
               onMouseDown={onResizeMouseDown}
               style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 20,
                  height: 20,
                  cursor: 'nwse-resize',
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'end',
                  justifyContent: 'end',
                  padding: 4
               }}
            >
               <svg width="10" height="10" viewBox="0 0 10 10" fill={color} className="opacity-40">
                  <path d="M10 0 L10 10 L0 10 Z" />
               </svg>
            </div>
         </div>
      </div>
   );
}

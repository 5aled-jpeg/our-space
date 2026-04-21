import React, { useState, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';

export default function AudioPlayerWidget({ id, url, fileName, x, y, width, scale, color, isSelected, onContextMenu }) {
   const [isPlaying, setIsPlaying] = useState(false);
   const [progress, setProgress] = useState(0);
   const [duration, setDuration] = useState(0);
   const [isMuted, setIsMuted] = useState(false);
   const [localWidth, setLocalWidth] = useState(width);
   const audioRef = useRef(null);
   const containerRef = useRef(null);
   const resizingRef = useRef(false);
   const resizeStartRef = useRef({ x: 0, startWidth: 0 });
   const { updateObject } = useStore();

   // ─── Playback ────────────────────────────────────────────────────
   const togglePlay = () => {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
   };
   const handleTimeUpdate = () => setProgress(audioRef.current.currentTime);
   const handleLoadedMetadata = () => setDuration(audioRef.current.duration);
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
         const newWidth = Math.max(200, resizeStartRef.current.startWidth + delta);
         setLocalWidth(newWidth);
      };

      const onMouseUp = (ev) => {
         if (!resizingRef.current) return;
         resizingRef.current = false;
         const delta = (ev.clientX - resizeStartRef.current.x) / scale;
         const newWidth = Math.max(200, resizeStartRef.current.startWidth + delta);
         updateObject(id, { width: newWidth });
         window.removeEventListener('mousemove', onMouseMove);
         window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
   }, [id, localWidth, scale, updateObject]);

   // Sync local width when store width changes (e.g. from undo or load)
   React.useEffect(() => { setLocalWidth(width); }, [width]);

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
            className="flex flex-col rounded-2xl"
            onContextMenu={(e) => {
               e.preventDefault();
               e.stopPropagation();
               if (onContextMenu) onContextMenu(e.clientX, e.clientY);
            }}
            style={{
               backdropFilter: 'blur(30px)',
               WebkitBackdropFilter: 'blur(30px)',
               backgroundColor: isSelected
                  ? 'rgba(30, 30, 30, 0.65)'
                  : 'rgba(20, 20, 20, 0.55)',
               border: isSelected
                  ? `1px solid ${color}60`
                  : `1px solid ${color}30`,
               boxShadow: isSelected
                  ? `0 0 0 1px ${color}20, 0 0 18px 4px ${color}18, 0 8px 32px rgba(0,0,0,0.3)`
                  : '0 4px 16px rgba(0,0,0,0.2)',
               padding: '14px 16px',
               pointerEvents: 'none',
               position: 'relative',
               transition: 'box-shadow 0.25s ease, border-color 0.25s ease, background-color 0.25s ease',
            }}
         >
            <audio
               ref={audioRef}
               src={url}
               onTimeUpdate={handleTimeUpdate}
               onLoadedMetadata={handleLoadedMetadata}
               onEnded={() => setIsPlaying(false)}
               muted={isMuted}
            />

            {/* Song Name */}
            {fileName && (
               <div
                  className="mb-3 w-full truncate font-semibold"
                  style={{ color, fontSize: 13, opacity: 0.9, pointerEvents: 'none' }}
               >
                  🎵 {fileName.replace(/\.[^.]+$/, '')}
               </div>
            )}

            {/* Controls Row */}
            <div className="flex items-center gap-3">
               {/* Play / Pause */}
               <button
                  onClick={togglePlay}
                  style={{ color, pointerEvents: 'auto', flexShrink: 0 }}
                  className="hover:scale-110 transition-transform cursor-pointer"
               >
                  {isPlaying
                     ? <Pause size={22} fill="currentColor" />
                     : <Play  size={22} fill="currentColor" />}
               </button>

               {/* Seek bar + times */}
               <div className="flex flex-col flex-grow" style={{ minWidth: 0 }}>
                  <div
                     className="w-full rounded-full overflow-hidden cursor-pointer"
                     style={{ height: 6, backgroundColor: `${color}25`, pointerEvents: 'auto' }}
                     onClick={(e) => {
                        if (!audioRef.current || duration === 0) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                     }}
                  >
                     <div
                        className="h-full rounded-full"
                        style={{
                           width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                           backgroundColor: color,
                           transition: 'width 0.1s linear',
                        }}
                     />
                  </div>
                  <div
                     className="flex justify-between mt-1 font-mono"
                     style={{ color, fontSize: 10, opacity: 0.55, pointerEvents: 'none' }}
                  >
                     <span>{formatTime(progress)}</span>
                     <span>{formatTime(duration)}</span>
                  </div>
               </div>

               {/* Mute */}
               <button
                  onClick={() => setIsMuted(!isMuted)}
                  style={{ color, pointerEvents: 'auto', flexShrink: 0 }}
                  className="opacity-70 hover:opacity-100 hover:scale-110 transition-transform cursor-pointer"
               >
                  {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
               </button>
            </div>

            {/* ─── Custom Resize Handle (bottom-right corner) ─── */}
            <div
               onMouseDown={onResizeMouseDown}
               title="Drag to resize"
               style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 6,
                  width: 14,
                  height: 14,
                  cursor: 'ew-resize',
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.4,
               }}
            >
               {/* Three small dots (resize icon) */}
               <svg width="10" height="10" viewBox="0 0 10 10" fill={color}>
                  <circle cx="2" cy="8" r="1.2" />
                  <circle cx="5.5" cy="8" r="1.2" />
                  <circle cx="9" cy="8" r="1.2" />
               </svg>
            </div>
         </div>
      </div>
   );
}

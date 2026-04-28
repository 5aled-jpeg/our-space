import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Maximize, Trash2 } from 'lucide-react';
import { useStore } from '../store';

export default function GifPlayerWidget({ id, url, fileName, x, y, width, height, scale, color, isSelected, onContextMenu }) {
   const [isPlaying, setIsPlaying] = useState(true);
   const [localWidth, setLocalWidth] = useState(width);
   const [localHeight, setLocalHeight] = useState(height);
   
   const containerRef = useRef(null);
   const resizingRef = useRef(false);
   const resizeStartRef = useRef({ x: 0, y: 0, startWidth: 0, startHeight: 0 });
   const { updateObject, deleteItems, saveHistory } = useStore();

   const aspectRatio = width / height;

   const onResizeMouseDown = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      saveHistory();
      resizingRef.current = true;
      resizeStartRef.current = { 
         x: e.clientX, 
         y: e.clientY,
         startWidth: localWidth,
         startHeight: localHeight 
      };

      const onMouseMove = (ev) => {
         if (!resizingRef.current) return;
         const deltaX = (ev.clientX - resizeStartRef.current.x) / scale;
         const newWidth = Math.max(100, resizeStartRef.current.startWidth + deltaX);
         const newHeight = newWidth / aspectRatio;
         setLocalWidth(newWidth);
         setLocalHeight(newHeight);
      };

      const onMouseUp = () => {
         if (!resizingRef.current) return;
         resizingRef.current = false;
         updateObject(id, { width: localWidth, height: localHeight });
         window.removeEventListener('mousemove', onMouseMove);
         window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
   }, [id, localWidth, localHeight, scale, updateObject, aspectRatio, saveHistory]);

   useEffect(() => { 
      setLocalWidth(width); 
      setLocalHeight(height);
   }, [width, height]);

   return (
      <div
         style={{
            position: 'absolute',
            left: x,
            top: y,
            width: localWidth,
            height: localHeight,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            pointerEvents: 'none',
            zIndex: 50,
         }}
      >
         <div
            ref={containerRef}
            className="flex flex-col rounded-2xl overflow-hidden group/gif h-full"
            onContextMenu={(e) => {
               e.preventDefault();
               e.stopPropagation();
               if (onContextMenu) onContextMenu(e.clientX, e.clientY);
            }}
            style={{
               backdropFilter: 'blur(20px)',
               backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.2)',
               border: isSelected ? `2px solid ${color}` : `1px solid rgba(255,255,255,0.1)`,
               boxShadow: isSelected ? `0 0 30px ${color}40` : '0 10px 30px rgba(0,0,0,0.3)',
               pointerEvents: 'none',
               transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
            }}
         >
            {/* Drag Handle */}
            <div className="h-6 w-full flex items-center justify-between px-3 bg-black/20 cursor-grab">
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-white/50">GIF Player</span>
               </div>
               {isSelected && (
                  <button 
                     className="p-1 hover:text-red-400 text-white/30 transition-colors pointer-events-auto"
                     onClick={() => deleteItems([id])}
                  >
                     <Trash2 size={10} />
                  </button>
               )}
            </div>

            <div className="relative flex-grow bg-black/40 overflow-hidden">
               <img 
                  src={url} 
                  alt={fileName}
                  className={`w-full h-full object-contain transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-50'}`}
                  style={{ pointerEvents: 'auto' }}
               />
               
               {/* GIF Badge */}
               <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/20">
                  <span className="text-[9px] font-black text-white italic tracking-tighter">GIF</span>
               </div>

               {/* Overlay Controls */}
               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/gif:opacity-100 transition-opacity">
                  <button 
                     onClick={() => setIsPlaying(!isPlaying)}
                     className="p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 text-white hover:scale-110 transition-all pointer-events-auto"
                  >
                     {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
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
                  zIndex: 60
               }}
            >
               <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-white/40" />
            </div>
         </div>
      </div>
   );
}

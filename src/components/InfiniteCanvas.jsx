import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Line, Text, Rect, Transformer, Image } from 'react-konva';
import { Html } from 'react-konva-utils';
import { useStore } from '../store';
import AudioPlayerWidget from './AudioPlayerWidget';
import VideoPlayerWidget from './VideoPlayerWidget';
import GifPlayerWidget from './GifPlayerWidget';

const KonvaImage = ({ url, ...props }) => {
   const [img, setImg] = useState(null);
   useEffect(() => {
      const image = new window.Image();
      image.src = url;
      image.onload = () => setImg(image);
   }, [url]);
   return img ? <Image image={img} {...props} /> : null;
};

const stripMarkdown = (text) => {
   if (!text) return '';
   return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\|\|(.*?)\|\|/g, '$1')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/^> (.*$)/gm, '$1');
};

const renderMarkdown = (text, color, textId, revealedSet) => {
   if (!text) return '';
   // 1. Sanitize input to prevent XSS but allow our own tags later
   let res = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
   
   // 2. Formatting
   res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
   res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
   res = res.replace(/__(.*?)__/g, '<u style="text-decoration-color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px;">$1</u>');
   
   // 3. Spoilers (Persistent Reveal Logic)
   res = res.replace(/\|\|(.*?)\|\|/g, (match, p1) => {
      const isRevealed = revealedSet?.has(textId + '-' + p1);
      const safeContent = p1.replace(/'/g, "\\'");
      return '<span class="spoiler-wrapper ' + (isRevealed ? 'revealed' : 'hidden') + '" ' +
             'onclick="this.classList.remove(\'hidden\'); this.classList.add(\'revealed\'); window.onRevealSpoiler && window.onRevealSpoiler(\'' + textId + '\', \'' + safeContent + '\')" ' +
             'oncontextmenu="event.preventDefault(); event.stopPropagation(); window.onTextContextMenu && window.onTextContextMenu(\'' + textId + '\', event.clientX, event.clientY, 20)">' +
             '<span class="spoiler-text">' + p1 + '</span>' +
             '</span>';
   });
   
   // 4. Links & Quotes
   res = res.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" oncontextmenu="event.preventDefault(); event.stopPropagation(); window.onTextContextMenu && window.onTextContextMenu(\''+textId+'\', event.clientX, event.clientY, 20)" style="color: #3b82f6; text-decoration: underline; pointer-events: auto;">$1</a>');
   res = res.replace(/^&gt; (.*$)/gm, '<div style="border-left: 3px solid ' + color + '; padding-left: 8px; margin-left: 2px; opacity: 0.8">$1</div>');
   res = res.replace(/\n/g, '<br/>');
   
   return res;
};

export default function InfiniteCanvas() {
   const {
      lines, addLine, updateLastLine, updateLine,
      texts, addText, updateText,
      objects, addObject, updateObject,
      deleteItems,
      undo, redo, saveHistory,
      tool, color, brushSize, eraserSize,
      fontSize, fontFamily,
      position, updatePosition, scale, updateScale,
      broadcast, remoteCursors, socket, roomId
   } = useStore();

   const stageRef = useRef(null);
   const trRef = useRef(null);
   const textAreaRef = useRef(null);
   const audioRafRef = useRef(null); // throttle audio drag updates

   const [isDrawing, setIsDrawing] = useState(false);
   const [editingText, setEditingText] = useState(null);
   const [dragStart, setDragStart] = useState(null);
   const [tempRect, setTempRect] = useState(null);
   const [selectedIds, setSelectedIds] = useState([]);
   const [selectionBox, setSelectionBox] = useState(null);
   const dragPosRef = useRef(null);
   // Context menus
   const [textContextMenu, setTextContextMenu] = useState(null); // { id, x, y, fontSize }
   const [audioContextMenu, setAudioContextMenu] = useState(null); // { id, x, y, color }
   const [richTextContextMenu, setRichTextContextMenu] = useState(null); // { x, y, start, end }
   const [revealedSpoilers, setRevealedSpoilers] = useState(new Set()); // Set of textId-spoilerContent

   const revealSpoiler = (textId, content) => {
      setRevealedSpoilers(prev => {
         const next = new Set(prev);
         next.add(`${textId}-${content}`);
         return next;
      });
   };

   // Auto-grow textarea height
   useEffect(() => {
      if (editingText && textAreaRef.current) {
         textAreaRef.current.style.height = 'auto';
         // Using a small buffer and scrollHeight ensures we hug the text precisely
         textAreaRef.current.style.height = (textAreaRef.current.scrollHeight) + 'px';
      }
   }, [editingText?.value, editingText?.width, scale]);

   // Sync Transformer nodes
   useEffect(() => {
      if (selectedIds.length > 0 && trRef.current) {
         const nodes = selectedIds.map(id => stageRef.current.findOne('#' + id)).filter(Boolean);
         if (nodes.length > 0) {
            trRef.current.nodes(nodes);
            trRef.current.getLayer().batchDraw();
         } else {
            trRef.current.nodes([]);
         }
      } else if (trRef.current) {
         trRef.current.nodes([]);
      }
   }, [selectedIds, texts, lines, tool]);

   // Delete selected items on Delete / Backspace
   useEffect(() => {
      const handleKeyDown = (e) => {
         // Undo: Ctrl+Z
         if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
         }
         // Redo: Ctrl+Y or Ctrl+Shift+Z
         if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
            return;
         }
         // Delete selected
         if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && !editingText) {
            e.preventDefault();
            deleteItems(selectedIds);
            setSelectedIds([]);
         }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
   }, [selectedIds, editingText, deleteItems, undo, redo]);

   useEffect(() => {
      window.onRevealSpoiler = (id, content) => revealSpoiler(id, content);
      window.onTextContextMenu = (id, x, y, fontSize) => {
         setTextContextMenu({ id, x, y, fontSize });
         setAudioContextMenu(null);
      };
      return () => { 
         delete window.onRevealSpoiler; 
         delete window.onTextContextMenu;
      };
   }, []);

   // 1. Zoom Logic
   const handleWheel = (e) => {
      e.evt.preventDefault();
      const scaleBy = 1.1;
      const stage = stageRef.current;
      const oldScale = stage.scaleX();

      const mousePointTo = {
         x: (stage.getPointerPosition().x - stage.x()) / oldScale,
         y: (stage.getPointerPosition().y - stage.y()) / oldScale,
      };

      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

      updateScale(newScale);
      updatePosition({
         x: stage.getPointerPosition().x - mousePointTo.x * newScale,
         y: stage.getPointerPosition().y - mousePointTo.y * newScale,
      });
   };

   // 2. Interaction Logic
   const handleMouseDown = (e) => {
      // Ignore click actions for Hand Tool (panning only)
      if (tool === 'hand') {
         setSelectedIds([]);
         return;
      }

      // Selection Logic for Select Tool
      if (tool === 'select') {
         if (editingText) {
            handleTextSubmit();
         }
         const pos = stageRef.current.getPointerPosition();
         const stageX = (pos.x - position.x) / scale;
         const stageY = (pos.y - position.y) / scale;
         const clickedNode = e.target;

         // 1. If clicking the stage background -> Begin Marquee
         if (clickedNode === stageRef.current) {
            setSelectedIds([]);
            setSelectionBox({
               x: stageX,
               y: stageY,
               w: 0,
               h: 0,
               startX: stageX,
               startY: stageY,
               visible: true
            });
            return;
         }

         // 2. If clicking anything belonging to a Transformer -> DONT DESELECT
         const parent = clickedNode.getParent();
         if (parent && parent.className === 'Transformer') {
            return;
         }

         // 3. Otherwise, check if it's a selectable object
         if (clickedNode.name() === 'object') {
            const id = clickedNode.id();
            if (!e.evt.shiftKey && !selectedIds.includes(id)) {
               setSelectedIds([id]);
            } else if (e.evt.shiftKey) {
               if (selectedIds.includes(id)) {
                  setSelectedIds(selectedIds.filter(v => v !== id));
               } else {
                  setSelectedIds([...selectedIds, id]);
               }
            }
         } else {
            setSelectedIds([]);
         }
         return;
      }

      const pos = stageRef.current.getPointerPosition();
      const stageX = (pos.x - position.x) / scale;
      const stageY = (pos.y - position.y) / scale;

      // Handle Text Tool
      if (tool === 'text') {
         if (editingText) {
            handleTextSubmit();
            return;
         }

         // Clicked on existing text?
         if (e.target && e.target.className === 'Text') {
            const originalText = texts.find(txt => txt.id === t.id)?.text || t.text;
            setEditingText({
               id: t.id,
               x: (t.x * scale) + position.x,
               y: (t.y * scale) + position.y,
               stageX: t.x,
               stageY: t.y,
               value: originalText,
               width: t.width,
               isNew: false
            });
            return;
         }

         setDragStart({
            stageX,
            stageY,
            screenX: e.evt.clientX || e.evt.pageX,
            screenY: e.evt.clientY || e.evt.pageY
         });
         return;
      }

      setIsDrawing(true);
      addLine({
         id: Date.now().toString(),
         tool,
         color,
         points: [stageX, stageY],
         width: tool === 'eraser' ? eraserSize : brushSize,
         x: 0,
         y: 0,
         scaleX: 1,
         scaleY: 1
      });
   };

   const handleMouseMove = (e) => {
      const pos = stageRef.current.getPointerPosition();
      const stageX = (pos.x - position.x) / scale;
      const stageY = (pos.y - position.y) / scale;
      if (socket && roomId) broadcast('CURSOR_MOVE', { pos: { x: stageX, y: stageY } });

      if (selectionBox && selectionBox.visible) {
         setSelectionBox({
            ...selectionBox,
            x: Math.min(selectionBox.startX, stageX),
            y: Math.min(selectionBox.startY, stageY),
            w: Math.abs(stageX - selectionBox.startX),
            h: Math.abs(stageY - selectionBox.startY)
         });
         return;
      }

      if (dragStart && tool === 'text') {
         setTempRect({
            x: Math.min(dragStart.stageX, stageX),
            y: Math.min(dragStart.stageY, stageY),
            w: Math.abs(dragStart.stageX - stageX),
            h: Math.abs(dragStart.stageY - stageY)
         });
         return;
      }

      if (!isDrawing) return;

      const lastLine = lines[lines.length - 1];
      const newPoints = lastLine.points.concat([stageX, stageY]);
      updateLastLine({ ...lastLine, points: newPoints });

      // Vector Eraser: Delete objects intersected by the eraser path
      if (tool === 'eraser') {
         const stage = stageRef.current;
         const intersections = stage.getAllIntersections(pos);
         const targetsToDelete = intersections
            .filter(node => node.name() === 'object' && node.id() && node.id() !== lastLine.id)
            .map(node => node.id());

         if (targetsToDelete.length > 0) {
            deleteItems(targetsToDelete);
         }
      }
   };

   const handleMouseUp = () => {
      if (selectionBox && selectionBox.visible) {
         // calculate collisions
         const boxRect = {
            x: selectionBox.x,
            y: selectionBox.y,
            width: selectionBox.w,
            height: selectionBox.h
         };
         const shapes = stageRef.current.find('.object');
         const box = stageRef.current.findOne('.selectionBoxNode');
         
         if (box) {
            const sels = shapes.filter((shape) => {
               // Ignore selection box itself
               if (shape === box) return false;
               return Konva.Util.haveIntersection(box.getClientRect(), shape.getClientRect());
            });
            setSelectedIds(sels.map(s => s.id()));
         }
         
         setSelectionBox(null);
         return;
      }

      if (dragStart && tool === 'text') {
         const width = tempRect ? tempRect.w : 200;

         setEditingText({
            id: Date.now().toString(),
            x: dragStart.screenX,
            y: dragStart.screenY,
            stageX: tempRect ? tempRect.x : dragStart.stageX,
            stageY: tempRect ? tempRect.y : dragStart.stageY,
            value: '',
            width: Math.max(width, 100),
            isNew: true
         });

         setDragStart(null);
         setTempRect(null);
         return;
      }

      setIsDrawing(false);
   };

   // 3. Text Submission
   const handleTextSubmit = (e) => {
      if (editingText) {
         if (editingText.value.trim() !== '') {
            if (editingText.isNew) {
               addText({
                  id: editingText.id,
                  x: editingText.stageX,
                  y: editingText.stageY,
                  text: editingText.value,
                  fontSize: fontSize,
                  fontFamily: fontFamily,
                  fill: color,
                  width: editingText.width
               });
            } else {
               updateText(editingText.id, {
                  text: editingText.value,
                  fill: color,
                  fontSize,
                  fontFamily
               });
            }
         }
         setEditingText(null);
      }
   };

   // Handle Window Resize
   const [dimensions, setDimensions] = useState({
      width: window.innerWidth,
      height: window.innerHeight
   });

   useEffect(() => {
      const handleResize = () => setDimensions({
         width: window.innerWidth,
         height: window.innerHeight
      });
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
   }, []);

   return (
      <div className={`absolute inset-0 w-full h-full overflow-hidden ${
         tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 
         tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
      }`}>
         <Stage
            width={dimensions.width}
            height={dimensions.height}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            ref={stageRef}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={tool === 'hand'}
            onDragMove={(e) => {
               if (e.target === stageRef.current) {
                  // Update position in real-time so DOM overlays (audio) follow the canvas smoothly
                  updatePosition({ x: e.target.x(), y: e.target.y() });
               }
            }}
            onDragEnd={(e) => {
               if (e.target === stageRef.current) {
                  updatePosition({ x: e.target.x(), y: e.target.y() });
               }
            }}
         >
            <Layer>
               {/* Render Lines */}
               {lines.map((line, i) => (
                  <Line
                     key={line.id || i}
                     id={line.id || `line-${i}`}
                     name={line.tool === 'eraser' ? 'eraser' : 'object'}
                     x={line.x || 0}
                     y={line.y || 0}
                     scaleX={line.scaleX || 1}
                     scaleY={line.scaleY || 1}
                     points={line.points}
                     stroke={line.color}
                     strokeWidth={line.width}
                     tension={0.5}
                     lineCap="round"
                     lineJoin="round"
                     hitStrokeWidth={Math.max(20, line.width * 2)}
                     globalCompositeOperation={
                        line.tool === 'eraser' ? 'destination-out' : 'source-over'
                     }
                     draggable={tool === 'select' && line.tool !== 'eraser'}
                     listening={line.tool !== 'eraser'}
                     onDragStart={(e) => {
                        if (tool !== 'select') e.cancelBubble = true;
                        saveHistory();
                        
                        const currentId = line.id || `line-${i}`;
                        dragPosRef.current = { 
                           startX: e.target.x(), 
                           startY: e.target.y(),
                           nodesStart: {} 
                        };
                        
                        if (selectedIds.includes(currentId) && selectedIds.length > 1) {
                           selectedIds.forEach(id => {
                              const n = stageRef.current.findOne('#' + id);
                              if (n) dragPosRef.current.nodesStart[id] = { x: n.x(), y: n.y() };
                           });
                        }
                     }}
                     onDragMove={(e) => {
                        const currentId = line.id || `line-${i}`;
                        if (selectedIds.includes(currentId) && selectedIds.length > 1) {
                           const dx = e.target.x() - dragPosRef.current.startX;
                           const dy = e.target.y() - dragPosRef.current.startY;
                           
                           selectedIds.forEach(id => {
                              if (id !== currentId) {
                                 const node = stageRef.current.findOne('#' + id);
                                 const startPos = dragPosRef.current.nodesStart[id];
                                 if (node && startPos) {
                                    node.x(startPos.x + dx);
                                    node.y(startPos.y + dy);
                                 }
                              }
                           });
                           stageRef.current.batchDraw();
                        }
                     }}
                     onDragEnd={(e) => {
                        if (selectedIds.includes(line.id) && selectedIds.length > 1) {
                           selectedIds.forEach(id => {
                              const node = stageRef.current.findOne('#' + id);
                              if (node) {
                                 if (node.className === 'Text') updateText(id, { x: node.x(), y: node.y() });
                                 else if (node.className === 'Line') updateLine(id, { x: node.x(), y: node.y() });
                                 else if (node.className === 'Rect') updateObject(id, { x: node.x(), y: node.y() });
                              }
                           });
                        } else {
                           updateLine(line.id, { x: e.target.x(), y: e.target.y() });
                        }
                     }}
                     onTransformStart={() => saveHistory()}
                     onTransformEnd={(e) => {
                        const node = e.target;
                        updateLine(line.id, {
                           x: node.x(),
                           y: node.y(),
                           scaleX: node.scaleX(),
                           scaleY: node.scaleY()
                        });
                     }}
                  />
               ))}

               {/* Render Texts */}
               {texts.map((t) => (
                  <React.Fragment key={t.id}>
                  {editingText?.id !== t.id && (
                     <Html
                        groupProps={{ x: t.x, y: t.y }}
                        divProps={{ style: { pointerEvents: 'none' } }}
                     >
                        <div
                           style={{
                              width: t.width,
                              fontSize: t.fontSize,
                              fontFamily: t.fontFamily,
                              color: t.fill,
                              lineHeight: 1.2,
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                           }}
                           dangerouslySetInnerHTML={{ __html: renderMarkdown(t.text, t.fill, t.id, revealedSpoilers) }}
                        />
                     </Html>
                  )}
                  <Text
                     id={t.id}
                     name="object"
                     x={t.x}
                     y={t.y}
                     visible={editingText?.id !== t.id}
                     text={stripMarkdown(t.text)}
                     fontSize={t.fontSize}
                     fontFamily={t.fontFamily}
                     fill="transparent"
                     width={t.width}
                     wrap="word"
                     draggable={tool === 'select' && editingText?.id !== t.id}
                     listening={true}
                     stroke={(selectedIds.includes(t.id) && tool === 'select') ? '#3b82f6' : 'transparent'}
                     strokeWidth={1 / scale}
                     onDragStart={(e) => {
                        if (tool !== 'select') e.cancelBubble = true;
                        saveHistory();
                        
                        dragPosRef.current = { 
                           startX: e.target.x(), 
                           startY: e.target.y(),
                           nodesStart: {} 
                        };
                        
                        if (selectedIds.includes(t.id) && selectedIds.length > 1) {
                           selectedIds.forEach(id => {
                              const n = stageRef.current.findOne('#' + id);
                              if (n) dragPosRef.current.nodesStart[id] = { x: n.x(), y: n.y() };
                           });
                        }
                     }}
                     onDragMove={(e) => {
                        if (selectedIds.includes(t.id) && selectedIds.length > 1) {
                           const dx = e.target.x() - dragPosRef.current.startX;
                           const dy = e.target.y() - dragPosRef.current.startY;
                           
                           selectedIds.forEach(id => {
                              if (id !== t.id) {
                                 const node = stageRef.current.findOne('#' + id);
                                 const startPos = dragPosRef.current.nodesStart[id];
                                 if (node && startPos) {
                                    node.x(startPos.x + dx);
                                    node.y(startPos.y + dy);
                                 }
                              }
                           });
                           stageRef.current.batchDraw();
                        }
                     }}
                     onDragEnd={(e) => {
                        if (selectedIds.includes(t.id) && selectedIds.length > 1) {
                           selectedIds.forEach(id => {
                              const node = stageRef.current.findOne('#' + id);
                              if (node) {
                                 if (node.className === 'Text') updateText(id, { x: node.x(), y: node.y() });
                                 else if (node.className === 'Line') updateLine(id, { x: node.x(), y: node.y() });
                                 else if (node.className === 'Rect') updateObject(id, { x: node.x(), y: node.y() });
                              }
                           });
                        } else {
                           updateText(t.id, { x: e.target.x(), y: e.target.y() });
                        }
                     }}
                     onDblClick={(e) => {
                        const node = e.target;
                        const attrs = node.attrs;
                        const raw = texts.find(txt => txt.id === attrs.id)?.text || attrs.text;
                        setEditingText({
                           id: attrs.id,
                           x: (attrs.x * scale) + position.x,
                           y: (attrs.y * scale) + position.y,
                           stageX: attrs.x,
                           stageY: attrs.y,
                           value: raw,
                           width: attrs.width,
                           fontSize: attrs.fontSize,
                           isNew: false
                        });
                     }}
                     onContextMenu={(e) => {
                        e.evt.preventDefault();
                        const pos = stageRef.current.getPointerPosition();
                        setTextContextMenu({ id: t.id, x: pos.x, y: pos.y, fontSize: t.fontSize });
                        setAudioContextMenu(null);
                     }}
                     onTransformStart={() => saveHistory()}
                     onTransform={(e) => {
                        const node = e.target;
                        const newWidth = Math.max(5, node.width() * node.scaleX());
                        node.setAttrs({
                           width: newWidth,
                           scaleX: 1,
                           scaleY: 1
                        });
                     }}
                     onTransformEnd={(e) => {
                        const node = e.target;
                        updateText(t.id, {
                           x: node.x(),
                           y: node.y(),
                           width: node.width(),
                        });
                     }}
                  />
                  </React.Fragment>
               ))}

                {/* Render Static Objects (Images) */}
                {objects.filter(obj => obj.type === 'image').map((obj) => (
                   <KonvaImage
                      key={obj.id}
                      id={obj.id}
                      url={obj.url}
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      scaleX={obj.scaleX || 1}
                      scaleY={obj.scaleY || 1}
                      name="object"
                      draggable={tool === 'select'}
                      stroke={(selectedIds.includes(obj.id) && tool === 'select') ? '#3b82f6' : 'transparent'}
                      strokeWidth={2 / scale}
                      onDragStart={(e) => {
                         if (tool !== 'select') e.cancelBubble = true;
                         saveHistory();
                         
                         dragPosRef.current = { 
                            startX: e.target.x(), 
                            startY: e.target.y(),
                            nodesStart: {} 
                         };
                         
                         if (selectedIds.includes(obj.id) && selectedIds.length > 1) {
                            selectedIds.forEach(id => {
                               const n = stageRef.current.findOne('#' + id);
                               if (n) dragPosRef.current.nodesStart[id] = { x: n.x(), y: n.y() };
                            });
                         }
                      }}
                      onDragMove={(e) => {
                         if (selectedIds.includes(obj.id) && selectedIds.length > 1) {
                            const dx = e.target.x() - dragPosRef.current.startX;
                            const dy = e.target.y() - dragPosRef.current.startY;
                            
                            selectedIds.forEach(id => {
                               if (id !== obj.id) {
                                  const node = stageRef.current.findOne('#' + id);
                                  const startPos = dragPosRef.current.nodesStart[id];
                                  if (node && startPos) {
                                     node.x(startPos.x + dx);
                                     node.y(startPos.y + dy);
                                  }
                               }
                            });
                            stageRef.current.batchDraw();
                         }
                      }}
                      onDragEnd={(e) => {
                         updateObject(obj.id, { x: e.target.x(), y: e.target.y() });
                      }}
                      onTransformStart={() => saveHistory()}
                      onTransformEnd={(e) => {
                         const node = e.target;
                         updateObject(obj.id, {
                            x: node.x(),
                            y: node.y(),
                            scaleX: node.scaleX(),
                            scaleY: node.scaleY()
                         });
                      }}
                   />
                ))}

                {/* Render Interactive Object Hitboxes (Video, Audio, GIF) */}
                {objects.filter(obj => !['image'].includes(obj.type)).map((obj) => (
                   <Rect
                      key={obj.id}
                      id={obj.id}
                      name="object"
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      scaleX={obj.scaleX || 1}
                      scaleY={obj.scaleY || 1}
                      fill="transparent"
                      stroke={['audio', 'video', 'gif'].includes(obj.type) ? 'transparent' : ((selectedIds.includes(obj.id) && tool === 'select') ? '#3b82f6' : 'transparent')}
                      strokeWidth={1 / scale}
                      draggable={tool === 'select'}
                      listening={true}
                      onDragStart={(e) => {
                         if (tool !== 'select') e.cancelBubble = true;
                         saveHistory();
                         
                         dragPosRef.current = { 
                            startX: e.target.x(), 
                            startY: e.target.y(),
                            nodesStart: {} 
                         };
                         
                         if (selectedIds.includes(obj.id) && selectedIds.length > 1) {
                            selectedIds.forEach(id => {
                               const n = stageRef.current.findOne('#' + id);
                               if (n) dragPosRef.current.nodesStart[id] = { x: n.x(), y: n.y() };
                            });
                         }
                      }}
                      onDragMove={(e) => {
                         if (['audio', 'video', 'gif'].includes(obj.type)) {
                            const nx = e.target.x();
                            const ny = e.target.y();
                            if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
                            audioRafRef.current = requestAnimationFrame(() => {
                               updateObject(obj.id, { x: nx, y: ny });
                            });
                         }
                         if (selectedIds.includes(obj.id) && selectedIds.length > 1) {
                            const dx = e.target.x() - dragPosRef.current.startX;
                            const dy = e.target.y() - dragPosRef.current.startY;
                            
                            selectedIds.forEach(id => {
                               if (id !== obj.id) {
                                  const node = stageRef.current.findOne('#' + id);
                                  const startPos = dragPosRef.current.nodesStart[id];
                                  if (node && startPos) {
                                     node.x(startPos.x + dx);
                                     node.y(startPos.y + dy);
                                  }
                               }
                            });
                            stageRef.current.batchDraw();
                         }
                      }}
                      onDragEnd={(e) => {
                         if (selectedIds.includes(obj.id) && selectedIds.length > 1) {
                            selectedIds.forEach(id => {
                               const node = stageRef.current.findOne('#' + id);
                               if (node) {
                                  if (node.className === 'Text') updateText(id, { x: node.x(), y: node.y() });
                                  else if (node.className === 'Line') updateLine(id, { x: node.x(), y: node.y() });
                                  else if (node.className === 'Rect' || node.className === 'Image') updateObject(id, { x: node.x(), y: node.y() });
                               }
                            });
                         } else {
                            updateObject(obj.id, { x: e.target.x(), y: e.target.y() });
                         }
                      }}
                      onTransformStart={() => saveHistory()}
                      onTransformEnd={(e) => {
                         const node = e.target;
                         updateObject(obj.id, {
                            x: node.x(),
                            y: node.y(),
                            scaleX: node.scaleX(),
                            scaleY: node.scaleY()
                         });
                      }}
                   />
                ))}

               {/* Transformer - Only visible in Select mode */}
               {tool === 'select' && selectedIds.length > 0 && (() => {
                  const isWidgetOnly = selectedIds.length === 1 && objects.find(o => o.id === selectedIds[0] && ['audio', 'video'].includes(o.type));
                  if (isWidgetOnly) return null; // We hide Transformer completely for widgets to favor native DOM resizing
                  
                  return (
                     <Transformer
                        ref={trRef}
                        boundBoxFunc={(oldBox, newBox) => {
                           if (newBox.width < 30) return oldBox;
                           return newBox;
                        }}
                        rotateEnabled={true}
                        flipEnabled={false}
                        anchorSize={8}
                        anchorFill="#3b82f6"
                        anchorStroke="#ffffff"
                        borderStroke="#3b82f6"
                        padding={5}
                     />
                  );
               })()}

               {/* Selection Box (Marquee) */}
               {selectionBox && selectionBox.visible && (
                  <Rect
                     name="selectionBoxNode"
                     x={selectionBox.x}
                     y={selectionBox.y}
                     width={selectionBox.w}
                     height={selectionBox.h}
                     fill="rgba(59, 130, 246, 0.2)"
                     stroke="#3b82f6"
                     strokeWidth={1 / scale}
                     listening={false}
                  />
               )}

               {/* Preview Rect for Area Text */}
               {tempRect && (
                  <Rect
                     x={tempRect.x}
                     y={tempRect.y}
                     width={tempRect.w}
                     height={tempRect.h}
                     stroke={color}
                     strokeWidth={1}
                     dash={[5, 5]}
                     fill="transparent"
                  />
               )}

               {/* Render Remote Cursors */}
               {Object.entries(remoteCursors).map(([id, pos]) => (
                  <React.Fragment key={`cursor-${id}`}>
                     <Line
                        points={[0, 0, 10, 10, 5, 10, 5, 15, 2, 15, 2, 10, 0, 10]}
                        x={pos.x}
                        y={pos.y}
                        fill="#3b82f6"
                        closed
                        scaleX={1.5 / scale}
                        scaleY={1.5 / scale}
                        listening={false}
                     />
                     <Text 
                        text={`User ${id.slice(0, 4)}`}
                        x={pos.x + 15 / scale}
                        y={pos.y + 15 / scale}
                        fontSize={10 / scale}
                        fill="#3b82f6"
                        fontFamily="monospace"
                        fontStyle="bold"
                        listening={false}
                     />
                  </React.Fragment>
               ))}
            </Layer>
         </Stage>

         {/* Text Editing Overlay */}
         {editingText && (() => {
            const applyRichFormat = (prefix, suffix = prefix) => {
               const ta = textAreaRef.current;
               if (!ta) return;
               const start = ta.selectionStart;
               const end = ta.selectionEnd;
               const val = editingText.value;
               if (start === end && !prefix.includes('>')) return;
               
               const newVal = val.substring(0, start) + prefix + val.substring(start, end) + suffix + val.substring(end);
               setEditingText({ ...editingText, value: newVal });
               
               setTimeout(() => {
                  if (textAreaRef.current) {
                     textAreaRef.current.focus();
                     textAreaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
                  }
               }, 0);
               setRichTextContextMenu(null);
            };

            return (
              <>
            <textarea
               ref={textAreaRef}
               autoFocus
               rows={1}
               value={editingText.value}
               onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
               onBlur={(e) => {
                  if (richTextContextMenu) return;
                  handleTextSubmit(e);
               }}
               onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleTextSubmit();
                     return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                     if (e.key.toLowerCase() === 'b') { e.preventDefault(); applyRichFormat('**'); }
                     if (e.key.toLowerCase() === 'i') { e.preventDefault(); applyRichFormat('*'); }
                     if (e.key.toLowerCase() === 'u') { e.preventDefault(); applyRichFormat('__'); }
                  }
               }}
               onContextMenu={(e) => {
                  e.preventDefault();
                  setRichTextContextMenu({
                     x: e.clientX,
                     y: e.clientY,
                     applyFormat: applyRichFormat
                  });
               }}
               placeholder=""
               style={{
                  position: 'fixed',
                  top: editingText.y,
                  left: editingText.x,
                  fontSize: fontSize * scale,
                  fontFamily: fontFamily,
                  color: color,
                  background: 'transparent',
                  border: `1px dashed ${color}`,
                  borderRadius: '3px',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  padding: 0,
                  margin: 0,
                  lineHeight: 1.2,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  width: Math.ceil(editingText.width * scale),
                  minWidth: '100px',
                  zIndex: 1000,
                  pointerEvents: 'auto'
               }}
            />
            {richTextContextMenu && (
               <div 
                  className="fixed z-[2000] border border-white/10 rounded-[1.5rem] shadow-2xl overflow-hidden flex flex-col text-[10px] text-white/80 font-bold uppercase tracking-widest"
                  style={{ 
                     left: richTextContextMenu.x, 
                     top: richTextContextMenu.y, 
                     minWidth: 160,
                     backgroundColor: 'rgba(20,20,20,0.6)',
                     backdropFilter: 'blur(30px)',
                     boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                  }}
                  onMouseDown={(e) => e.preventDefault()}
               >
                  <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors flex justify-between" onClick={() => richTextContextMenu.applyFormat('**')}>
                     <span>Bold</span><span className="opacity-40">Ctrl+B</span>
                  </button>
                  <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors flex justify-between" onClick={() => richTextContextMenu.applyFormat('*')}>
                     <span>Italic</span><span className="opacity-40">Ctrl+I</span>
                  </button>
                  <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors flex justify-between" onClick={() => richTextContextMenu.applyFormat('__')}>
                     <span>Underline</span><span className="opacity-40">Ctrl+U</span>
                  </button>
                  <div className="h-[1px] bg-white/10 my-1" />
                  <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors" onClick={() => richTextContextMenu.applyFormat('> ', '')}>
                     Quote Block
                  </button>
                  <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors" onClick={() => richTextContextMenu.applyFormat('||')}>
                     Spoiler
                  </button>
                  {!richTextContextMenu.isLinkMode ? (
                     <button className="px-4 py-2 hover:bg-white/10 text-left transition-colors" onClick={() => {
                        setRichTextContextMenu({ ...richTextContextMenu, isLinkMode: true });
                     }}>
                        Create Link
                     </button>
                  ) : (
                     <div className="p-3 flex flex-col gap-2 bg-white/5">
                        <input 
                           autoFocus
                           placeholder="Paste URL and press Enter"
                           className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white outline-none focus:border-blue-500/50 transition-colors w-full"
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                 const url = e.target.value;
                                 if (url) {
                                    const formattedUrl = (url.startsWith('http://') || url.startsWith('https://')) ? url : `https://${url}`;
                                    richTextContextMenu.applyFormat('[', `](${formattedUrl})`);
                                 } else {
                                    setRichTextContextMenu(null);
                                 }
                              }
                              if (e.key === 'Escape') setRichTextContextMenu(null);
                           }}
                        />
                        <div className="text-[8px] opacity-40 text-center uppercase tracking-widest">Enter to confirm • Esc to cancel</div>
                     </div>
                  )}
               </div>
            )}
            </>
            );
         })()}

         {/* Widget Overlays (Audio, Video) */}
         {objects && objects.map((obj) => {
            if (obj.type === 'audio') {
               return (
                  <AudioPlayerWidget 
                     key={obj.id}
                     id={obj.id}
                     url={obj.url}
                     fileName={obj.name}
                     x={(obj.x * scale) + position.x}
                     y={(obj.y * scale) + position.y}
                     width={obj.width * (obj.scaleX || 1)}
                     scale={scale}
                     color={obj.color || '#ffffff'}
                     isSelected={selectedIds.includes(obj.id)}
                     onContextMenu={(screenX, screenY) => {
                        setAudioContextMenu({ id: obj.id, x: screenX, y: screenY, color: obj.color || '#ffffff' });
                        setTextContextMenu(null);
                     }}
                  />
               );
            }
            if (obj.type === 'video') {
               return (
                  <VideoPlayerWidget 
                     key={obj.id}
                     id={obj.id}
                     url={obj.url}
                     fileName={obj.name}
                     x={(obj.x * scale) + position.x}
                     y={(obj.y * scale) + position.y}
                     width={obj.width * (obj.scaleX || 1)}
                     scale={scale}
                     color={obj.color || '#ffffff'}
                     isSelected={selectedIds.includes(obj.id)}
                     onContextMenu={(screenX, screenY) => {
                        setAudioContextMenu({ id: obj.id, x: screenX, y: screenY, color: obj.color || '#ffffff' });
                        setTextContextMenu(null);
                     }}
                  />
               );
            }
            if (obj.type === 'gif') {
               return (
                  <GifPlayerWidget 
                     key={obj.id}
                     id={obj.id}
                     url={obj.url}
                     fileName={obj.name}
                     x={(obj.x * scale) + position.x}
                     y={(obj.y * scale) + position.y}
                     width={obj.width * (obj.scaleX || 1)}
                     height={obj.height * (obj.scaleY || 1)}
                     scale={scale}
                     color={obj.color || '#ffffff'}
                     isSelected={selectedIds.includes(obj.id)}
                     onContextMenu={(screenX, screenY) => {
                        setAudioContextMenu({ id: obj.id, x: screenX, y: screenY, color: obj.color || '#ffffff' });
                        setTextContextMenu(null);
                     }}
                  />
               );
            }
            return null;
         })}
         {/* Text Font-Size Context Menu */}
         {textContextMenu && (
            <div
               onMouseLeave={() => setTextContextMenu(null)}
               className="fixed z-[2000] border border-white/10 rounded-[1.5rem] shadow-2xl p-4 flex flex-col gap-4 text-white/90"
               style={{
                  left: textContextMenu.x,
                  top: textContextMenu.y,
                  backgroundColor: 'rgba(20,20,20,0.6)',
                  backdropFilter: 'blur(30px)',
                  minWidth: 180,
                  pointerEvents: 'auto',
               }}
            >
               <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">Font Size</span>
                  <div className="flex items-center gap-3">
                     <button
                        onClick={() => {
                           const newSize = Math.max(8, textContextMenu.fontSize - 4);
                           updateText(textContextMenu.id, { fontSize: newSize });
                           setTextContextMenu({ ...textContextMenu, fontSize: newSize });
                        }}
                        className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-colors"
                     >−</button>
                     <span className="text-xs font-mono font-bold w-6 text-center">{textContextMenu.fontSize}</span>
                     <button
                        onClick={() => {
                           const newSize = Math.min(200, textContextMenu.fontSize + 4);
                           updateText(textContextMenu.id, { fontSize: newSize });
                           setTextContextMenu({ ...textContextMenu, fontSize: newSize });
                        }}
                        className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-colors"
                     >+</button>
                  </div>
               </div>

               <div className="h-[1px] bg-white/5" />

               <div className="space-y-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 block">Text Color</span>
                  <div className="grid grid-cols-6 gap-1.5">
                     {['#ffffff', '#000000', '#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ff70a6', '#70d6ff', '#5f0f40', '#9a031e'].map(c => (
                        <button 
                           key={c}
                           onClick={() => {
                              updateText(textContextMenu.id, { fill: c });
                              setTextContextMenu(null);
                           }}
                           className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-125"
                           style={{ backgroundColor: c }}
                        />
                     ))}
                  </div>
               </div>
            </div>
         )}

         {/* Audio Color Context Menu */}
         {audioContextMenu && (
            <div
               onMouseLeave={() => setAudioContextMenu(null)}
               style={{
                  position: 'fixed',
                  left: audioContextMenu.x,
                  top: audioContextMenu.y - 60,
                  zIndex: 2000,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backdropFilter: 'blur(20px)',
                  backgroundColor: 'rgba(20,20,20,0.85)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 16,
                  padding: '8px 14px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  pointerEvents: 'auto',
               }}
            >
               <span style={{ opacity: 0.6, fontSize: 11, color: '#fff', marginRight: 4 }}>Color</span>
               {['#ffffff', '#f43f5e', '#f97316', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#e879f9'].map(c => (
                  <div
                     key={c}
                     onClick={() => {
                        updateObject(audioContextMenu.id, { color: c });
                        setAudioContextMenu(null);
                     }}
                     style={{
                        width: 20, height: 20,
                        borderRadius: '50%',
                        backgroundColor: c,
                        cursor: 'pointer',
                        border: audioContextMenu.color === c ? '2px solid #fff' : '2px solid transparent',
                        boxSizing: 'border-box',
                        transition: 'transform 0.15s',
                     }}
                     onMouseEnter={e => e.target.style.transform = 'scale(1.2)'}
                     onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                  />
               ))}
               <label title="Custom color" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <input
                     type="color"
                     defaultValue={audioContextMenu.color}
                     onChange={(e) => updateObject(audioContextMenu.id, { color: e.target.value })}
                     style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer' }}
                  />
               </label>
            </div>
         )}
      </div>
   );
}

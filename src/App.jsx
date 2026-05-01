import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pen, Eraser, Type, MousePointer2, Settings, Download, Trash2, Moon, Sun, Heart, X, RotateCcw, Hand, Upload, Undo2, Redo2, Coffee, Zap, Users, Link, Grid3x3, AlignJustify, GripHorizontal, Square } from 'lucide-react';
import { useStore } from './store';
import InfiniteCanvas from './components/InfiniteCanvas';

export default function App() {
  const { 
    tool, setTool, 
    theme, setTheme, 
    color, setColor,
    brushSize, setBrushSize,
    eraserSize, setEraserSize,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    clearLines,
    undo, redo, canUndo, canRedo,
    loadSession,
    lines, texts, objects, position, scale, updatePosition, updateScale,
    getThemeColors,
    socket, roomId, setRoomId, initializeSocket,
    canvasStyle, setCanvasStyle
  } = useStore();
  
  const colors = getThemeColors();
  const [showSettings, setShowSettings] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [showBrushMenu, setShowBrushMenu] = useState(false);
  const [brushMenuPos, setBrushMenuPos] = useState({ x: 0, y: 0 });

  const handleCreateRoom = () => {
    const s = socket || initializeSocket();
    s.emit('create-room');
    s.on('room-created', (id) => {
      setRoomId(id);
    });
  };

  const handleJoinRoom = () => {
    if (!joinId) return;
    const s = socket || initializeSocket();
    s.emit('join-room', joinId);
    s.on('joined-successfully', (id) => {
      setRoomId(id);
    });
    s.on('error', (msg) => alert(msg));
  };

  const fileInputRef = useRef(null);
  const sessionInputRef = useRef(null);

  const exportSession = () => {
    const sessionData = {
      version: '1.0',
      theme,
      lines,
      texts,
      objects,
      position,
      scale,
      timestamp: Date.now()
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vision-session-${new Date().toISOString().slice(0, 10)}.vision`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSessionImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const session = JSON.parse(event.target.result);
        loadSession(session);
        setShowSettings(false);
      } catch (err) {
        alert("Invalid session file");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };
  const processFiles = (files) => {
    if (!files || files.length === 0) return;
    
    const { position, scale, addObject, color } = useStore.getState();
    
    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file);
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);

      const isAudio = file.type.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'].some(ext => file.name.toLowerCase().endsWith(ext));
      const isVideo = file.type.startsWith('video/') || ['.mp4', '.webm', '.mov', '.ogg'].some(ext => file.name.toLowerCase().endsWith(ext));
      const isImage = file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.gif');
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      if (isAudio) {
        addObject({
          id, type: 'audio', url, name: file.name, color,
          x: -position.x / scale + 100,
          y: -position.y / scale + 100,
          width: 320, height: 80, scaleX: 1, scaleY: 1
        });
      } else if (isVideo) {
        addObject({
          id, type: 'video', url, name: file.name, color,
          x: -position.x / scale + 100,
          y: -position.y / scale + 100,
          width: 480, height: 320, scaleX: 1, scaleY: 1
        });
      } else if (isImage) {
        const img = new Image();
        img.onload = () => {
          addObject({
            id, type: isGif ? 'gif' : 'image', url, name: file.name,
            x: -position.x / scale + 100,
            y: -position.y / scale + 100,
            width: img.width,
            height: img.height,
            scaleX: 1, scaleY: 1
          });
        };
        img.src = url;
      }
    });
  };

  const handleFileImport = (e) => {
    processFiles(e.target.files);
    e.target.value = null;
  };

  const fonts = [
    { name: 'Inter', family: 'Inter, sans-serif' },
    { name: 'Roboto', family: 'Roboto, sans-serif' },
    { name: 'Serif', family: 'Playfair Display, serif' },
    { name: 'Mono', family: 'JetBrains Mono, monospace' }
  ];

  const handleWindowControl = (action) => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('window-control', action);
    } else if (window.require) {
      window.require('electron').ipcRenderer.send('window-control', action);
    }
  };

  useEffect(() => {
    document.body.style.backgroundColor = colors.bg;
    document.body.style.color = colors.text;
  }, [colors]);

  const onToolRightClick = (e) => {
    e.preventDefault();
    setBrushMenuPos({ x: e.clientX - 120, y: e.clientY - 210 });
    setShowBrushMenu(true);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in a textarea or input
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (fileInputRef.current) {
          fileInputRef.current.value = null;
          fileInputRef.current.click();
        }
        return;
      }

      switch (e.key) {
        case '0': setTool('hand'); break;
        case '1': setTool('select'); break;
        case '2': setTool('pen'); break;
        case '3': setTool('eraser'); break;
        case '4': setTool('text'); break;
        default: break;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportSession();
      }
    };

    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          files.push(item.getAsFile());
        }
      }
      processFiles(files);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [setTool, lines, texts, objects, position, scale, theme]);

  return (
    <div 
      className="flex flex-col h-screen w-screen relative overflow-hidden select-none" 
      style={{ 
        backgroundColor: colors.bg,
        backgroundImage: canvasStyle === 'grid' 
          ? `linear-gradient(to right, ${colors.text}10 1px, transparent 1px), linear-gradient(to bottom, ${colors.text}10 1px, transparent 1px)`
          : canvasStyle === 'lines'
          ? `linear-gradient(to bottom, ${colors.text}15 1px, transparent 1px)`
          : canvasStyle === 'dots'
          ? `radial-gradient(${colors.text}20 1.5px, transparent 1.5px)`
          : 'none',
        backgroundSize: canvasStyle === 'dots' 
          ? `${scale * 40}px ${scale * 40}px` 
          : `${scale * 50}px ${scale * 50}px`,
        backgroundPosition: `${position.x}px ${position.y}px`
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files) {
          processFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* 1. Custom Top Bar */}
      <div className="h-10 w-full flex items-center justify-between px-6 z-50 fixed top-0" style={{ WebkitAppRegion: 'drag' }}>
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.accent }} />
            <div className="text-[10px] font-bold opacity-40 tracking-[0.3em] uppercase">Vision Workspace v0.1</div>
        </div>
        
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex gap-4 items-center">
          <div className="flex gap-2">
            <button onClick={() => handleWindowControl('minimize')} className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-400 cursor-pointer transition-colors" />
            <button onClick={() => handleWindowControl('maximize')} className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-400 cursor-pointer transition-colors" />
            <button onClick={() => handleWindowControl('close')} className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-400 cursor-pointer transition-colors" />
          </div>
        </div>
      </div>

      {/* 2. THE CANVAS */}
      <InfiniteCanvas />



      {/* 3. COLLABORATION MODAL */}
      <AnimatePresence>
        {showCollab && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="fixed top-16 right-8 w-80 rounded-3xl p-6 z-[1000] border shadow-2xl"
            style={{ 
              backgroundColor: colors.panel, 
              backdropFilter: 'blur(40px)', 
              borderColor: colors.border,
              color: colors.text 
            }}
          >
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-sm tracking-widest uppercase opacity-60">Collaboration</span>
              <button onClick={() => setShowCollab(false)} className="opacity-40 hover:opacity-100"><X size={18} /></button>
            </div>

            <div className="space-y-6">
              {!roomId ? (
                <>
                  <button 
                    onClick={handleCreateRoom}
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all group"
                  >
                    <Users size={20} className="group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-xs uppercase tracking-wider">Create Live Room</span>
                  </button>

                  <div className="relative flex items-center gap-2">
                    <div className="flex-1 h-[1px] bg-white/10" />
                    <span className="text-[10px] uppercase opacity-30 font-bold">OR JOIN</span>
                    <div className="flex-1 h-[1px] bg-white/10" />
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Room ID..."
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-white/30"
                    />
                    <button 
                      onClick={handleJoinRoom}
                      className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
                    >
                      <Link size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                   <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
                      <div className="text-[10px] uppercase font-bold text-green-400 mb-1">Room Active</div>
                      <div className="text-xl font-mono font-bold tracking-tighter">{roomId}</div>
                   </div>
                   <button 
                     onClick={() => {
                        navigator.clipboard.writeText(roomId);
                        alert("Room ID copied!");
                     }}
                     className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                   >
                     Copy Invite ID
                   </button>
                   <button 
                     onClick={() => setRoomId(null)}
                     className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-colors"
                   >
                     Leave Room
                   </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. SETTINGS MODAL */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="fixed top-16 right-8 w-80 z-[100] rounded-[2.5rem] shadow-2xl border flex flex-col overflow-hidden"
            style={{ 
              backgroundColor: colors.panel, 
              backdropFilter: 'blur(40px)', 
              borderColor: colors.border,
              color: colors.text,
              maxHeight: '80vh'
            }}
          >
            {/* Header - Non-scrolling */}
            <div className="flex justify-between items-center p-6 pb-2">
              <span className="font-bold text-sm tracking-widest uppercase opacity-60">Settings</span>
              <button onClick={() => setShowSettings(false)} className="opacity-40 hover:opacity-100 transition-opacity"><X size={18} /></button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-8 custom-scrollbar">
              <div className="space-y-6 pt-4">
                 <div>
                    <label className="text-[10px] uppercase tracking-wider opacity-40 mb-3 block">Theme</label>
                    <div className="flex flex-wrap gap-3">
                      <ThemeBtn active={theme === 'light'} icon={<Sun size={18}/>} onClick={() => setTheme('light')} label="Light" />
                      <ThemeBtn active={theme === 'dark'} icon={<Moon size={18}/>} onClick={() => setTheme('dark')} label="Dark" />
                      <ThemeBtn active={theme === 'pink'} icon={<Heart size={18}/>} onClick={() => setTheme('pink')} label="Pink" />
                      <ThemeBtn active={theme === 'cream'} icon={<Coffee size={18}/>} onClick={() => setTheme('cream')} label="Cream" />
                      <ThemeBtn active={theme === 'cyber'} icon={<Zap size={18}/>} onClick={() => setTheme('cyber')} label="Cyber" />
                     </div>
                 </div>
  
                 <div className="pt-4 border-t border-white/10">
                    <label className="text-[10px] uppercase tracking-wider opacity-40 mb-3 block">Canvas Style</label>
                    <div className="flex flex-wrap gap-3">
                      <ThemeBtn active={canvasStyle === 'none'} icon={<Square size={18}/>} onClick={() => setCanvasStyle('none')} label="None" />
                      <ThemeBtn active={canvasStyle === 'grid'} icon={<Grid3x3 size={18}/>} onClick={() => setCanvasStyle('grid')} label="Grid" />
                      <ThemeBtn active={canvasStyle === 'lines'} icon={<AlignJustify size={18}/>} onClick={() => setCanvasStyle('lines')} label="Lines" />
                      <ThemeBtn active={canvasStyle === 'dots'} icon={<GripHorizontal size={18}/>} onClick={() => setCanvasStyle('dots')} label="Dots" />
                    </div>
                 </div>
                 
                 <div className="pt-4 border-t border-white/10 space-y-3">
                    <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block">Session</label>
                    <input type="file" ref={sessionInputRef} className="hidden" accept=".vision" onChange={handleSessionImport} />
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={exportSession}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[11px] font-bold"
                      >
                        <Download size={14} /> Export
                      </button>
                      <button 
                        onClick={() => sessionInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[11px] font-bold"
                      >
                        <Upload size={14} /> Import
                      </button>
                    </div>
  
                    <button onClick={() => { if(window.confirm("Clear all?")) { clearLines(); setShowSettings(false); } }} className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors mt-2">
                      <span className="text-xs font-bold">Clear Workspace</span>
                      <Trash2 size={16} />
                    </button>
                 </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. TOOL CONTEXT MENU */}
      <AnimatePresence>
        {showBrushMenu && (
          <>
            {/* Click-away backdrop */}
            <div 
              className="fixed inset-0 z-[90]" 
              onClick={() => setShowBrushMenu(false)} 
            />
            
            <motion.div 
              initial={{ opacity: 0, y: 50, x: '-50%', scale: 0.9 }}
              animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: 50, x: '-50%', scale: 0.9 }}
              style={{ 
                left: '50%',
                bottom: '120px',
                backgroundColor: colors.panel,
                backdropFilter: 'blur(40px)',
                borderColor: colors.border
              }}
              className="fixed z-[100] w-60 p-4 rounded-[2.5rem] border shadow-2xl flex flex-col gap-3 text-xs"
            >
              <div className="flex justify-between items-center px-1">
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                    {tool === 'eraser' ? 'Eraser' : tool === 'text' ? 'Text Style' : 'Brush Palette'}
                 </span>
                 <button onClick={() => setShowBrushMenu(false)} className="opacity-30 hover:opacity-100"><X size={14} /></button>
              </div>

              {/* Colors (Brush & Text only) */}
              {tool !== 'eraser' && (
                <div className="px-1">
                  <div className="grid grid-cols-6 gap-2">
                    {['#ffffff', '#000000', '#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ff70a6', '#70d6ff', '#5f0f40', '#9a031e'].map(c => (
                      <button 
                        key={c} 
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <label className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/10 overflow-hidden relative">
                      <RotateCcw size={10} className="opacity-40" />
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                </div>
              )}

              {/* Fonts (Text tool only) */}
              {tool === 'text' && (
                 <div className="px-1">
                    <div className="grid grid-cols-2 gap-2">
                       {fonts.map(f => (
                          <button 
                             key={f.name}
                             onClick={() => setFontFamily(f.family)}
                             className={`py-1.5 rounded-xl border transition-all text-[10px] ${fontFamily === f.family ? 'bg-white/20 border-white/30' : 'bg-white/5 border-transparent opacity-60'}`}
                             style={{ fontFamily: f.family }}
                          >
                             {f.name}
                          </button>
                       ))}
                    </div>
                 </div>
              )}

              {/* Size Slider & Preview */}
              <div className="flex flex-col items-center px-1">
                <div className="flex justify-between items-center w-full mb-1">
                  <label className="text-[9px] uppercase tracking-wider opacity-30">Size</label>
                  <span className="text-[9px] font-mono opacity-40">
                     {tool === 'eraser' ? eraserSize : tool === 'text' ? fontSize : brushSize}px
                  </span>
                </div>
                
                {/* Visual Preview */}
                <div className="w-full h-12 flex items-center justify-center bg-black/20 rounded-2xl mb-2 border border-white/5 overflow-hidden">
                   {tool === 'text' ? (
                      <span style={{ fontSize: Math.min(24, fontSize), fontFamily: fontFamily, color: color }}>Aa</span>
                   ) : (
                      <div 
                         style={{ 
                             width: tool === 'eraser' ? eraserSize : brushSize, 
                             height: tool === 'eraser' ? eraserSize : brushSize, 
                             backgroundColor: tool === 'eraser' ? 'transparent' : color,
                             border: tool === 'eraser' ? '2px dashed rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                             transform: `scale(${Math.min(1, 30 / (tool === 'eraser' ? eraserSize : brushSize))})`
                         }} 
                         className="rounded-full transition-all duration-150"
                      />
                   )}
                </div>

                <input 
                   type="range" 
                   min={tool === 'text' ? 8 : 1} 
                   max={tool === 'text' ? 120 : 100} 
                   value={tool === 'eraser' ? eraserSize : tool === 'text' ? fontSize : brushSize} 
                   onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (tool === 'eraser') setEraserSize(val);
                      else if (tool === 'text') setFontSize(val);
                      else setBrushSize(val);
                   }}
                   className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                   style={{ accentColor: colors.accent }}
                />
              </div>

              <button onClick={() => { clearLines(); setShowBrushMenu(false); }} className="text-[9px] uppercase font-bold text-red-500/40 hover:text-red-400 transition-colors flex items-center gap-2 justify-center pt-2 border-t border-white/5">
                 <Trash2 size={10}/> Clear
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 5. Mac-Style Dock */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <motion.div 
          className="glass-toolbar rounded-[2.4rem] px-7 py-4 flex items-center gap-5 pointer-events-auto transition-all duration-700 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)]"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <DockItem 
            icon={<Hand size={20} />} 
            isActive={tool === 'hand'} 
            onClick={() => setTool('hand')} 
            onDoubleClick={() => { 
               updatePosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); 
               updateScale(1); 
            }}
            label="Hand"
            shortcut="0"
            iconColor={colors.icon}
            accent={colors.icon}
          />
          <DockItem 
            icon={<MousePointer2 size={20} />} 
            isActive={tool === 'select'} 
            onClick={() => setTool('select')} 
            label="Select"
            shortcut="1"
            iconColor={colors.icon}
            accent={colors.icon}
          />
          <DockItem 
            icon={<Pen size={20} />} 
            isActive={tool === 'pen'} 
            onClick={() => setTool('pen')} 
            onContextMenu={onToolRightClick}
            label="Brush"
            shortcut="2"
            iconColor={colors.icon}
            accent={colors.icon}
          />
          <DockItem 
            icon={<Eraser size={20} />} 
            isActive={tool === 'eraser'} 
            onClick={() => setTool('eraser')} 
            onContextMenu={onToolRightClick}
            label="Eraser"
            shortcut="3"
            iconColor={colors.icon}
            accent={colors.icon}
          />
          <DockItem 
            icon={<Type size={20} />} 
            isActive={tool === 'text'} 
            onClick={() => setTool('text')} 
            onContextMenu={onToolRightClick}
            label="Text"
            shortcut="4"
            iconColor={colors.icon}
            accent={colors.icon}
          />
          
          <div className="w-[1px] h-8 mx-1 opacity-20" style={{ backgroundColor: colors.icon }} />
          
          <input type="file" ref={fileInputRef} className="hidden" accept="audio/*,video/*,image/*,.mp3,.wav,.m4a,.mp4,.webm,.mov,.gif" onChange={handleFileImport} />
          <DockItem 
            icon={<Upload size={20} />} 
            onClick={() => {
              if(fileInputRef.current) fileInputRef.current.value = null;
              fileInputRef.current.click();
            }} 
            label="Import" 
            shortcut="Ctrl+O"
            iconColor={colors.icon} 
            accent={colors.icon} 
          />

          <div className="w-[1px] h-8 mx-1 opacity-20" style={{ backgroundColor: colors.icon }} />

          <DockItem
            icon={<Undo2 size={20} />}
            onClick={undo}
            label="Undo"
            shortcut="Ctrl+Z"
            iconColor={colors.icon}
            accent={colors.icon}
            disabled={!canUndo()}
          />
          <DockItem
            icon={<Redo2 size={20} />}
            onClick={redo}
            label="Redo"
            shortcut="Ctrl+Y"
            iconColor={colors.icon}
            accent={colors.icon}
            disabled={!canRedo()}
          />

          <div className="w-[1px] h-8 mx-1 opacity-20" style={{ backgroundColor: colors.icon }} />

          <DockItem icon={<Download size={20} />} onClick={exportSession} label="Export Session" shortcut="Ctrl+S" iconColor={colors.icon} accent={colors.icon} />
          <DockItem 
            icon={<Users size={20} />} 
            isActive={showCollab} 
            onClick={() => {
              setShowCollab(!showCollab);
              setShowSettings(false);
            }} 
            label="Collaboration" 
            iconColor={colors.icon} 
            accent={colors.icon} 
          />
          <DockItem 
            icon={<Settings size={20} />} 
            isActive={showSettings}
            onClick={() => {
              setShowSettings(!showSettings);
              setShowCollab(false);
            }} 
            label="Settings" 
            iconColor={colors.icon} 
            accent={colors.icon} 
          />
        </motion.div>
      </div>
    </div>
  );
}
 
  function DockItem({ icon, isActive, onClick, onDoubleClick, onContextMenu, label, shortcut, iconColor, accent, disabled }) {
    const [isHovered, setIsHovered] = useState(false);
    return (
      <div className="relative flex flex-col items-center">
        <AnimatePresence>
          {isHovered && !disabled && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              className="absolute -top-14 bg-black/80 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 shadow-2xl flex items-center gap-2.5 pointer-events-none whitespace-nowrap z-[60]"
            >
              <span className="text-[10px] font-medium tracking-widest text-white/90 uppercase">{label}</span>
              {shortcut && (
                <span className="text-[9px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/40">[{shortcut}]</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={disabled ? undefined : onClick}
          onDoubleClick={disabled ? undefined : onDoubleClick}
       onContextMenu={onContextMenu}
       whileHover={disabled ? {} : { y: -8, scale: 1.15 }}
       whileTap={disabled ? {} : { scale: 0.9 }}
       className={`group relative p-3.5 rounded-[1.8rem] transition-all duration-500 flex flex-col items-center justify-center text-white ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
       style={{ 
         color: iconColor,
       }}
     >
       <div className={`transition-all duration-300 z-10 ${isActive ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]' : 'group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]'}`}>
         {icon}
       </div>
 
       {/* Selection "Hot Line" Underline */}
       <AnimatePresence>
         {isActive && (
           <motion.div 
             layoutId="activeTab"
             initial={{ width: 0, opacity: 0 }}
             animate={{ width: '60%', opacity: 1 }}
             exit={{ width: 0, opacity: 0 }}
             className="absolute bottom-1 h-[3px] rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
             style={{ backgroundColor: iconColor }}
           />
         )}
       </AnimatePresence>

       {/* Hover background glow */}
       <div className="absolute inset-0 rounded-[1.8rem] bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-md" />
 
       {onContextMenu && (
          <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-400/90 border-2 border-white/30 shadow-[0_0_15px_rgba(248,113,113,0.6)] group-hover:scale-150 transition-transform" />
       )}
      </motion.button>
      </div>
     );
  }

function ThemeBtn({ active, icon, onClick, label }) {
    return (
        <button 
           onClick={onClick}
           className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-3xl transition-all border ${active ? 'bg-white/20 border-white/40 scale-105' : 'hover:bg-white/5 border-transparent opacity-50 hover:opacity-100'}`}
        >
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
        </button>
    )
}


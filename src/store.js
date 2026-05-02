import { create } from 'zustand';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001'; // Default local, will be updated to Render URL

const themes = {
  dark: {
    bg: '#002029',
    panel: 'rgba(47, 48, 55, 0.4)',
    dockBg: 'rgba(2, 48, 71, 0.7)',
    text: '#edf2f4',
    icon: '#ffffff',
    accent: '#ffffff',
    border: 'rgba(255, 255, 255, 0.1)'
  },
  light: {
    bg: '#edf2f4',
    panel: 'rgba(255, 255, 255, 0.8)',
    dockBg: 'rgba(255, 255, 255, 0.7)',
    text: '#2b2d42',
    icon: '#002029',
    accent: '#002029',
    border: 'rgba(255, 255, 255, 0.2)'
  },
  pink: {
    bg: '#ffc8dd',
    panel: 'rgba(255, 175, 204, 0.5)',
    dockBg: 'rgba(144, 224, 239, 0.7)',
    text: '#2b2d42',
    icon: '#002137',
    accent: '#ffafcc',
    border: 'rgba(255, 255, 255, 0.2)'
  },
  cream: {
    bg: '#f8f1e9',
    panel: 'rgba(230, 215, 200, 0.4)',
    dockBg: 'rgba(240, 230, 220, 0.8)',
    text: '#5d544b',
    icon: '#5d544b',
    accent: '#c8ad93',
    border: 'rgba(93, 84, 75, 0.1)'
  },
  cyber: {
    bg: '#050515',
    panel: 'rgba(20, 20, 50, 0.5)',
    dockBg: 'rgba(10, 10, 30, 0.8)',
    text: '#00f2ff',
    icon: '#00f2ff',
    accent: '#ff00ff',
    border: 'rgba(0, 242, 255, 0.2)'
  }
};

// ─── History helpers ─────────────────────────────────────
const MAX_HISTORY = 60;

const snapshot = (state) => ({
  lines: state.lines,
  texts: state.texts,
  objects: state.objects,
});

const pushHistory = (state) => {
  const past = [...state._past, snapshot(state)].slice(-MAX_HISTORY);
  return { _past: past, _future: [] }; // clear redo on new action
};
// ─────────────────────────────────────────────────────────

export const useStore = create((set, get) => ({
  theme: 'cream',
  canvasStyle: 'grid', // 'none', 'grid', 'lines', 'dots'
  tool: 'select',
  color: '#ffffff',
  brushSize: 5,
  eraserSize: 20,

  // Text State
  fontSize: 24,
  fontFamily: 'Inter',
  texts: [],

  // Canvas State
  scale: 1,
  position: { x: 0, y: 0 },
  lines: [],
  objects: [],

  // History stacks (not rendered, internal only)
  _past: [],
  _future: [],

  // ── Settings ──────────────────────────────────────────
  setTheme: (theme) => set({ theme }),
  setCanvasStyle: (canvasStyle) => set({ canvasStyle }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setBrushSize: (size) => set({ brushSize: size }),
  setEraserSize: (size) => set({ eraserSize: size }),
  setFontSize: (size) => set({ fontSize: size }),
  setFontFamily: (font) => set({ fontFamily: font }),

  updatePosition: (pos) => set({ position: pos }),
  updateScale: (scale) => set({ scale }),

  saveHistory: () => set((state) => ({ ...pushHistory(state) })),

  // ── Lines ─────────────────────────────────────────────
  addLine: (line) => {
    set((state) => ({
      ...pushHistory(state),
      lines: [...state.lines, line]
    }));
    get().broadcast('ADD_LINE', line);
  },
  updateLastLine: (updatedLine) => set((state) => {
    const newLines = [...state.lines];
    newLines[newLines.length - 1] = updatedLine;
    return { lines: newLines };
  }),
  updateLine: (id, updates, push = false) => {
    set((state) => ({
      ...(push ? pushHistory(state) : {}),
      lines: state.lines.map((line, i) => {
        const lineId = line.id || `line-${i}`;
        return lineId === id ? { ...line, ...updates } : line;
      })
    }));
    get().broadcast('UPDATE_LINE', { id, updates });
  },

  // ── Texts ─────────────────────────────────────────────
  addText: (text) => {
    set((state) => ({
      ...pushHistory(state),
      texts: [...state.texts, text]
    }));
    get().broadcast('ADD_TEXT', text);
  },
  updateText: (id, updates, push = false) => {
    set((state) => ({
      ...(push ? pushHistory(state) : {}),
      texts: state.texts.map(t => t.id === id ? { ...t, ...updates } : t)
    }));
    get().broadcast('UPDATE_TEXT', { id, updates });
  },

  // ── Objects ───────────────────────────────────────────
  addObject: (obj) => {
    set((state) => ({
      ...pushHistory(state),
      objects: [...state.objects, obj]
    }));
    get().broadcast('ADD_OBJECT', obj);
  },
  updateObject: (id, updates, push = false) => {
    set((state) => ({
      ...(push ? pushHistory(state) : {}),
      objects: state.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
    }));
    get().broadcast('UPDATE_OBJECT', { id, updates });
  },

  // ── Delete ────────────────────────────────────────────
  deleteItems: (ids) => {
    set((state) => ({
      ...pushHistory(state),
      lines: state.lines.filter((l, i) => !ids.includes(l.id || `line-${i}`)),
      texts: state.texts.filter(t => !ids.includes(t.id)),
      objects: state.objects.filter(o => !ids.includes(o.id))
    }));
    get().broadcast('DELETE_ITEMS', { ids });
  },

  // ── Undo / Redo ───────────────────────────────────────
  undo: () => set((state) => {
    if (state._past.length === 0) return {};
    const previous = state._past[state._past.length - 1];
    const newPast = state._past.slice(0, -1);
    return {
      ...previous,
      _past: newPast,
      _future: [snapshot(state), ...state._future].slice(0, MAX_HISTORY),
    };
  }),

  redo: () => set((state) => {
    if (state._future.length === 0) return {};
    const next = state._future[0];
    const newFuture = state._future.slice(1);
    return {
      ...next,
      _past: [...state._past, snapshot(state)].slice(-MAX_HISTORY),
      _future: newFuture,
    };
  }),

  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,

  // ── Misc ──────────────────────────────────────────────
  loadSession: (session) => set((state) => ({
    ...pushHistory(state),
    ...session,
    _future: []
  })),

  clearLines: () => {
    set((state) => ({
      ...pushHistory(state),
      lines: [], texts: [], objects: []
    }));
    get().broadcast('CLEAR_ALL', {});
  },

  // ── Multiplayer ──────────────────────────────────────
  socket: null,
  roomId: null,
  remoteCursors: {},

  setRoomId: (id) => set({ roomId: id }),

  initializeSocket: (url = SERVER_URL) => {
    const socket = io(url);
    
    socket.on('canvas-update', ({ type, data }) => {
      const state = useStore.getState();
      switch (type) {
        case 'CURSOR_MOVE':
          set({ 
            remoteCursors: { 
              ...state.remoteCursors, 
              [data.userId]: data.pos 
            } 
          });
          break;
        case 'ADD_LINE': 
          set({ lines: [...state.lines, data] }); 
          break;
        case 'UPDATE_LINE':
          set({ lines: state.lines.map(l => (l.id === data.id ? { ...l, ...data.updates } : l)) });
          break;
        case 'ADD_TEXT':
          set({ texts: [...state.texts, data] });
          break;
        case 'UPDATE_TEXT':
          set({ texts: state.texts.map(t => (t.id === data.id ? { ...t, ...data.updates } : t)) });
          break;
        case 'ADD_OBJECT':
          set({ objects: [...state.objects, data] });
          break;
        case 'UPDATE_OBJECT':
          set({ objects: state.objects.map(o => (o.id === data.id ? { ...o, ...data.updates } : o)) });
          break;
        case 'DELETE_ITEMS':
          set({
            lines: state.lines.filter(l => !data.ids.includes(l.id)),
            texts: state.texts.filter(t => !data.ids.includes(t.id)),
            objects: state.objects.filter(o => !data.ids.includes(o.id))
          });
          break;
        case 'CLEAR_ALL':
          set({ lines: [], texts: [], objects: [] });
          break;
      }
    });

    set({ socket });
    return socket;
  },

  broadcast: (type, data) => {
    const { socket, roomId } = useStore.getState();
    if (socket && roomId) {
      socket.emit('canvas-update', { roomId, data: { type, data: { ...data, userId: socket.id } } });
    }
  },

  getThemeColors: () => themes[useStore.getState().theme || 'dark']
}));

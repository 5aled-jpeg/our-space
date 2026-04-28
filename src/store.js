import { create } from 'zustand';

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
  theme: 'dark',
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
  addLine: (line) => set((state) => ({
    ...pushHistory(state),
    lines: [...state.lines, line]
  })),
  updateLastLine: (updatedLine) => set((state) => {
    const newLines = [...state.lines];
    newLines[newLines.length - 1] = updatedLine;
    return { lines: newLines };
  }),
  updateLine: (id, updates, push = false) => set((state) => ({
    ...(push ? pushHistory(state) : {}),
    lines: state.lines.map((line, i) => {
      const lineId = line.id || `line-${i}`;
      return lineId === id ? { ...line, ...updates } : line;
    })
  })),

  // ── Texts ─────────────────────────────────────────────
  addText: (text) => set((state) => ({
    ...pushHistory(state),
    texts: [...state.texts, text]
  })),
  updateText: (id, updates, push = false) => set((state) => ({
    ...(push ? pushHistory(state) : {}),
    texts: state.texts.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  // ── Objects ───────────────────────────────────────────
  addObject: (obj) => set((state) => ({
    ...pushHistory(state),
    objects: [...state.objects, obj]
  })),
  updateObject: (id, updates, push = false) => set((state) => ({
    ...(push ? pushHistory(state) : {}),
    objects: state.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
  })),

  // ── Delete ────────────────────────────────────────────
  deleteItems: (ids) => set((state) => ({
    ...pushHistory(state),
    lines: state.lines.filter((l, i) => !ids.includes(l.id || `line-${i}`)),
    texts: state.texts.filter(t => !ids.includes(t.id)),
    objects: state.objects.filter(o => !ids.includes(o.id))
  })),

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

  clearLines: () => set((state) => ({
    ...pushHistory(state),
    lines: [], texts: [], objects: []
  })),

  getThemeColors: () => themes[useStore.getState().theme || 'dark']
}));

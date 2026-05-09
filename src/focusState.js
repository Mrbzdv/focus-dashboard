function makeId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(text) {
  return String(text ?? '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function makeEntry(text, createdAt = nowIso(), extra = {}) {
  return {
    id: makeId(),
    text: cleanText(text),
    createdAt,
    ...extra,
  };
}

function makeTask(text, createdAt = nowIso(), status = 'todo') {
  return {
    ...makeEntry(text, createdAt),
    status,
    finishedAt: null,
    notes: '',
    focusSessions: [],
    events: [{ type: 'created', at: createdAt, status }],
  };
}

function snapshotDay(state) {
  return {
    date: state.date,
    tasks: state.tasks,
    wins: state.wins,
    notes: state.notes,
  };
}

function elapsedSeconds(startedAt, endedAt) {
  return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
}

export function dateKeyFromLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialState(date = dateKeyFromLocalDate()) {
  return {
    date,
    activeTaskId: null,
    notes: '',
    tasks: [],
    distractions: [],
    wins: [],
    history: [],
    timer: {
      minutes: 25,
      startedAt: null,
    },
  };
}

export function migrateState(saved, date = dateKeyFromLocalDate()) {
  if (!saved?.date) {
    return createInitialState(date);
  }

  const migratedTasks = saved.tasks
    ? saved.tasks
    : (saved.priorities ?? []).map((item) => ({
        ...makeTask(item.text, item.createdAt, 'todo'),
        id: item.id,
        finishedAt: null,
      }));

  return {
    ...createInitialState(saved.date),
    ...saved,
    activeTaskId: saved.activeTaskId ?? null,
    tasks: migratedTasks,
    timer: {
      minutes: saved.timer?.minutes ?? 25,
      startedAt: saved.timer?.startedAt ?? null,
    },
  };
}

export function addTodo(state, text, createdAt = nowIso()) {
  const value = cleanText(text);
  if (!value) {
    return state;
  }

  return {
    ...state,
    tasks: [...state.tasks, makeTask(value, createdAt, 'todo')],
  };
}

export function moveTask(state, id, status, at = nowIso()) {
  const allowed = new Set(['todo', 'parked', 'active', 'finished']);
  if (!allowed.has(status)) {
    return state;
  }

  return {
    ...state,
    activeTaskId: status === 'active' ? id : state.activeTaskId === id ? null : state.activeTaskId,
    tasks: state.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            status,
            events: [...task.events, { type: 'moved', at, status }],
          }
        : task,
    ),
  };
}

export function startFocusSession(state, id, plannedMinutes = state.timer.minutes, startedAt = nowIso()) {
  const safeMinutes = Math.min(240, Math.max(1, Math.round(Number(plannedMinutes) || state.timer.minutes)));

  return {
    ...state,
    activeTaskId: id,
    timer: {
      minutes: safeMinutes,
      startedAt,
    },
    tasks: state.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            status: 'active',
            events: [...task.events, { type: 'focus_started', at: startedAt, plannedMinutes: safeMinutes }],
          }
        : task.status === 'active'
          ? { ...task, status: 'todo' }
          : task,
    ),
  };
}

export function finishFocusSession(state, result = 'not_finished', endedAt = nowIso()) {
  if (!state.activeTaskId || !state.timer.startedAt) {
    return {
      ...state,
      activeTaskId: null,
      timer: { ...state.timer, startedAt: null },
      tasks: state.tasks.map((task) =>
        task.id === state.activeTaskId
          ? {
              ...task,
              status: result === 'finished' ? 'finished' : 'todo',
              events: [...task.events, { type: 'focus_finished', at: endedAt, result }],
            }
          : task,
      ),
    };
  }

  const activeTaskId = state.activeTaskId;
  const session = {
    startedAt: state.timer.startedAt,
    endedAt,
    plannedMinutes: state.timer.minutes,
    actualSeconds: elapsedSeconds(state.timer.startedAt, endedAt),
    result,
  };

  return {
    ...state,
    activeTaskId: null,
    timer: { ...state.timer, startedAt: null },
    tasks: state.tasks.map((task) =>
      task.id === activeTaskId
        ? {
            ...task,
            status: result === 'finished' ? 'finished' : 'todo',
            finishedAt: result === 'finished' ? endedAt : task.finishedAt,
            focusSessions: [...task.focusSessions, session],
            events: [...task.events, { type: 'focus_finished', at: endedAt, result }],
          }
        : task,
    ),
  };
}

export function completeTask(state, id, finishedAt = nowIso()) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    return state;
  }

  let next = state.activeTaskId === id
    ? finishFocusSession(state, 'finished', finishedAt)
    : state;

  next = {
    ...next,
    activeTaskId: next.activeTaskId === id ? null : next.activeTaskId,
    tasks: next.tasks.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'finished',
            finishedAt,
            events: [...item.events, { type: 'finished', at: finishedAt }],
          }
        : item,
    ),
  };

  if (next.wins.some((win) => win.taskId === id)) {
    return next;
  }

  return {
    ...next,
    wins: [makeEntry(task.text, finishedAt, { taskId: id, finishedAt }), ...next.wins],
  };
}

export function completeActiveTask(state, finishedAt = nowIso()) {
  if (!state.activeTaskId) {
    return state;
  }

  return completeTask(state, state.activeTaskId, finishedAt);
}

export function setActiveTaskNotes(state, notes) {
  if (!state.activeTaskId) {
    return state;
  }

  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === state.activeTaskId ? { ...task, notes: String(notes ?? '') } : task,
    ),
  };
}

export function setNotes(state, notes) {
  return {
    ...state,
    notes: String(notes ?? ''),
  };
}

export function addDistraction(state, text, createdAt = nowIso()) {
  const value = cleanText(text);
  if (!value) {
    return state;
  }

  return {
    ...state,
    distractions: [makeEntry(value, createdAt), ...state.distractions],
  };
}

export function removeDistraction(state, id) {
  return {
    ...state,
    distractions: state.distractions.filter((item) => item.id !== id),
  };
}

export function addWin(state, text, createdAt = nowIso()) {
  const value = cleanText(text);
  if (!value) {
    return state;
  }

  return {
    ...state,
    wins: [makeEntry(value, createdAt), ...state.wins],
  };
}

export function removeWin(state, id) {
  return {
    ...state,
    wins: state.wins.filter((item) => item.id !== id),
  };
}

export function setTimerMinutes(state, minutes) {
  const numericMinutes = Number(minutes);
  const safeMinutes = Number.isFinite(numericMinutes)
    ? Math.min(240, Math.max(1, Math.round(numericMinutes)))
    : state.timer.minutes;

  return {
    ...state,
    timer: {
      ...state.timer,
      minutes: safeMinutes,
      startedAt: null,
    },
  };
}

export function setTimerStarted(state, startedAt) {
  return {
    ...state,
    timer: {
      ...state.timer,
      startedAt,
    },
  };
}

export function resetForDate(state, date = dateKeyFromLocalDate()) {
  if (state.date === date) {
    return state;
  }

  return {
    ...createInitialState(date),
    history: [snapshotDay(state), ...state.history].slice(0, 14),
  };
}

export function startFreshDay(state) {
  return {
    ...createInitialState(state.date),
    history: [snapshotDay(state), ...state.history].slice(0, 14),
  };
}

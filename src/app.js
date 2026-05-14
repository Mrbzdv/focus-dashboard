import {
  addDistraction,
  addTodo,
  addWin,
  completeActiveTask,
  completeTask,
  createInitialState,
  dateKeyFromLocalDate,
  finishFocusSession,
  migrateState,
  moveTask,
  resetForDate,
  setActiveTaskNotes,
  setTimerMinutes,
  setTimerStarted,
  startFocusSession,
  startFreshDay,
} from './focusState.js?v=20260514-carry-forward';

const STORAGE_KEY = 'focus-dashboard-state-v2';
const LEGACY_STORAGE_KEY = 'focus-dashboard-state-v1';
const today = () => dateKeyFromLocalDate();

const elements = {
  todayLabel: document.querySelector('#todayLabel'),
  todoCount: document.querySelector('#todoCount'),
  todoForm: document.querySelector('#todoForm'),
  todoInput: document.querySelector('#todoInput'),
  todoList: document.querySelector('#todoList'),
  parkingForm: document.querySelector('#parkingForm'),
  parkingInput: document.querySelector('#parkingInput'),
  parkingList: document.querySelector('#parkingList'),
  winForm: document.querySelector('#winForm'),
  winInput: document.querySelector('#winInput'),
  winList: document.querySelector('#winList'),
  activeTaskTitle: document.querySelector('#activeTaskTitle'),
  notesTitle: document.querySelector('#notesTitle'),
  notesInput: document.querySelector('#notesInput'),
  savedIndicator: document.querySelector('#savedIndicator'),
  elapsedDisplay: document.querySelector('#elapsedDisplay'),
  targetDisplay: document.querySelector('#targetDisplay'),
  targetMinutesInput: document.querySelector('#targetMinutesInput'),
  timerMinus: document.querySelector('#timerMinus'),
  timerPlus: document.querySelector('#timerPlus'),
  timerToggle: document.querySelector('#timerToggle'),
  timerStop: document.querySelector('#timerStop'),
  sessionResult: document.querySelector('#sessionResult'),
  finishedButton: document.querySelector('#finishedButton'),
  notFinishedButton: document.querySelector('#notFinishedButton'),
  newDayButton: document.querySelector('#newDayButton'),
  exportSelect: document.querySelector('#exportSelect'),
  exportButton: document.querySelector('#exportButton'),
  restoreButton: document.querySelector('#restoreButton'),
  restoreInput: document.querySelector('#restoreInput'),
  historyList: document.querySelector('#historyList'),
  toast: document.querySelector('#toast'),
  confettiLayer: document.querySelector('#confettiLayer'),
  videoCelebration: document.querySelector('#videoCelebration'),
  finishVideo: document.querySelector('#finishVideo'),
  timerDing: document.querySelector('#timerDing'),
  sadTrombone: document.querySelector('#sadTrombone'),
};

let state = loadState();
let timerInterval = null;
let pendingSession = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY));
    if (saved?.date) {
      return resetForDate(migrateState(saved, today()), today());
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return createInitialState(today());
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.savedIndicator.textContent = 'Saved';
}

function updateState(nextState) {
  state = nextState;
  saveState();
  render();
}

function formatDateLabel(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatExportDateTime(value) {
  return value ? new Date(value).toLocaleString() : 'n/a';
}

function activeTask() {
  return state.tasks.find((task) => task.id === state.activeTaskId) ?? null;
}

function visibleTasks(status) {
  return state.tasks.filter((task) => task.status === status);
}

function render() {
  const task = activeTask();
  elements.todayLabel.textContent = formatDateLabel(state.date);
  elements.todoCount.textContent = String(visibleTasks('todo').length);
  elements.activeTaskTitle.textContent = task?.text ?? 'Drag a task onto the clock';
  elements.notesTitle.textContent = task ? `Notes for ${task.text}` : 'Attach notes to the active task';
  elements.notesInput.value = task?.notes ?? '';
  elements.notesInput.disabled = !task;
  elements.timerStop.disabled = !task;
  elements.timerToggle.disabled = !task || pendingSession;
  elements.targetMinutesInput.disabled = Boolean(state.timer.startedAt);
  elements.targetMinutesInput.hidden = Boolean(state.timer.startedAt);
  elements.targetDisplay.hidden = !state.timer.startedAt;
  elements.finishedButton.disabled = !task;
  elements.notFinishedButton.disabled = !task;
  elements.sessionResult.hidden = !pendingSession || !task;
  elements.timerToggle.classList.toggle('finish-button', Boolean(state.timer.startedAt));
  renderTimer();
  renderTaskList(elements.todoList, visibleTasks('todo'), 'No open tasks. Add one or drag from Parking Lot.');
  renderTaskList(elements.parkingList, visibleTasks('parked'), 'Parked tasks can wait here.');
  renderWins();
  renderHistory();
}

function renderTaskList(node, tasks, emptyText) {
  node.replaceChildren();

  if (!tasks.length) {
    node.append(emptyNode(emptyText));
    return;
  }

  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = 'task-card';
    li.draggable = true;
    li.dataset.taskId = task.id;

    const text = document.createElement('span');
    text.textContent = task.text;

    const meta = document.createElement('small');
    meta.textContent = `Added ${formatDateTime(task.createdAt)}`;

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const focus = document.createElement('button');
    focus.className = 'focus-action';
    focus.type = 'button';
    focus.textContent = 'Focus';
    focus.addEventListener('click', () => activateTask(task.id));

    const finish = document.createElement('button');
    finish.className = 'finish-action';
    finish.type = 'button';
    finish.textContent = 'Finished';
    finish.addEventListener('click', () => finishTask(task.id));

    actions.append(focus, finish);
    li.append(text, meta, actions);
    li.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
    });
    node.append(li);
  }
}

function renderWins() {
  elements.winList.replaceChildren();
  if (!state.wins.length) {
    elements.winList.append(emptyNode('Finished tasks and manual wins land here.'));
    return;
  }

  for (const win of state.wins) {
    const li = document.createElement('li');
    li.className = 'win-card';
    const text = document.createElement('span');
    text.textContent = win.text;
    const meta = document.createElement('small');
    meta.textContent = win.finishedAt ? `Finished ${formatDateTime(win.finishedAt)}` : `Logged ${formatDateTime(win.createdAt)}`;
    li.append(text, meta);
    elements.winList.append(li);
  }
}

function renderHistory() {
  elements.historyList.replaceChildren();
  const days = historyDays();

  for (const day of days) {
    const label = day.date === state.date ? 'Today' : formatDateLabel(day.date);
    const card = makeHistoryCard(day, label);
    if (card) {
      elements.historyList.append(card);
    }
  }

  if (!elements.historyList.children.length) {
    elements.historyList.append(emptyNode('Complete a task or start a fresh day to build history.'));
  }
}

function historyDays() {
  const finishedTasks = state.tasks.filter((task) => task.status === 'finished');
  const activeTasks = state.tasks.filter((task) => task.status !== 'finished' && task.focusSessions.length);
  const currentDay = {
    date: state.date,
    tasks: [...finishedTasks, ...activeTasks],
    distractions: state.distractions,
    wins: state.wins,
    notes: state.notes,
  };

  return [currentDay, ...state.history];
}

function makeHistoryCard(day, label) {
  const tasks = day.tasks ?? [];
  const wins = day.wins ?? [];
  if (!tasks.length && !wins.length && !day.notes) {
    return null;
  }

  const article = document.createElement('article');
  article.className = 'history-card';

  const title = document.createElement('h3');
  title.textContent = label;
  article.append(title);

  for (const task of tasks) {
    const block = document.createElement('div');
    block.className = 'history-task';
    const heading = document.createElement('strong');
    heading.textContent = task.text;
    const timing = document.createElement('small');
    timing.textContent = [
      `Added ${formatDateTime(task.createdAt)}`,
      task.finishedAt ? `Finished ${formatDateTime(task.finishedAt)}` : null,
    ].filter(Boolean).join('  |  ');
    block.append(heading, timing);

    for (const session of task.focusSessions ?? []) {
      const sessionLine = document.createElement('small');
      sessionLine.textContent = `Focus ${formatDateTime(session.startedAt)}: planned ${session.plannedMinutes}m, actual ${formatDuration(session.actualSeconds)}, ${session.result.replace('_', ' ')}`;
      block.append(sessionLine);
    }

    if (task.notes) {
      const notes = document.createElement('p');
      notes.textContent = task.notes;
      block.append(notes);
    }

    article.append(block);
  }

  return article;
}

function emptyNode(text) {
  const empty = document.createElement('li');
  empty.className = 'empty';
  empty.textContent = text;
  return empty;
}

function getElapsedSeconds() {
  if (!state.timer.startedAt) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - new Date(state.timer.startedAt).getTime()) / 1000));
}

function getTargetSeconds() {
  return Math.max(0, state.timer.minutes * 60 - getElapsedSeconds());
}

function renderTimer() {
  elements.elapsedDisplay.textContent = formatDuration(getElapsedSeconds());
  elements.targetDisplay.textContent = formatDuration(getTargetSeconds());
  if (document.activeElement !== elements.targetMinutesInput) {
    elements.targetMinutesInput.value = String(state.timer.minutes);
  }
  elements.timerToggle.textContent = state.timer.startedAt ? 'Finished' : 'Start';

  if (state.timer.startedAt && getTargetSeconds() === 0 && !pendingSession) {
    pendingSession = true;
    render();
    playTimerDing();
    showToast('Target time is up.');
  }
}

function activateTask(taskId) {
  pendingSession = false;
  updateState(moveTask(state, taskId, 'active'));
}

function handleTimerPrimaryAction() {
  if (!state.activeTaskId) {
    return;
  }

  if (state.timer.startedAt) {
    finishActiveTask();
    return;
  }

  updateState(startFocusSession(state, state.activeTaskId, state.timer.minutes, new Date().toISOString()));
}

function stopAsNotFinished() {
  if (!state.activeTaskId) {
    return;
  }

  pendingSession = false;
  updateState(finishFocusSession(state, 'not_finished', new Date().toISOString()));
  playSadTrombone();
  showToast('Not finished. Back to Open Tasks.');
}

function finishActiveTask() {
  if (!state.activeTaskId) {
    return;
  }

  pendingSession = false;
  updateState(completeActiveTask(state, new Date().toISOString()));
  celebrate();
}

function finishTask(taskId) {
  updateState(completeTask(state, taskId, new Date().toISOString()));
  celebrate();
}

function celebrate() {
  showToast('Finished. Nice work.');
  playFinishVideo();
  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = ['#2e7d5a', '#f3c95f', '#d85f7f', '#4f8cc9'][index % 4];
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    piece.style.transform = `rotate(${Math.random() * 160}deg)`;
    elements.confettiLayer.append(piece);
    setTimeout(() => piece.remove(), 1600);
  }
}

function playFinishVideo() {
  stopFinishVideo();
  elements.videoCelebration.classList.add('show');
  elements.finishVideo.currentTime = 0;
  elements.finishVideo.muted = false;
  elements.finishVideo.volume = 1;
  elements.finishVideo.play().catch(() => {
    setTimeout(() => elements.videoCelebration.classList.remove('show'), 1600);
  });
}

function stopFinishVideo() {
  elements.finishVideo.pause();
}

function playSadTrombone() {
  elements.sadTrombone.currentTime = 0;
  elements.sadTrombone.play().catch(() => showToast('Not finished.'));
}

function playTimerDing() {
  elements.timerDing.currentTime = 0;
  elements.timerDing.volume = 1;
  elements.timerDing.play().catch(() => showToast('Target time is up.'));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

async function exportData() {
  const exportType = elements.exportSelect.value;
  const fileDate = new Date().toISOString().slice(0, 10);
  const exports = {
    all: {
      label: 'All data',
      fileName: `focus-dashboard-all-${fileDate}.txt`,
      content: buildAllExport(),
    },
    todo: {
      label: 'Open tasks',
      fileName: `focus-dashboard-open-tasks-${fileDate}.txt`,
      content: buildTaskExport('Open Tasks', visibleTasks('todo')),
    },
    parking: {
      label: 'Parking lot',
      fileName: `focus-dashboard-parking-lot-${fileDate}.txt`,
      content: buildTaskExport('Parking Lot', visibleTasks('parked')),
    },
    wins: {
      label: 'Tiny wins',
      fileName: `focus-dashboard-tiny-wins-${fileDate}.txt`,
      content: buildWinsExport(),
    },
    history: {
      label: 'History',
      fileName: `focus-dashboard-history-${fileDate}.txt`,
      content: buildHistoryExport(),
    },
    backup: {
      label: 'Restorable backup',
      fileName: `focus-dashboard-backup-${fileDate}.json`,
      content: buildBackupExport(),
      mimeType: 'application/json',
      extension: '.json',
      description: 'JSON backup',
    },
  };
  const selected = exports[exportType] ?? exports.all;
  const saved = await saveTextFile(selected.fileName, selected.content, {
    mimeType: selected.mimeType,
    extension: selected.extension,
    description: selected.description,
  });
  showToast(saved ? `${selected.label} exported.` : 'Export canceled.');
}

function buildAllExport() {
  return [
    'Focus Dashboard Export',
    `Exported: ${formatExportDateTime(new Date().toISOString())}`,
    '',
    buildTaskExport('Open Tasks', visibleTasks('todo')),
    '',
    buildTaskExport('Parking Lot', visibleTasks('parked')),
    '',
    buildWinsExport(),
    '',
    buildHistoryExport(),
  ].join('\n');
}

function buildTaskExport(title, tasks) {
  const lines = [title, '='.repeat(title.length)];
  if (!tasks.length) {
    lines.push('None');
    return lines.join('\n');
  }

  for (const task of tasks) {
    lines.push(`- ${task.text}`);
    lines.push(`  Added: ${formatExportDateTime(task.createdAt)}`);
    if (task.notes) {
      lines.push(`  Notes: ${task.notes}`);
    }
  }

  return lines.join('\n');
}

function buildWinsExport() {
  const lines = ['Tiny Wins', '========='];
  if (!state.wins.length) {
    lines.push('None');
    return lines.join('\n');
  }

  for (const win of state.wins) {
    lines.push(`- ${win.text}`);
    lines.push(`  ${win.finishedAt ? 'Finished' : 'Logged'}: ${formatExportDateTime(win.finishedAt ?? win.createdAt)}`);
  }

  return lines.join('\n');
}

function buildHistoryExport() {
  const lines = ['History', '======='];
  const days = historyDays().filter((day) => (day.tasks ?? []).length || (day.wins ?? []).length || day.notes);
  if (!days.length) {
    lines.push('None');
    return lines.join('\n');
  }

  for (const day of days) {
    lines.push('');
    lines.push(day.date === state.date ? `Today (${day.date})` : day.date);
    lines.push('-'.repeat(lines.at(-1).length));
    for (const task of day.tasks ?? []) {
      lines.push(`Task: ${task.text}`);
      lines.push(`  Added: ${formatExportDateTime(task.createdAt)}`);
      if (task.finishedAt) {
        lines.push(`  Finished: ${formatExportDateTime(task.finishedAt)}`);
      }
      for (const session of task.focusSessions ?? []) {
        lines.push(`  Focus: ${formatExportDateTime(session.startedAt)} | planned ${session.plannedMinutes}m | actual ${formatDuration(session.actualSeconds)} | ${session.result.replace('_', ' ')}`);
      }
      if (task.notes) {
        lines.push(`  Notes: ${task.notes}`);
      }
    }
    for (const win of day.wins ?? []) {
      lines.push(`Win: ${win.text}`);
      lines.push(`  Logged: ${formatExportDateTime(win.finishedAt ?? win.createdAt)}`);
    }
    if (day.notes) {
      lines.push(`Day notes: ${day.notes}`);
    }
  }

  return lines.join('\n');
}

function buildBackupExport() {
  return JSON.stringify(
    {
      app: 'focus-dashboard',
      version: 2,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}

async function saveTextFile(fileName, content, options = {}) {
  const mimeType = options.mimeType ?? 'text/plain';
  const extension = options.extension ?? '.txt';
  const description = options.description ?? 'Text file';

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description,
            accept: { [mimeType]: [extension] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return false;
      }

      console.error(error);
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

function promptForRestore() {
  elements.restoreInput.value = '';
  elements.restoreInput.click();
}

async function restoreFromBackup(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    const importedState = parsed?.state ?? parsed;

    if (!importedState?.date) {
      throw new Error('Backup does not contain Focus Dashboard state.');
    }

    pendingSession = false;
    updateState(resetForDate(migrateState(importedState, today()), today()));
    showToast('Backup restored.');
  } catch (error) {
    console.error(error);
    showToast('Could not restore that backup.');
  }
}

function handleTextForm(form, input, action) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    updateState(action(state, value));
    input.value = '';
  });
}

function wireDropZones() {
  for (const zone of document.querySelectorAll('.drop-zone')) {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('drag-over');
      const taskId = event.dataTransfer.getData('text/plain');
      const status = zone.dataset.dropStatus;
      if (!taskId || !status) {
        return;
      }

      if (status === 'active') {
        activateTask(taskId);
      } else if (status === 'finished') {
        finishTask(taskId);
      } else {
        updateState(moveTask(state, taskId, status));
      }
    });
  }
}

handleTextForm(elements.todoForm, elements.todoInput, addTodo);
handleTextForm(elements.parkingForm, elements.parkingInput, (currentState, text) => {
  const next = addTodo(currentState, text);
  const task = next.tasks.at(-1);
  return task ? moveTask(next, task.id, 'parked') : next;
});
handleTextForm(elements.winForm, elements.winInput, addWin);

elements.notesInput.addEventListener('input', () => {
  elements.savedIndicator.textContent = 'Saving...';
  updateState(setActiveTaskNotes(state, elements.notesInput.value));
});

elements.targetMinutesInput.addEventListener('change', () => {
  updateState(setTimerMinutes(state, elements.targetMinutesInput.value));
});

elements.targetMinutesInput.addEventListener('input', () => {
  elements.targetMinutesInput.value = elements.targetMinutesInput.value.replace(/\D/g, '').slice(0, 3);
});

elements.targetMinutesInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    elements.targetMinutesInput.blur();
  }
});

elements.timerMinus.addEventListener('click', () => {
  updateState(setTimerMinutes(state, state.timer.minutes - 5));
});

elements.timerPlus.addEventListener('click', () => {
  updateState(setTimerMinutes(state, state.timer.minutes + 5));
});

elements.timerToggle.addEventListener('click', handleTimerPrimaryAction);
elements.timerStop.addEventListener('click', stopAsNotFinished);
elements.notFinishedButton.addEventListener('click', stopAsNotFinished);
elements.finishedButton.addEventListener('click', finishActiveTask);
elements.newDayButton.addEventListener('click', () => updateState(startFreshDay(state)));
elements.exportButton.addEventListener('click', exportData);
elements.restoreButton.addEventListener('click', promptForRestore);
elements.restoreInput.addEventListener('change', restoreFromBackup);
elements.finishVideo.addEventListener('ended', () => {
  stopFinishVideo();
  elements.videoCelebration.classList.remove('show');
});
elements.videoCelebration.addEventListener('click', () => {
  stopFinishVideo();
  elements.videoCelebration.classList.remove('show');
});

function startTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 500);
}

wireDropZones();
render();
saveState();
startTimerLoop();

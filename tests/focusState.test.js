import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addTodo,
  addDistraction,
  addWin,
  completeActiveTask,
  createInitialState,
  dateKeyFromLocalDate,
  finishFocusSession,
  moveTask,
  resetForDate,
  setActiveTaskNotes,
  startFocusSession,
  startFreshDay,
} from '../src/focusState.js';

test('formats local dates as stable day keys', () => {
  assert.equal(dateKeyFromLocalDate(new Date(2026, 4, 8, 23, 30)), '2026-05-08');
});

test('keeps an unlimited open to do list with creation timestamps', () => {
  let state = createInitialState('2026-05-08');

  state = addTodo(state, 'Ship dashboard skeleton', '2026-05-08T09:00:00.000Z');
  state = addTodo(state, 'Write timer behavior', '2026-05-08T09:05:00.000Z');
  state = addTodo(state, 'Polish mobile layout', '2026-05-08T09:10:00.000Z');
  state = addTodo(state, 'This should fit too', '2026-05-08T09:15:00.000Z');

  assert.deepEqual(
    state.tasks.map((item) => item.text),
    ['Ship dashboard skeleton', 'Write timer behavior', 'Polish mobile layout', 'This should fit too'],
  );
  assert.equal(state.tasks[0].createdAt, '2026-05-08T09:00:00.000Z');
});

test('moves tasks between to do and parking lot', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Maybe later', '2026-05-08T09:00:00.000Z');
  const taskId = state.tasks[0].id;

  state = moveTask(state, taskId, 'parked', '2026-05-08T09:01:00.000Z');
  assert.equal(state.tasks[0].status, 'parked');

  state = moveTask(state, taskId, 'todo', '2026-05-08T09:02:00.000Z');
  assert.equal(state.tasks[0].status, 'todo');
  assert.deepEqual(
    state.tasks[0].events.map((event) => event.type),
    ['created', 'moved', 'moved'],
  );
});

test('records planned and actual focus time on the active task', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Make the thing real', '2026-05-08T09:00:00.000Z');
  const taskId = state.tasks[0].id;

  state = startFocusSession(state, taskId, 25, '2026-05-08T09:10:00.000Z');
  state = setActiveTaskNotes(state, 'Found the first move.');
  state = finishFocusSession(state, 'not_finished', '2026-05-08T09:27:30.000Z');

  const task = state.tasks[0];
  assert.equal(task.status, 'todo');
  assert.equal(task.notes, 'Found the first move.');
  assert.equal(task.focusSessions[0].plannedMinutes, 25);
  assert.equal(task.focusSessions[0].actualSeconds, 1050);
  assert.equal(task.focusSessions[0].result, 'not_finished');
  assert.equal(state.activeTaskId, null);
});

test('moves an active task back to open when stopped before the timer starts', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Interrupted before start', '2026-05-08T09:00:00.000Z');
  const taskId = state.tasks[0].id;

  state = moveTask(state, taskId, 'active', '2026-05-08T09:02:00.000Z');
  state = finishFocusSession(state, 'not_finished', '2026-05-08T09:03:00.000Z');

  assert.equal(state.tasks[0].status, 'todo');
  assert.equal(state.activeTaskId, null);
});


test('finishes the active task by moving it to wins with timestamps and notes', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Make the thing real', '2026-05-08T09:00:00.000Z');
  const taskId = state.tasks[0].id;

  state = startFocusSession(state, taskId, 15, '2026-05-08T10:00:00.000Z');
  state = setActiveTaskNotes(state, 'Wrapped it up.');
  state = completeActiveTask(state, '2026-05-08T10:12:00.000Z');

  const task = state.tasks[0];
  assert.equal(task.status, 'finished');
  assert.equal(task.finishedAt, '2026-05-08T10:12:00.000Z');
  assert.equal(task.focusSessions[0].result, 'finished');
  assert.equal(task.focusSessions[0].actualSeconds, 720);
  assert.equal(state.wins[0].taskId, taskId);
  assert.equal(state.wins[0].text, 'Make the thing real');
});

test('tracks manual wins and parked thoughts without mutating prior state', () => {
  const original = createInitialState('2026-05-08');

  let state = addDistraction(original, 'Check that unrelated tab later');
  state = addWin(state, 'Started with a working vertical slice');

  assert.deepEqual(original.tasks, []);
  assert.equal(state.distractions[0].text, 'Check that unrelated tab later');
  assert.equal(state.wins[0].text, 'Started with a working vertical slice');
});

test('starts a fresh day while carrying yesterday into history', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Close out Friday', '2026-05-08T09:00:00.000Z');
  state = addWin(state, 'Kept the scope small');

  const next = resetForDate(state, '2026-05-09');

  assert.equal(next.date, '2026-05-09');
  assert.deepEqual(next.tasks, []);
  assert.deepEqual(next.wins, []);
  assert.equal(next.history[0].date, '2026-05-08');
  assert.equal(next.history[0].tasks[0].text, 'Close out Friday');
});

test('can intentionally clear the current day and preserve it in history', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Reset the board', '2026-05-08T09:00:00.000Z');
  state = addDistraction(state, 'Remember this later');

  const next = startFreshDay(state);

  assert.equal(next.date, '2026-05-08');
  assert.deepEqual(next.tasks, []);
  assert.deepEqual(next.distractions, []);
  assert.equal(next.history[0].date, '2026-05-08');
  assert.equal(next.history[0].tasks[0].text, 'Reset the board');
});

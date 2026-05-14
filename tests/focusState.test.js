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

test('starts a new calendar day while carrying unfinished tasks forward', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Close out Friday', '2026-05-08T09:00:00.000Z');
  state = addWin(state, 'Kept the scope small');

  const next = resetForDate(state, '2026-05-09');

  assert.equal(next.date, '2026-05-09');
  assert.equal(next.tasks[0].text, 'Close out Friday');
  assert.equal(next.tasks[0].status, 'todo');
  assert.deepEqual(next.wins, []);
  assert.equal(next.history[0].date, '2026-05-08');
  assert.deepEqual(next.history[0].tasks, []);
  assert.equal(next.history[0].wins[0].text, 'Kept the scope small');
});

test('keeps focused unfinished tasks in history and open tasks on calendar rollover', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Continue tomorrow', '2026-05-08T09:00:00.000Z');
  state = startFocusSession(state, state.tasks[0].id, 25, '2026-05-08T09:05:00.000Z');
  state = finishFocusSession(state, 'not_finished', '2026-05-08T09:20:00.000Z');

  const next = resetForDate(state, '2026-05-09');

  assert.equal(next.tasks[0].text, 'Continue tomorrow');
  assert.equal(next.tasks[0].status, 'todo');
  assert.equal(next.history[0].tasks[0].text, 'Continue tomorrow');
  assert.equal(next.history[0].tasks[0].focusSessions[0].result, 'not_finished');
});

test('recovers unfinished tasks from prior history when a previous build cleared the board', () => {
  const state = {
    ...createInitialState('2026-05-09'),
    history: [
      {
        date: '2026-05-08',
        tasks: [
          {
            id: 'task-1',
            text: 'Recovered task',
            createdAt: '2026-05-08T09:00:00.000Z',
            status: 'todo',
            finishedAt: null,
            notes: '',
            focusSessions: [],
            events: [],
          },
        ],
        distractions: [],
        wins: [],
        notes: '',
      },
    ],
  };

  const next = resetForDate(state, '2026-05-09');

  assert.equal(next.tasks[0].text, 'Recovered task');
  assert.equal(next.tasks[0].status, 'todo');
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

test('fresh day merges with an existing same-day history entry', () => {
  let state = createInitialState('2026-05-08');
  state = addTodo(state, 'Morning task', '2026-05-08T09:00:00.000Z');
  state = startFreshDay(state);
  state = addTodo(state, 'Afternoon task', '2026-05-08T14:00:00.000Z');

  const next = startFreshDay(state);

  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].date, '2026-05-08');
  assert.deepEqual(
    next.history[0].tasks.map((task) => task.text),
    ['Afternoon task', 'Morning task'],
  );
});

test('history keeps up to 31 archived days', () => {
  let state = createInitialState('2026-05-01');

  for (let day = 1; day <= 33; day += 1) {
    const date = `2026-05-${String(day).padStart(2, '0')}`;
    state = {
      ...state,
      date,
      tasks: [],
      wins: [],
      distractions: [],
      notes: '',
    };
    state = addTodo(state, `Task ${day}`, `${date}T09:00:00.000Z`);
    state = resetForDate(state, `2026-06-${String(day).padStart(2, '0')}`);
  }

  assert.equal(state.history.length, 31);
  assert.equal(state.history[0].date, '2026-05-33');
  assert.equal(state.history.at(-1).date, '2026-05-03');
});

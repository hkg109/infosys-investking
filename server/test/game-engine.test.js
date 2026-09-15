import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { GAME_PHASE, GAME_STATUS, GameEngine, GameStateError } from '../src/game-engine.js'

function createTestEngine(options = {}) {
  let currentTime = 0
  const engine = new GameEngine({
    now: () => currentTime,
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
    totalRounds: 2,
    roundDurationMs: 600_000,
    tradingDurationMs: 540_000,
    ...options,
  })
  return { engine, setTime: (value) => { currentTime = value } }
}

test('server clock closes trading, advances rounds, and finishes the game', () => {
  const { engine, setTime } = createTestEngine()
  const events = []
  engine.on('game-event', ({ name }) => events.push(name))

  const started = engine.start()
  assert.equal(started.status, GAME_STATUS.RUNNING)
  assert.equal(started.phase, GAME_PHASE.TRADING)
  assert.equal(started.currentRound, 1)
  assert.equal(started.tradingEnabled, true)
  assert.equal(started.remainingSeconds, 540)
  assert.deepEqual(events, ['game:start', 'round:start', 'trading:open'])

  setTime(540_000)
  const resultPhase = engine.getSnapshot()
  assert.equal(resultPhase.phase, GAME_PHASE.RESULT)
  assert.equal(resultPhase.tradingEnabled, false)
  assert.equal(resultPhase.remainingSeconds, 60)
  assert.equal(events.at(-1), 'trading:close')

  setTime(600_000)
  const secondRound = engine.getSnapshot()
  assert.equal(secondRound.currentRound, 2)
  assert.equal(secondRound.phase, GAME_PHASE.TRADING)
  assert.deepEqual(events.slice(-3), ['round:end', 'round:start', 'trading:open'])

  setTime(1_200_000)
  const finished = engine.getSnapshot()
  assert.equal(finished.status, GAME_STATUS.FINISHED)
  assert.equal(finished.phase, GAME_PHASE.FINISHED)
  assert.equal(finished.tradingEnabled, false)
  assert.equal(finished.finishedAt, new Date(1_200_000).toISOString())
  assert.deepEqual(events.slice(-3), ['trading:close', 'round:end', 'game:end'])
})

test('pause freezes the phase clock and resume continues from the same point', () => {
  const { engine, setTime } = createTestEngine()
  const events = []
  engine.on('game-event', ({ name }) => events.push(name))
  engine.start()

  setTime(100_000)
  const paused = engine.pause()
  assert.equal(paused.status, GAME_STATUS.PAUSED)
  assert.equal(paused.phase, GAME_PHASE.PAUSED)
  assert.equal(paused.phaseBeforePause, GAME_PHASE.TRADING)
  assert.equal(paused.remainingSeconds, 440)
  assert.equal(paused.tradingEnabled, false)

  setTime(300_000)
  assert.equal(engine.getSnapshot().remainingSeconds, 440)

  const resumed = engine.resume()
  assert.equal(resumed.status, GAME_STATUS.RUNNING)
  assert.equal(resumed.phase, GAME_PHASE.TRADING)
  assert.equal(resumed.remainingSeconds, 440)
  assert.equal(resumed.tradingEnabled, true)
  assert.deepEqual(events.slice(-3), ['game:pause', 'game:resume', 'trading:open'])

  setTime(740_000)
  assert.equal(engine.getSnapshot().phase, GAME_PHASE.RESULT)
})

test('invalid state transitions are rejected', () => {
  const { engine } = createTestEngine()
  assert.throws(() => engine.pause(), (error) => error instanceof GameStateError && error.status === GAME_STATUS.WAITING)
  engine.start()
  assert.throws(() => engine.start(), (error) => error instanceof GameStateError && error.action === 'start')
  engine.end()
  assert.throws(() => engine.resume(), (error) => error instanceof GameStateError && error.status === GAME_STATUS.FINISHED)
})

test('automatic scheduler processes trading and round deadlines', { timeout: 1000 }, async (t) => {
  const engine = new GameEngine({
    totalRounds: 1,
    roundDurationMs: 80,
    tradingDurationMs: 40,
    setTimer: (callback, delay) => ({ timer: setTimeout(callback, delay) }),
    clearTimer: (handle) => clearTimeout(handle.timer),
  })
  t.after(() => engine.shutdown())

  const tradingClosed = once(engine, 'game-event').then(async ([event]) => {
    if (event.name === 'trading:close') return event
    while (true) {
      const [nextEvent] = await once(engine, 'game-event')
      if (nextEvent.name === 'trading:close') return nextEvent
    }
  })
  const finished = new Promise((resolve) => {
    engine.on('game-event', (event) => {
      if (event.name === 'game:end') resolve(event)
    })
  })

  engine.start()
  assert.equal((await tradingClosed).payload.phase, GAME_PHASE.RESULT)
  assert.equal((await finished).payload.status, GAME_STATUS.FINISHED)
})

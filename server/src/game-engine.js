import { EventEmitter } from 'node:events'

export const GAME_STATUS = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
})

export const GAME_PHASE = Object.freeze({
  WAITING: 'WAITING',
  TRADING: 'TRADING',
  RESULT: 'RESULT',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
})

export class GameStateError extends Error {
  constructor(action, status) {
    super(`Cannot ${action} a game in ${status}`)
    this.name = 'GameStateError'
    this.code = 'INVALID_GAME_STATE'
    this.action = action
    this.status = status
  }
}

export class GameEngine extends EventEmitter {
  constructor({
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    totalRounds = 12,
    roundDurationMs = 10 * 60 * 1000,
    tradingDurationMs = 9 * 60 * 1000,
    initialState = null,
  } = {}) {
    super()
    if (!Number.isInteger(totalRounds) || totalRounds < 1) throw new TypeError('totalRounds must be a positive integer')
    if (!Number.isInteger(roundDurationMs) || roundDurationMs < 2) throw new TypeError('roundDurationMs must be an integer greater than 1')
    if (!Number.isInteger(tradingDurationMs) || tradingDurationMs < 1 || tradingDurationMs >= roundDurationMs) {
      throw new TypeError('tradingDurationMs must be shorter than roundDurationMs')
    }

    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.totalRounds = totalRounds
    this.roundDurationMs = roundDurationMs
    this.tradingDurationMs = tradingDurationMs
    this.timer = null
    this.status = GAME_STATUS.WAITING
    this.phase = GAME_PHASE.WAITING
    this.currentRound = 0
    this.startedAt = null
    this.roundStartedAt = null
    this.deadlineAt = null
    this.finishedAt = null
    this.pausedAt = null
    this.pausedPhase = null
    this.pausedRemainingMs = null
    if (initialState) this._restore(initialState)
  }

  start() {
    if (this.status !== GAME_STATUS.WAITING) throw new GameStateError('start', this.status)
    const now = this.now()
    this.status = GAME_STATUS.RUNNING
    this.startedAt = now
    this.finishedAt = null
    this._beginRound(1, now)
    this._emit('game:start', now)
    this._emit('round:start', now)
    this._emit('trading:open', now)
    this._schedule(now)
    return this._snapshot(now)
  }

  pause() {
    this._sync()
    if (this.status !== GAME_STATUS.RUNNING) throw new GameStateError('pause', this.status)
    const now = this.now()
    this.pausedAt = now
    this.pausedPhase = this.phase
    this.pausedRemainingMs = Math.max(0, this.deadlineAt - now)
    this.status = GAME_STATUS.PAUSED
    this.phase = GAME_PHASE.PAUSED
    this._cancelTimer()
    this._emit('game:pause', now)
    return this._snapshot(now)
  }

  resume() {
    if (this.status !== GAME_STATUS.PAUSED) throw new GameStateError('resume', this.status)
    const now = this.now()
    const pauseDuration = now - this.pausedAt
    this.roundStartedAt += pauseDuration
    this.deadlineAt = now + this.pausedRemainingMs
    this.status = GAME_STATUS.RUNNING
    this.phase = this.pausedPhase
    this.pausedAt = null
    this.pausedPhase = null
    this.pausedRemainingMs = null
    this._emit('game:resume', now)
    if (this.phase === GAME_PHASE.TRADING) this._emit('trading:open', now)
    this._schedule(now)
    return this._snapshot(now)
  }

  end() {
    this._sync()
    if (this.status !== GAME_STATUS.RUNNING && this.status !== GAME_STATUS.PAUSED) {
      throw new GameStateError('end', this.status)
    }
    const now = this.now()
    this._finish(now)
    return this._snapshot(now)
  }

  reset() {
    this._sync()
    if (this.status !== GAME_STATUS.FINISHED) throw new GameStateError('reset', this.status)
    const now = this.now()
    this._cancelTimer()
    this.status = GAME_STATUS.WAITING
    this.phase = GAME_PHASE.WAITING
    this.currentRound = 0
    this.startedAt = null
    this.roundStartedAt = null
    this.deadlineAt = null
    this.finishedAt = null
    this.pausedAt = null
    this.pausedPhase = null
    this.pausedRemainingMs = null
    this._emit('game:reset', now)
    return this._snapshot(now)
  }

  getSnapshot() {
    this._sync()
    return this._snapshot(this.now())
  }

  shutdown() {
    this._cancelTimer()
    this.removeAllListeners()
  }

  _restore(state) {
    if (!Object.values(GAME_STATUS).includes(state.status) || !Object.values(GAME_PHASE).includes(state.phase)) {
      throw new TypeError('Invalid persisted game state')
    }
    this.status = state.status
    this.phase = state.phase
    this.totalRounds = state.totalRounds
    this.roundDurationMs = state.roundDurationMs
    this.tradingDurationMs = state.tradingDurationMs
    this.currentRound = state.currentRound
    this.startedAt = state.startedAt
    this.roundStartedAt = state.roundStartedAt
    this.deadlineAt = state.deadlineAt
    this.finishedAt = state.finishedAt
    this.pausedAt = state.pausedAt
    this.pausedPhase = state.phaseBeforePause
    this.pausedRemainingMs = state.pausedRemainingMs
    if (this.status === GAME_STATUS.RUNNING) this._sync()
  }

  _beginRound(round, startedAt) {
    this.currentRound = round
    this.roundStartedAt = startedAt
    this.phase = GAME_PHASE.TRADING
    this.deadlineAt = startedAt + this.tradingDurationMs
  }

  _sync() {
    if (this.status !== GAME_STATUS.RUNNING) return
    const now = this.now()
    let transitions = 0

    while (this.status === GAME_STATUS.RUNNING && this.deadlineAt <= now) {
      if (this.phase === GAME_PHASE.TRADING) {
        const transitionAt = this.deadlineAt
        this.phase = GAME_PHASE.RESULT
        this.deadlineAt = this.roundStartedAt + this.roundDurationMs
        this._emit('trading:close', transitionAt)
      } else {
        const transitionAt = this.deadlineAt
        this._emit('round:end', transitionAt)
        if (this.currentRound >= this.totalRounds) {
          this._finish(transitionAt)
        } else {
          this._beginRound(this.currentRound + 1, transitionAt)
          this._emit('round:start', transitionAt)
          this._emit('trading:open', transitionAt)
        }
      }

      transitions += 1
      if (transitions > this.totalRounds * 2 + 1) throw new Error('Game timer transition limit exceeded')
    }

    this._schedule(now)
  }

  _finish(at) {
    this._cancelTimer()
    this.status = GAME_STATUS.FINISHED
    this.phase = GAME_PHASE.FINISHED
    this.deadlineAt = null
    this.finishedAt = at
    this.pausedAt = null
    this.pausedPhase = null
    this.pausedRemainingMs = null
    this._emit('game:end', at)
  }

  _schedule(now) {
    this._cancelTimer()
    if (this.status !== GAME_STATUS.RUNNING) return
    const delay = Math.max(0, this.deadlineAt - now)
    this.timer = this.setTimer(() => {
      this.timer = null
      this._sync()
    }, delay)
    this.timer?.unref?.()
  }

  _cancelTimer() {
    if (this.timer !== null) this.clearTimer(this.timer)
    this.timer = null
  }

  _emit(name, at) {
    this.emit('game-event', { name, payload: this._snapshot(at) })
  }

  _snapshot(now) {
    const isRunning = this.status === GAME_STATUS.RUNNING
    const remainingMs = isRunning
      ? Math.max(0, this.deadlineAt - now)
      : this.status === GAME_STATUS.PAUSED ? this.pausedRemainingMs : null

    return {
      status: this.status,
      phase: this.phase,
      phaseBeforePause: this.status === GAME_STATUS.PAUSED ? this.pausedPhase : null,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      roundDurationSeconds: this.roundDurationMs / 1000,
      tradingDurationSeconds: this.tradingDurationMs / 1000,
      tradingEnabled: isRunning && this.phase === GAME_PHASE.TRADING,
      remainingSeconds: remainingMs === null ? null : Math.ceil(remainingMs / 1000),
      startedAt: this.startedAt === null ? null : new Date(this.startedAt).toISOString(),
      roundStartedAt: this.roundStartedAt === null ? null : new Date(this.roundStartedAt).toISOString(),
      phaseEndsAt: isRunning ? new Date(this.deadlineAt).toISOString() : null,
      pausedAt: this.pausedAt === null ? null : new Date(this.pausedAt).toISOString(),
      finishedAt: this.finishedAt === null ? null : new Date(this.finishedAt).toISOString(),
      serverTime: new Date(now).toISOString(),
    }
  }
}

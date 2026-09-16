export class MarketHaltedError extends Error {
  constructor() {
    super('MARKET_HALTED')
    this.name = 'MarketHaltedError'
    this.code = 'MARKET_HALTED'
  }
}

export function createMarketGate() {
  let halted = false
  let activeOrders = 0
  const idleWaiters = new Set()

  function notifyIdle() {
    if (activeOrders !== 0) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  return {
    admit() {
      if (halted) throw new MarketHaltedError()
      activeOrders += 1
      let released = false
      return () => {
        if (released) return
        released = true
        activeOrders -= 1
        notifyIdle()
      }
    },

    async halt() {
      halted = true
      if (activeOrders === 0) return
      await new Promise((resolve) => idleWaiters.add(resolve))
    },

    resume() {
      halted = false
    },

    isHalted: () => halted,
    activeOrders: () => activeOrders,
  }
}

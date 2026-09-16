import { findSessionUser, publicUser, readSessionTokens } from './session-auth.js'
import { AUTHENTICATED_RANKING_ROOM, rankingUserRoom } from './ranking-rooms.js'

export function createSocketSessionMiddleware(database) {
  return async (socket, next) => {
    try {
      if (!database || readSessionTokens({ headers: socket.handshake.headers }).length === 0) return next()
      const user = await findSessionUser(database, { headers: socket.handshake.headers })
      if (user) socket.data.user = publicUser(user)
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function createPresenceTracker(io) {
  const connections = new Map()

  function emitPresence() {
    io.emit('participants:presence', { onlineParticipants: connections.size })
  }

  function connect(socket) {
    const user = socket.data.user
    if (!user || user.role !== 'USER') return
    const sockets = connections.get(user.userId) || new Set()
    const wasOffline = sockets.size === 0
    sockets.add(socket.id)
    connections.set(user.userId, sockets)
    socket.join(`user:${user.userId}`)
    socket.join(AUTHENTICATED_RANKING_ROOM)
    socket.join(rankingUserRoom(user.userId))
    socket.emit('session:ready', { user })
    if (wasOffline) emitPresence()

    socket.on('disconnect', () => {
      const current = connections.get(user.userId)
      if (!current) return
      current.delete(socket.id)
      if (current.size > 0) return
      connections.delete(user.userId)
      emitPresence()
    })
  }

  function disconnectUsers(userIds) {
    for (const userId of userIds) {
      for (const socketId of [...(connections.get(userId) || [])]) {
        io.sockets.sockets.get(socketId)?.disconnect(true)
      }
    }
  }

  return {
    connect,
    disconnectAll: () => disconnectUsers([...connections.keys()]),
    disconnectUsers,
    isOnline: (userId) => connections.has(userId),
    onlineCount: () => connections.size,
    userIds: () => [...connections.keys()],
  }
}

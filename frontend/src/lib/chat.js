/** ¿El mensaje es mío? Los jugadores se distinguen por color; los espectadores, por nombre. */
export function isMine(message, room, myName) {
  const myColor = room.you.color;
  if (myColor) return message.role === myColor;
  return message.role === 'spectator' && message.name === myName;
}

export const CHAT_MAX = 300;

export const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

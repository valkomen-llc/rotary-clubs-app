// Helpers de zona horaria SIN dependencias externas (usa Intl, disponible en Node).
// Todos los instantes de citas se guardan en UTC. La disponibilidad del equipo
// se define en minutos desde medianoche en la tz base (TrainingConfig.timezone).
// Convertir wall-clock (hora local del equipo) ↔ UTC es la pieza delicada del
// módulo, por eso vive centralizada acá.

// Offset (ms) de la tz en un instante dado: utcEquivalente(wall) - instante.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - date.getTime();
}

// Convierte una hora de pared (año/mes/día + minutos desde medianoche) expresada
// en `timeZone` al instante UTC correspondiente. Dos iteraciones para ser robusto
// alrededor de cambios de horario de verano (DST).
export function zonedWallToUtc(year, month, day, minutesFromMidnight, timeZone) {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMs(new Date(utcGuess), timeZone);
    const corrected = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
    if (corrected === utcGuess) break;
    utcGuess = corrected;
  }
  return new Date(utcGuess);
}

// Descompone un instante UTC en las partes de pared de `timeZone`.
export function utcToZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday],
    minutesFromMidnight: Number(map.hour) * 60 + Number(map.minute),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

// Clave de fecha local (YYYY-MM-DD) para un instante UTC en una tz.
export function localDateKey(date, timeZone) {
  return utcToZonedParts(date, timeZone).dateKey;
}

// Etiqueta legible de la hora en una tz (ej "9:00 a. m.").
export function formatZoned(date, timeZone, opts = {}) {
  return new Intl.DateTimeFormat('es', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(date);
}

import type { Game, GameStatus, GroupOutcome, GroupState } from './types'

export const TEAM_HEX: Record<string, string> = {
  red: '#f72585',
  blue: '#3158f5',
  green: '#22c55e',
  yellow: '#ffd51a',
  purple: '#8337ed',
  orange: '#ff6b16',
}

export const TEAM_NAME: Record<string, string> = {
  red: 'Rosa',
  blue: 'Azul',
  green: 'Verde',
  yellow: 'Amarillo',
  purple: 'Morado',
  orange: 'Naranja',
}

export const teamHex = (color?: string | null) => (color ? (TEAM_HEX[color] ?? '#111111') : '#111111')
export const teamName = (color?: string | null) => (color ? (TEAM_NAME[color] ?? color) : '—')

/** Fases que tienen un reloj corriendo. */
export const isTimed = (s: GameStatus) => s === 'question' || s === 'trial' || s === 'betrayal' || s === 'variant'

/** Duración total de la fase en curso (para dibujar el anillo del reloj). */
export const phaseTotalMs = (g: Pick<Game, 'phase_ms' | 'duration_ms'>) => g.phase_ms ?? g.duration_ms

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  hard: 'En la ronda difícil',
  dispute: 'En disputa',
  escaped: 'Escapó',
  lone_winner: 'Un traidor escapó solo',
  wiped: 'Aniquilado',
  trap: 'En la ronda difícil',
  reset: 'Nivel cero',
}

export const VARIANT_NAME = {
  A: 'Duelo de traidores',
  B: 'Segunda vuelta',
  C: 'Acusación',
} as const

/** Mensaje dramático para los compañeros, en tercera persona. La víctima ve el texto original. */
const THIRD_PERSON: Array<[RegExp, (n: string) => string]> = [
  [/aplastado/i, (n) => `${n} fue aplastado por la puerta.`],
  [/incineró/i, (n) => `El láser de seguridad incineró a ${n}.`],
  [/pinchos/i, (n) => `${n} cayó en la trampa de pinchos.`],
  [/gas tóxico/i, (n) => `El gas tóxico alcanzó a ${n}.`],
  [/corriente eléctrica/i, (n) => `La corriente eléctrica noqueó a ${n}.`],
  [/pozo/i, (n) => `El pozo sin fondo se tragó a ${n}.`],
  [/techo/i, (n) => `El techo se vino abajo sobre ${n}.`],
  [/niebla/i, (n) => `La niebla ácida devoró a ${n}.`],
  [/suelo se abri/i, (n) => `El suelo se abrió bajo los pies de ${n}.`],
  [/cuchilla/i, (n) => `Una cuchilla alcanzó a ${n} en la oscuridad.`],
  [/silencio/i, (n) => `El silencio de la sala venció a ${n}.`],
  [/reja/i, (n) => `La reja se cerró de golpe sobre ${n}.`],
  [/cobró doble|dos víctimas|onda expansiva/i, (n) => `${n} cayó arrastrado por el error de su equipo.`],
  [/traicionado/i, (n) => `${n} fue traicionado y quedó atrás.`],
  [/anularon/i, (n) => `${n} cayó: los traidores se anularon entre sí.`],
  [/duelo/i, (n) => `${n} perdió el duelo de traidores.`],
  [/señalaron/i, (n) => `${n} fue señalado y expulsado por la puerta.`],
  [/acusaste/i, (n) => `${n} acusó a un inocente y fue castigado.`],
]

export function dramatize(name: string, reason: string): string {
  for (const [re, fn] of THIRD_PERSON) if (re.test(reason)) return fn(name)
  return `${name} fue eliminado.`
}

export function survivors(gs: GroupState | null) {
  return gs?.members.filter((m) => !m.eliminated) ?? []
}

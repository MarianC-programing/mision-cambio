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
export const isTimed = (s: GameStatus) => s === 'question' || s === 'trial' || s === 'betrayal'

/** Duración total de la fase en curso (para dibujar el anillo del reloj). */
export const phaseTotalMs = (g: Pick<Game, 'phase_ms' | 'duration_ms'>) => g.phase_ms ?? g.duration_ms

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  trap: 'En la prueba final',
  escaped: 'Escapó',
  lone_winner: 'Un traidor escapó solo',
  reset: 'Nivel cero',
  wiped: 'Aniquilado',
}

/** Mensaje dramático para los compañeros, en tercera persona. La víctima ve el texto original. */
const THIRD_PERSON: Array<[RegExp, (n: string) => string]> = [
  [/aplastado/i, (n) => `${n} fue aplastado por la puerta.`],
  [/incineró/i, (n) => `El láser de seguridad incineró a ${n}.`],
  [/pinchos/i, (n) => `${n} cayó en la trampa de pinchos.`],
  [/gas tóxico/i, (n) => `El gas tóxico alcanzó a ${n}.`],
  [/corriente eléctrica/i, (n) => `La corriente eléctrica noqueó a ${n}.`],
  [/pozo/i, (n) => `El pozo sin fondo se tragó a ${n}.`],
]

export function dramatize(name: string, reason: string): string {
  for (const [re, fn] of THIRD_PERSON) if (re.test(reason)) return fn(name)
  return `${name} fue eliminado.`
}

export function survivors(gs: GroupState | null) {
  return gs?.members.filter((m) => !m.eliminated) ?? []
}

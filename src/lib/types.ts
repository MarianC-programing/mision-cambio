export type GameStatus =
  | 'lobby'
  | 'question'
  | 'paused'
  | 'reveal'
  | 'betrayal'
  | 'betrayal_reveal'
  | 'variant'
  | 'variant_reveal'
  | 'trial'
  | 'trial_reveal'
  | 'finished'

/**
 * hard        -> está en la ronda difícil (o pasará a ella)
 * dispute     -> varios traidores: espera/juega la variante sorteada
 * escaped     -> terminó la ronda difícil con al menos un vivo: escapó
 * lone_winner -> un traidor salió solo
 * wiped       -> sin sobrevivientes
 * trap, reset -> obsoletos (prueba final de una pregunta); solo por compatibilidad
 */
export type GroupOutcome = 'hard' | 'dispute' | 'escaped' | 'lone_winner' | 'wiped' | 'trap' | 'reset'
export type Vote = 'share' | 'steal'
/** A duelo de traidores · B segunda vuelta · C acusación. */
export type Variant = 'A' | 'B' | 'C'

export interface PublicQuestion {
  index: number
  model: string
  prompt: string
  options: string[]
}

export interface RevealInfo {
  correct_index: number
  explanation: string
  counts: number[]
}

export interface Game {
  id: string
  code: string
  status: GameStatus
  q_index: number
  q_total: number
  hard_total: number
  betrayal_variant: Variant | null
  variant_round: number
  duration_ms: number
  phase_ms: number | null
  ends_at: string | null
  paused_remaining_ms: number | null
  current_question: PublicQuestion | null
  reveal: RevealInfo | null
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  game_id: string
  group_id: string | null
  name: string
  created_at: string
}

export interface Group {
  id: string
  game_id: string
  color: string
  key_count: number
  eliminated: boolean
  outcome: GroupOutcome | null
  winner_player_id: string | null
  traitor_count: number
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  player_id: string
  player_name: string
  eliminated: boolean
  eliminated_at: string | null
  elimination_reason: string | null
  escaped: boolean
  joined_at: string
}

export interface GroupKey {
  id: string
  group_id: string
  question_pos: number
  color: string
  earned_at: string
}

export interface MemberElimination {
  player_id: string
  player_name: string
  question_pos: number
  reason: string
  eliminated_at: string
}

export interface FinaleVote {
  group_id?: string
  player_id: string
  player_name: string
  vote: Vote
  auto: boolean
  round?: number
}

export interface DuelAnswer {
  group_id: string
  player_id: string
  player_name: string
  choice: number
  is_correct: boolean
  answered_at: string
}

export interface Accusation {
  group_id?: string
  accuser_name: string
  suspect_name: string
}

/** Estado privado del equipo del jugador (my_group_state). */
export interface GroupState {
  group: Group | null
  members: GroupMember[]
  keys: GroupKey[]
  eliminations: MemberElimination[]
  answered: boolean
  group_choice: number | null
  answered_by: string | null
  my_vote: Vote | null
  votes_cast: number
  /** Solo viene lleno cuando el administrador ya cerró la votación. */
  votes: FinaleVote[]
  /** Variante A: opción que elegí en el duelo (null si no participo o no respondí). */
  my_duel_choice: number | null
  duel_cast: number
  /** Variante C: a quién señalé (id del sospechoso). */
  my_accusation: string | null
  /** Variante C: acusaciones del equipo; solo se llenan cuando la fase ya se cerró. */
  accusations: Accusation[]
}

export interface GroupAnswer {
  id: string
  group_id: string
  question_pos: number
  choice: number
  answered_by: string | null
  answered_by_name: string
  answered_at: string
}

export interface AdminQuestion {
  id: string
  pos: number
  kind: 'door' | 'final' | 'hard'
  model: string
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface AdminGroup extends Group {
  members: GroupMember[]
}

export interface Snapshot {
  game: Game
  players: Player[]
  groups: AdminGroup[]
  group_answers: GroupAnswer[]
  finale_votes: FinaleVote[]
  duel_answers: DuelAnswer[]
  accusations: Accusation[]
  questions: AdminQuestion[]
  server_time: string
}

export interface Session {
  code: string
  gameId: string
  playerId: string
  token: string
  name: string
}

export type GameStatus =
  | 'lobby'
  | 'question'
  | 'paused'
  | 'reveal'
  | 'betrayal'
  | 'betrayal_reveal'
  | 'trial'
  | 'trial_reveal'
  | 'finished'

/**
 * trap        -> clasificó a la prueba final
 * escaped     -> superó la prueba final: el equipo escapó
 * lone_winner -> un traidor salió solo
 * reset       -> falló la prueba final: vuelve al nivel cero
 * wiped       -> sin sobrevivientes
 */
export type GroupOutcome = 'trap' | 'escaped' | 'lone_winner' | 'reset' | 'wiped'
export type Vote = 'share' | 'steal'

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
  kind: 'door' | 'final'
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

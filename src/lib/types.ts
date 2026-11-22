export type GameStatus = 'lobby' | 'question' | 'paused' | 'reveal' | 'finished'

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
  name: string
  score: number
  correct_count: number
  total_time_ms: number
  answers_count: number
  last_answer_at: string | null
  created_at: string
}

export interface AdminQuestion {
  id: string
  pos: number
  model: string
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface AdminAnswer {
  id: string
  player_id: string
  player_name: string
  question_pos: number
  choice: number
  is_correct: boolean
  elapsed_ms: number
  points: number
  created_at: string
}

export interface Snapshot {
  game: Game
  players: Player[]
  answers: AdminAnswer[]
  questions: AdminQuestion[]
  server_time: string
}

export interface MyAnswer {
  question_pos: number
  choice: number
  is_correct: boolean | null
  points: number | null
  elapsed_ms: number | null
}

export interface Session {
  code: string
  gameId: string
  playerId: string
  token: string
  name: string
}

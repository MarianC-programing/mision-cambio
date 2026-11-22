import { supabase } from './supabase'
import type { AdminQuestion, Game, MyAnswer, Player, Session, Snapshot } from './types'

const MESSAGES: Record<string, string> = {
  unauthorized: 'PIN incorrecto o sesión no válida.',
  game_not_found: 'No existe ninguna partida con ese código.',
  game_finished: 'Esa partida ya terminó.',
  invalid_name: 'Escribe un nombre de 1 a 24 caracteres.',
  name_taken: 'Ese nombre ya está en uso en la partida. Prueba con otro.',
  game_full: 'La partida está llena.',
  closed: 'El tiempo de esta pregunta ya terminó.',
  stale_question: 'Esa pregunta ya no está activa.',
  already_answered: 'Ya respondiste esta pregunta.',
  invalid_choice: 'Datos no válidos: revisa que no haya campos vacíos.',
  invalid_state: 'Esa acción no está disponible en el estado actual.',
  no_players: 'Aún no se ha unido ningún participante.',
  questions_incomplete: 'Faltan preguntas por configurar.',
  question_live: 'No puedes editar la pregunta que está en juego.',
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k))
    throw new ApiError(code ?? 'unknown', code ? MESSAGES[code] : 'Error de conexión. Reintenta.')
  }
  return data as T
}

/* ---------- Participantes ---------- */

export async function serverTime(): Promise<string> {
  return rpc<string>('server_time')
}

export async function joinGame(code: string, name: string): Promise<Session> {
  const r = await rpc<{ player_id: string; token: string; game_id: string; code: string }>('join_game', {
    p_code: code,
    p_name: name,
  })
  return { code: r.code, gameId: r.game_id, playerId: r.player_id, token: r.token, name: name.trim().replace(/\s+/g, ' ') }
}

export async function submitAnswer(s: Session, pos: number, choice: number): Promise<void> {
  await rpc('submit_answer', { p_player: s.playerId, p_token: s.token, p_pos: pos, p_choice: choice })
}

export async function myAnswers(s: Session): Promise<MyAnswer[]> {
  return rpc<MyAnswer[]>('my_answers', { p_player: s.playerId, p_token: s.token })
}

export async function fetchGame(gameId: string): Promise<Game | null> {
  const { data } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  return (data as Game | null) ?? null
}

export async function fetchPlayers(gameId: string): Promise<Player[]> {
  const { data } = await supabase.from('players').select('*').eq('game_id', gameId)
  return (data as Player[] | null) ?? []
}

/* ---------- Administrador ---------- */

export const adminQuestions = (pin: string) => rpc<AdminQuestion[]>('admin_questions', { p_pin: pin })
export const adminLatestGame = (pin: string) => rpc<Game | null>('admin_latest_game', { p_pin: pin })
export const adminCreateGame = (pin: string) => rpc<Game>('admin_create_game', { p_pin: pin })
export const adminSnapshot = (pin: string, game: string) => rpc<Snapshot>('admin_snapshot', { p_pin: pin, p_game: game })
export const adminStart = (pin: string, game: string) => rpc<Game>('admin_start', { p_pin: pin, p_game: game })
export const adminPause = (pin: string, game: string) => rpc<Game>('admin_pause', { p_pin: pin, p_game: game })
export const adminResume = (pin: string, game: string) => rpc<Game>('admin_resume', { p_pin: pin, p_game: game })
export const adminReveal = (pin: string, game: string) => rpc<Game>('admin_reveal', { p_pin: pin, p_game: game })
export const adminNext = (pin: string, game: string) => rpc<Game>('admin_next', { p_pin: pin, p_game: game })
export const adminFinish = (pin: string, game: string) => rpc<Game>('admin_finish', { p_pin: pin, p_game: game })
export const adminRemovePlayer = (pin: string, player: string) =>
  rpc<void>('admin_remove_player', { p_pin: pin, p_player: player })
export const adminSaveQuestion = (pin: string, q: AdminQuestion) =>
  rpc<void>('admin_save_question', {
    p_pin: pin,
    p_id: q.id,
    p_model: q.model,
    p_prompt: q.prompt,
    p_options: q.options,
    p_correct: q.correct_index,
    p_explanation: q.explanation,
  })

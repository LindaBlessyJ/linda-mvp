import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { ArrowLeft, Copy, Gamepad2, ShieldCheck, Sparkles } from 'lucide-react'

type GameId = 'truth' | 'choices' | 'quiz' | 'friendship' | 'dreams' | 'life'
type Player = { id: string; name: string; isHost: boolean }
type Question = { question: string; options?: string[]; answer?: string }
type GameState = {
  roomCode: string; hostId: string; players: Player[]; game: GameId | null
  index: number; round: number; answers: Record<string, string>
  votes: Record<string, string>; scores: Record<string, number>
  revealed: boolean; updatedAt: number
}
type Wire =
  | { type: 'STATE'; state: GameState }
  | { type: 'REQUEST_STATE' }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'ACTION'; playerId: string; action: string; value?: string }

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null

const getGuestId = (): string => {
  let id = sessionStorage.getItem('linda-guest-id')
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('linda-guest-id', id) }
  return id
}

const gameInfo: { id: GameId; name: string; icon: string; description: string }[] = [
  { id: 'truth', name: 'Truth or Dare', icon: '🎯', description: 'Friendly questions and fun challenges.' },
  { id: 'choices', name: 'Real-Life Choices', icon: '⚖️', description: 'Choose your path in real-life situations.' },
  { id: 'quiz', name: 'Quiz Battle', icon: '🧠', description: 'Answer questions and earn points.' },
  { id: 'friendship', name: 'Friendship Test', icon: '🤝', description: 'Explore trust, kindness and friendship.' },
  { id: 'dreams', name: 'Dreams & Future', icon: '🌟', description: 'Share goals and ideas for the future.' },
  { id: 'life', name: 'Life Mode', icon: '🌍', description: 'Make decisions in everyday situations.' },
]

const Q = (question: string, options?: string[], answer?: string): Question => ({ question, options, answer })

const questions: Record<GameId, Question[]> = {
  truth: [
    Q('TRUTH: What is one thing you wish people understood about you?'),
    Q('TRUTH: What quality do you value most in a friend?'),
    Q('TRUTH: What is something new you want to learn?'),
    Q('DARE: Say one thing you appreciate about someone in the room.'),
    Q('DARE: Describe your dream day in 20 seconds.'),
    Q('TRUTH: What is a small moment that made you happy recently?'),
  ],
  choices: [
    Q('Secure path or thoughtful risk for a dream?', ['Secure path', 'Thoughtful risk']),
    Q('When a friend is upset, what should come first?', ['Listen first', 'Give advice']),
    Q('What would you rather have?', ['More free time', 'More chances to learn']),
    Q('When a team disagrees, what helps most?', ['Honest discussion', 'Try a small solution']),
  ],
  quiz: [
    Q('Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 'Mars'),
    Q('How many sides does a hexagon have?', ['Five', 'Six', 'Seven', 'Eight'], 'Six'),
    Q('Which language runs natively in a browser?', ['JavaScript', 'C', 'SQL', 'Bash'], 'JavaScript'),
    Q('What does CPU stand for?', ['Central Processing Unit', 'Computer Power Utility', 'Core Program Unit', 'Central Program User'], 'Central Processing Unit'),
    Q('Which is the largest ocean?', ['Atlantic', 'Indian', 'Pacific', 'Arctic'], 'Pacific'),
  ],
  friendship: [
    Q('What makes someone a dependable friend?', ['Keeping promises', 'Being popular', 'Always agreeing', 'Buying gifts']),
    Q('How should friends handle a misunderstanding?', ['Talk respectfully', 'Ignore it forever', 'Spread rumours', 'Blame someone']),
    Q('What matters most in friendship?', ['Trust', 'Competition', 'Perfect agreement', 'Popularity']),
    Q('How can you support a friend having a hard day?', ['Listen and ask what they need', 'Force them to talk', 'Make fun of them', 'Compare problems']),
  ],
  dreams: [
    Q('What is one skill you would love to develop?'),
    Q('What positive impact would you like to make in your community?'),
    Q('What is one achievable goal for this year?'),
    Q('If you could learn from an expert, what would you ask?'),
  ],
  life: [
    Q('Your group project is late. What first?', ['Divide tasks fairly', 'Blame someone', 'Give up', 'Hide the problem']),
    Q('Someone is being left out. What now?', ['Invite them to join', 'Laugh along', 'Ignore them', 'Make assumptions']),
    Q('Feedback you disagree with. What helps?', ['Listen and consider it', 'Argue immediately', 'Ignore all feedback', 'Take it personally']),
    Q('Many tasks due soon. What first?', ['Prioritise tasks', 'Avoid everything', 'Choose randomly', 'Wait until the last minute']),
  ],
}

const getQuestion = (s: GameState | null): Question | null => {
  if (!s || !s.game) return null
  const list = questions[s.game]
  return list[s.index % list.length]
}

const newState = (roomCode: string, hostId: string, name: string): GameState => ({
  roomCode, hostId, players: [{ id: hostId, name, isHost: true }], game: null,
  index: 0, round: 0, answers: {}, votes: {}, scores: {}, revealed: false, updatedAt: Date.now(),
})

const randomCode = (): string => Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X')

export default function App() {
  const [screen, setScreen] = useState<'home' | 'room'>('home')
  const [nickname, setNickname] = useState(sessionStorage.getItem('linda-name') || '')
  const [roomInput, setRoomInput] = useState('')
  const [state, setState] = useState<GameState | null>(null)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState('')
  const [copied, setCopied] = useState(false)
  const [myId] = useState<string>(getGuestId)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const stateRef = useRef<GameState | null>(null)

  useEffect(() => { stateRef.current = state }, [state])

  const isHost = !!state && state.hostId === myId
  const question = getQuestion(state)
  const quiz = state?.game === 'quiz'
  const isWriting = state?.game === 'truth' || state?.game === 'dreams'
  const choices = !!question?.options

  const send = async (m: Wire) => {
    if (channelRef.current) await channelRef.current.send({ type: 'broadcast', event: 'game', payload: m })
  }

  const publish = async (next: GameState) => {
    next.updatedAt = Date.now()
    stateRef.current = next
    setState(next)
    await send({ type: 'STATE', state: next })
  }

  const applyAction = async (pid: string, act: string, value?: string) => {
    const c = stateRef.current
    if (!c || c.hostId !== myId) return
    const fresh = { answers: {}, votes: {}, revealed: false }
    if (act === 'START' && value && value in questions) {
      await publish({ ...c, game: value as GameId, index: 0, round: 1, ...fresh })
    } else if (act === 'NEXT' && c.game) {
      await publish({ ...c, index: (c.index + 1) % questions[c.game].length, round: c.round + 1, ...fresh })
    } else if (act === 'REVEAL') {
      await publish({ ...c, revealed: true })
    } else if (act === 'ANSWER' && value) {
      await publish({ ...c, answers: { ...c.answers, [pid]: value.slice(0, 500) } })
    } else if (act === 'VOTE' && value) {
      await publish({ ...c, votes: { ...c.votes, [pid]: value } })
    } else if (act === 'SCORE' && value && c.game === 'quiz') {
      if (c.answers[pid]) return
      const ok = value === getQuestion(c)?.answer
      await publish({
        ...c,
        answers: { ...c.answers, [pid]: value },
        scores: { ...c.scores, [pid]: (c.scores[pid] || 0) + (ok ? 1 : 0) },
      })
    } else if (act === 'RESET') {
      await publish({ ...c, game: null, ...fresh })
    }
  }

  const action = async (name: string, value?: string) => {
    if (!state) return
    if (isHost) await applyAction(myId, name, value)
    else await send({ type: 'ACTION', playerId: myId, action: name, value })
  }

  const joinRoom = async (code: string, create: boolean) => {
    const name = nickname.trim().replace(/[<>]/g, '').slice(0, 18)
    const roomCode = code.trim().toUpperCase()
    if (!name) { setError('Enter a nickname first.'); return }
    if (!create && !/^[A-Z0-9]{5}$/.test(roomCode)) { setError('Enter a valid 5-character room code.'); return }
    if (!supabase) { setError('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'); return }
    setBusy(true)
    setError('')
    sessionStorage.setItem('linda-name', name)
    try {
      if (channelRef.current) await supabase.removeChannel(channelRef.current)
      const channel = supabase.channel(`linda-room-${roomCode}`, {
        config: { broadcast: { self: false }, presence: { key: myId } },
      })
      channelRef.current = channel
      channel.on('broadcast', { event: 'game' }, ({ payload }) => {
        const m = payload as Wire
        const c = stateRef.current
        if (m.type === 'STATE') {
          if (!c || c.roomCode === m.state.roomCode) {
            stateRef.current = m.state
            setState(m.state)
            setScreen('room')
            setError('')
          }
        } else if (m.type === 'REQUEST_STATE' && c && c.hostId === myId) {
          void send({ type: 'STATE', state: c })
        } else if (m.type === 'PLAYER_JOIN' && c && c.hostId === myId) {
          const exists = c.players.some(p => p.id === m.player.id)
          if (!exists && c.players.length < 12) void publish({ ...c, players: [...c.players, m.player] })
          else if (exists) void send({ type: 'STATE', state: c })
        } else if (m.type === 'ACTION' && c && c.hostId === myId) {
          void applyAction(m.playerId, m.action, m.value)
        }
      })
      channel.on('presence', { event: 'sync' }, () => setConnected(true))
      await new Promise<void>((resolve, reject) => {
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Could not connect. Check your internet and Supabase settings.'))
        })
      })
      await channel.track({ id: myId, nickname: name, joinedAt: Date.now() })
      setConnected(true)
      if (create) {
        const first = newState(roomCode, myId, name)
        stateRef.current = first
        setState(first)
        await send({ type: 'STATE', state: first })
        setScreen('room')
      } else {
        await send({ type: 'REQUEST_STATE' })
        await send({ type: 'PLAYER_JOIN', player: { id: myId, name, isHost: false } })
        window.setTimeout(() => {
          if (!stateRef.current) setError('No host responded. Check the code or ask the host to reopen the room.')
        }, 3000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect to the room.')
      setConnected(false)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => {
    if (channelRef.current && supabase) void supabase.removeChannel(channelRef.current)
  }, [])

  const leave = async () => {
    if (channelRef.current && supabase) await supabase.removeChannel(channelRef.current)
    channelRef.current = null
    stateRef.current = null
    setState(null)
    setScreen('home')
    setConnected(false)
    setError('')
    setResponse('')
  }

  const copyCode = async () => {
    if (!state) return
    try {
      await navigator.clipboard.writeText(state.roomCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(`Room code: ${state.roomCode}. Copy it manually.`)
    }
  }

  const submitAnswer = () => {
    if (!response.trim()) return
    void action('ANSWER', response.trim())
    setResponse('')
  }

  if (screen === 'room' && state) {
    const game = gameInfo.find(g => g.id === state.game)
    const myAnswer = state.answers[myId]
    const myVote = state.votes[myId]
    return (
      <main className="app-shell">
        <header className="topbar">
          <button className="icon-btn" onClick={() => void leave()} aria-label="Leave room"><ArrowLeft size={18} /></button>
          <span className="brand"><span className="brand-mark"><Gamepad2 size={20} /></span> LINDA</span>
          <span className={`connection ${connected ? 'online' : ''}`}><span className="dot" /> {connected ? 'Connected' : 'Reconnecting'}</span>
        </header>

        <section className="room-layout">
          <div className="room-heading">
            <p className="eyebrow">YOUR PRIVATE GAME ROOM</p>
            <h1>Let the good times <span className="gradient-text">begin.</span></h1>
            <p className="muted">Share this code with your friends to play together.</p>
            <button className="room-code" onClick={() => void copyCode()}>
              <span>{state.roomCode}</span><Copy size={17} /><small>{copied ? 'Copied!' : 'Copy code'}</small>
            </button>
            {error && <p className="safe-note">{error}</p>}
          </div>

          <div className="game-grid">
            <section className="panel game-panel">
              {!state.game ? (
                <>
                  <div className="panel-top">
                    <div><p className="eyebrow">CHOOSE A GAME</p><h2>Pick your vibe</h2></div>
                    <Sparkles size={20} />
                  </div>
                  <p className="muted">Choose a game. Everyone in this room will see it.</p>
                  <div className="mode-grid">
                    {gameInfo.map(g => (
                      <button className="mode-card" key={g.id} disabled={!isHost} onClick={() => void action('START', g.id)}>
                        <span className="mode-icon">{g.icon}</span>
                        <strong>{g.name}</strong>
                        <small>{g.description}</small>
                      </button>
                    ))}
                  </div>
                  {!isHost && <p className="safe-note">The host chooses which game starts.</p>}
                </>
              ) : (
                <>
                  <div className="panel-top">
                    <div><p className="eyebrow">ROUND {state.round}</p><h2>{game?.icon} {game?.name}</h2></div>
                    <span className="pill"><Sparkles size={14} /> LIVE GAME</span>
                  </div>

                  <div className="prompt-card">
                    <span className="prompt-type">{quiz ? '🧠 QUIZ QUESTION' : '✨ YOUR QUESTION'}</span>
                    <p>{question?.question}</p>

                    {choices && (
                      <div className="choice-buttons">
                        {question?.options?.map(o => (
                          <button
                            key={o}
                            className={`choice ${(quiz ? state.revealed && o === question.answer : myVote === o) ? 'selected' : ''}`}
                            disabled={quiz ? !!myAnswer : false}
                            onClick={() => void action(quiz ? 'SCORE' : 'VOTE', o)}
                          >
                            <strong>{o}</strong>
                            {!quiz && myVote === o && <small>YOUR VOTE ✓</small>}
                          </button>
                        ))}
                      </div>
                    )}

                    {isWriting && (
                      <div className="answer-box">
                        <textarea
                          className="field"
                          placeholder="Write your answer (sharing is optional)…"
                          maxLength={500}
                          value={response}
                          onChange={e => setResponse(e.target.value)}
                        />
                        <button className="primary-btn" onClick={submitAnswer}>Share answer</button>
                      </div>
                    )}

                    {!choices && !isWriting && <p className="muted">Think about your answer, then share it with the group.</p>}

                    {myAnswer && !quiz && <p className="safe-note"><ShieldCheck size={15} /> Your response: {myAnswer}</p>}

                    {state.revealed && (
                      <div className="results">
                        <h3>Room responses</h3>
                        {state.players.map(p => (
                          <p key={p.id}>
                            <strong>{p.name}:</strong> {state.answers[p.id] || state.votes[p.id] || 'Skipped / not answered'}
                          </p>
                        ))}
                        {quiz && <p><strong>Correct answer:</strong> {question?.answer}</p>}
                      </div>
                    )}

                    {quiz && <p className="muted">Your score: {state.scores[myId] || 0}</p>}

                    <div className="prompt-actions">
                      <button className="secondary-btn" onClick={() => void action('REVEAL')}>Reveal results</button>
                      {isHost && <button className="primary-btn" onClick={() => void action('NEXT')}>Next question →</button>}
                    </div>
                    {!isHost && <p className="muted">The host advances to the next question.</p>}
                    <button className="secondary-btn" disabled={!isHost} onClick={() => void action('RESET')}>
                      Choose another game
                    </button>
                  </div>
                </>
              )}
            </section>

            <aside className="panel players-panel">
              <div className="panel-top"><div><p className="eyebrow">PLAYERS</p><h2>In this room</h2></div></div>
              {state.players.map(p => (
                <div className="turn-banner" key={p.id}>
                  <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{p.name}{p.id === myId ? ' (you)' : ''}</strong>
                    <small>{p.isHost ? 'HOST' : 'PLAYER'}</small>
                  </div>
                </div>
              ))}
            </aside>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <span className="brand"><span className="brand-mark"><Gamepad2 size={20} /></span> LINDA</span>
      </header>
      <section className="room-layout">
        <div className="room-heading">
          <p className="eyebrow">PLAY TOGETHER</p>
          <h1>Games with <span className="gradient-text">friends.</span></h1>
          <p className="muted">Create a private room or join one with a code.</p>
        </div>
        <section className="panel game-panel">
          <input className="field" placeholder="Your nickname" maxLength={18} value={nickname} onChange={e => setNickname(e.target.value)} />
          <button className="primary-btn" disabled={busy} onClick={() => void joinRoom(randomCode(), true)}>
            {busy ? 'Connecting…' : 'Create room'}
          </button>
          <p className="muted">or join an existing room</p>
          <input className="field" placeholder="5-character room code" maxLength={5} value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())} />
          <button className="secondary-btn" disabled={busy} onClick={() => void joinRoom(roomInput, false)}>Join room</button>
          {error && <p className="safe-note">{error}</p>}
        </section>
      </section>
    </main>
  )
      }

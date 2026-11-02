import { useEffect, useRef, useState } from 'react'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { ArrowLeft, Copy, Gamepad2, ShieldCheck, Sparkles } from 'lucide-react'

type GameId = 'truth' | 'choices' | 'quiz' | 'friendship' | 'dreams' | 'life'
type Player = { id: string; name: string; isHost: boolean }
type Question = { question: string; options?: string[]; answer?: string }
type GameState = {
  roomCode: string
  hostId: string
  players: Player[]
  game: GameId | null
  index: number
  round: number
  answers: Record<string, string>
  votes: Record<string, string>
  scores: Record<string, number>
  revealed: boolean
  updatedAt: number
}
type WireMessage =
  | { type: 'STATE'; state: GameState }
  | { type: 'REQUEST_STATE' }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'ACTION'; playerId: string; action: string; value?: string }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && anonKey ? createClient(url, anonKey) : null

const getGuestId = () => {
  const storageKey = 'linda-guest-id'
  let id = sessionStorage.getItem(storageKey)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(storageKey, id)
  }
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

const questions: Record<GameId, Question[]> = {
  truth: [
    { question: 'TRUTH: What is one thing you wish people understood about you?' },
    { question: 'TRUTH: What quality do you value most in a friend?' },
    { question: 'TRUTH: What is something new you want to learn?' },
    { question: 'DARE: Say one thing you appreciate about someone in the room.' },
    { question: 'DARE: Describe your dream day in 20 seconds.' },
    { question: 'TRUTH: What is a small moment that made you happy recently?' },
  ],
  choices: [
    { question: 'Would you choose a secure path or take a thoughtful risk for a dream?', options: ['Secure path', 'Thoughtful risk'] },
    { question: 'When a friend is upset, what should come first?', options: ['Listen first', 'Give advice'] },
    { question: 'What would you rather have?', options: ['More free time', 'More chances to learn'] },
    { question: 'When a team disagrees, what helps most?', options: ['Honest discussion', 'Try a small solution'] },
  ],
  quiz: [
    { question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 'Mars' },
    { question: 'How many sides does a hexagon have?', options: ['Five', 'Six', 'Seven', 'Eight'], answer: 'Six' },
    { question: 'Which language runs natively in a web browser?', options: ['JavaScript', 'C', 'SQL', 'Bash'], answer: 'JavaScript' },
    { question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Power Utility', 'Core Program Unit', 'Central Program User'], answer: 'Central Processing Unit' },
    { question: 'Which is the largest ocean?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], answer: 'Pacific' },
  ],
  friendship: [
    { question: 'What makes someone a dependable friend?', options: ['Keeping promises', 'Being popular', 'Always agreeing', 'Buying gifts'] },
    { question: 'How should friends handle a misunderstanding?', options: ['Talk respectfully', 'Ignore it forever', 'Spread rumours', 'Blame someone'] },
    { question: 'What matters most in friendship?', options: ['Trust', 'Competition', 'Perfect agreement', 'Popularity'] },
    { question: 'How can you support a friend having a hard day?', options: ['Listen and ask what they need', 'Force them to talk', 'Make fun of them', 'Compare problems'] },
  ],
  dreams: [
    { question: 'What is one skill you would love to develop?' },
    { question: 'What positive impact would you like to make in your community?' },
    { question: 'What is one achievable goal you want to work toward this year?' },
    { question: 'If you could learn from an expert, what would you ask?' },
  ],
  life: [
    { question: 'Your group project is late. What should you do first?', options: ['Divide tasks fairly', 'Blame someone', 'Give up', 'Hide the problem'] },
    { question: 'Someone is being left out. What is a thoughtful response?', options: ['Invite them to join', 'Laugh along', 'Ignore them', 'Make assumptions'] },
    { question: 'You receive feedback you disagree with. What helps most?', options: ['Listen and consider it', 'Argue immediately', 'Ignore all feedback', 'Take it personally'] },
    { question: 'You have several tasks due soon. What should you do first?', options: ['Prioritise tasks', 'Avoid everything', 'Choose randomly', 'Wait until the last minute'] },
  ],
}

const newState = (roomCode: string, hostId: string, name: string): GameState => ({
  roomCode,
  hostId,
  players: [{ id: hostId, name, isHost: true }],
  game: null,
  index: 0,
  round: 0,
  answers: {},
  votes: {},
  scores: {},
  revealed: false,
  updatedAt: Date.now(),
})

const randomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X')

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
  const [myId] = useState(getGuestId)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const stateRef = useRef<GameState | null>(null)

  useEffect(() => { stateRef.current = state }, [state])

  const me = state?.players.find(p => p.id === myId)
  const isHost = !!state && state.hostId === myId
  const currentQuestion = state?.game
    ? questions[state.game][state.index % questions[state.game].length]
    : null
  const myAnswer = state?.answers[myId]
  const myVote = state?.votes[myId]

  const cleanName = (value: string) =>
    value.trim().replace(/[<>]/g, '').slice(0, 18)

  const send = async (message: WireMessage) => {
    if (channelRef.current) {
      await channelRef.current.send({ type: 'broadcast', event: 'game', payload: message })
    }
  }

  const publish = async (next: GameState) => {
    next.updatedAt = Date.now()
    stateRef.current = next
    setState(next)
    await send({ type: 'STATE', state: next })
  }

  const applyAction = async (playerId: string, actionName: string, value?: string) => {
    const current = stateRef.current
    if (!current || current.hostId !== myId) return
    const q = current.game
      ? questions[current.game][current.index % questions[current.game].length]
      : null

    if (actionName === 'START' && value && value in questions) {
      await publish({
        ...current, game: value as GameId, index: 0, round: 1,
        answers: {}, votes: {}, revealed: false,
      })
    } else if (actionName === 'NEXT' && current.game) {
      const list = questions[current.game]
      await publish({
        ...current, index: (current.index + 1) % list.length,
        round: current.round + 1, answers: {}, votes: {}, revealed: false,
      })
    } else if (actionName === 'REVEAL') {
      await publish({ ...current, revealed: true })
    } else if (actionName === 'ANSWER' && value) {
      await publish({
        ...current,
        answers: { ...current.answers, [playerId]: value.slice(0, 500) },
      })
    } else if (actionName === 'VOTE' && value) {
      await publish({
        ...current,
        votes: { ...current.votes, [playerId]: value },
      })
    } else if (actionName === 'SCORE' && value && current.game === 'quiz') {
      if (current.answers[playerId]) return
      const correct = value === q?.answer
      await publish({
        ...current,
        answers: { ...current.answers, [playerId]: value },
        scores: {
          ...current.scores,
          [playerId]: (current.scores[playerId] || 0) + (correct ? 1 : 0),
        },
      })
    } else if (actionName === 'RESET') {
      await publish({ ...current, game: null, answers: {}, votes: {}, revealed: false })
    }
  }

  const action = async (name: string, value?: string) => {
    if (!state) return
    if (isHost) await applyAction(myId, name, value)
    else await send({ type: 'ACTION', playerId: myId, action: name, value })
  }

  const joinRoom = async (code: string, create: boolean) => {
    const name = cleanName(nickname)
    const roomCode = code.trim().toUpperCase()
    if (!name) { setError('Enter a nickname first.'); return }
    if (!create && !/^[A-Z0-9]{5}$/.test(roomCode)) {
      setError('Enter a valid 5-character room code.'); return
    }
    if (!supabase) {
      setError('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

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
        const message = payload as WireMessage
        const current = stateRef.current

        if (message.type === 'STATE') {
          if (!current || current.roomCode === message.state.roomCode) {
            stateRef.current = message.state
            setState(message.state)
            setScreen('room')
            setError('')
          }
        } else if (message.type === 'REQUEST_STATE' && current?.hostId === myId) {
          void send({ type: 'STATE', state: current })
        } else if (message.type === 'PLAYER_JOIN' && current?.hostId === myId) {
          if (!current.players.some(p => p.id === message.player.id) && current.players.length < 12) {
            void publish({ ...current, players: [...current.players, message.player] })
          } else if (current.players.some(p => p.id === message.player.id)) {
            void send({ type: 'STATE', state: current })
          }
        } else if (message.type === 'ACTION' && current?.hostId === myId) {
          void applyAction(message.playerId, message.action, message.value)
        }
      })

      channel.on('presence', { event: 'sync' }, () => setConnected(true))

      await new Promise<void>((resolve, reject) => {
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error('Could not connect. Check your internet and Supabase settings.'))
          }
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
        await send({
          type: 'PLAYER_JOIN',
          player: { id: myId, name, isHost: false },
        })
        window.setTimeout(() => {
          if (!stateRef.current) {
            setError('No host responded. Check the code or ask the host to reopen the room.')
          }
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
    const question = currentQuestion
    const quiz = state.game === 'quiz'
    const choices = !!question?.options
    const isWriting = state.game === 'truth' || state.game === 'dreams'

    return (
      <main className="app-shell">
        <header className="topbar">
          <button className="icon-btn" onClick={() => void leave()} aria-label="Leave room">
            <ArrowLeft size={18} />
          </button>
          <a className="brand" href="#" onClick={e => e.preventDefault()}>
            <span className="brand-mark"><Gamepad2 size={20} /></span> LINDA
          </a>
          <span className={`connection ${connected ? 'online' : ''}`}>
            <span className="dot" /> {connected ? 'Connected' : 'Reconnecting'}
          </span>
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
                      <button className="mode-card" key={g.id} onClick={() => void action('START', g.id)} disabled={!isHost}>
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
                    <div>
                      <p className="eyebrow">ROUND {state.round}</p>
                      <h2>{game?.icon} {game?.name}</h2>
                    </div>
                    <span className="pill"><Sparkles size={14} /> LIVE GAME</span>
                  </div>

                  <div className="turn-banner">
                    <span className="avatar">{(me?.name || nickname || '?').slice(0, 1).toUpperCase()}</span>
                    <div>
                      <small>PLAYING TOGETHER</small>
                      <strong>{state.players.length} player{state.players.length === 1 ? '' : 's'} connected</strong>
                    </div>
                  </div>

                  <div className="prompt-card">
                    <span className="prompt-type">{quiz ? '🧠 QUIZ QUESTION' : '✨ YOUR QUESTION'}</span>
                    <p>{question?.question}</p>

                    {choices && !quiz && (
                      <div className="choice-buttons">
                        {question?.options?.map(option => (
                          <button
                            className={`choice ${myVote === option ? 'selected' : ''}`}
                            key={option}
                            onClick={() => void action('VOTE', option)}
                          >
                            <strong>{option}</strong>
                            {myVote === option && <small>YOUR VOTE ✓</small>}
                          </button>
                        ))}
                      </div>
                    )}

                    {quiz && (
                      <div className="choice-buttons">
                        {question?.options?.map(option => (
                          <button
                            className={`choice ${state.revealed && option === question.answer ? 'selected' : ''}`}
                            key={option}
                            onClick={() => void action('SCORE', option)}
                            disabled={!!state.answers[myId]}
                          >
                            <strong>{option}</strong>
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

                    {!choices && !isWriting && !quiz && (
                      <p className="muted">Think about your answer, then share it with the group.</p>
                    )}

                    {myAnswer && (
                      <p className="safe-note"><ShieldCheck size={15} /> Your response: {myAnswer}</p>
                    )}

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
                      {isHost && (
                        <button className="primary-btn" onC

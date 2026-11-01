import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { ArrowLeft, Copy, Crown, Gamepad2, Heart, Link2, LoaderCircle, MessageCircle, Plus, ShieldCheck, Sparkles, Users, Wifi, WifiOff } from 'lucide-react'
import { prompts, type PromptKind } from './prompts'

type Player = { id: string; name: string; isHost: boolean }
type GameState = {
  roomCode: string
  hostId: string
  players: Player[]
  turnIndex: number
  kind: PromptKind | null
  prompt: string | null
  round: number
  updatedAt: number
}
type WireMessage =
  | { type: 'STATE'; state: GameState }
  | { type: 'REQUEST_STATE' }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PICK'; playerId: string; kind: PromptKind }
  | { type: 'SKIP'; playerId: string }
  | { type: 'NEXT'; playerId: string }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const guestId = () => {
  const key = 'linda-guest-id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}
const randomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase()
const pickPrompt = (kind: PromptKind, previous: string | null) => {
  const choices = prompts[kind].filter((p) => p !== previous)
  return choices[Math.floor(Math.random() * choices.length)] ?? prompts[kind][0]
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'room'>('home')
  const [nickname, setNickname] = useState('')
  const [roomInput, setRoomInput] = useState('')
  const [state, setState] = useState<GameState | null>(null)
  const [myId] = useState(guestId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const isHost = !!state && state.hostId === myId
  const me = state?.players.find((p) => p.id === myId)
  const currentPlayer = state?.players.length ? state.players[state.turnIndex % state.players.length] : null

  useEffect(() => { stateRef.current = state }, [state])

  const cleanName = (name: string) => name.trim().replace(/[<>]/g, '').slice(0, 18)

  const send = async (message: WireMessage) => {
    const channel = channelRef.current
    if (!channel) return
    await channel.send({ type: 'broadcast', event: 'game', payload: message })
  }

  const publishState = async (next: GameState) => {
    stateRef.current = next
    setState(next)
    await send({ type: 'STATE', state: next })
  }

  const joinRoom = async (code: string, create: boolean) => {
    const name = cleanName(nickname)
    const roomCode = code.trim().toUpperCase()
    if (!name) { setError('Choose a temporary nickname first.'); return }
    if (!create && !/^[A-Z0-9]{5}$/.test(roomCode)) { setError('Enter a valid 5-character room code.'); return }
    if (!supabase) { setError('Connect Supabase first. Follow SETUP.md to configure the free backend.'); return }
    setBusy(true); setError('')
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
          }
        } else if (message.type === 'REQUEST_STATE' && current?.hostId === myId) {
          void channel.send({ type: 'broadcast', event: 'game', payload: { type: 'STATE', state: current } satisfies WireMessage })
        } else if (message.type === 'PLAYER_JOIN' && current?.hostId === myId) {
          if (!current.players.some((p) => p.id === message.player.id) && current.players.length < 12) {
            void publishState({ ...current, players: [...current.players, message.player], updatedAt: Date.now() })
          }
        } else if ((message.type === 'PICK' || message.type === 'SKIP' || message.type === 'NEXT') && current?.hostId === myId) {
          if (message.type === 'PICK') {
            const next = { ...current, kind: message.kind, prompt: pickPrompt(message.kind, current.prompt), round: current.round + 1, updatedAt: Date.now() }
            void publishState(next)
          } else if (message.type === 'SKIP') {
            const kind = current.kind ?? 'truth'
            void publishState({ ...current, prompt: pickPrompt(kind, current.prompt), round: current.round + 1, updatedAt: Date.now() })
          } else {
            void publishState({ ...current, turnIndex: (current.turnIndex + 1) % Math.max(current.players.length, 1), kind: null, prompt: null, updatedAt: Date.now() })
          }
        }
      })
      channel.on('presence', { event: 'sync' }, () => {
        setConnected(true)
      })
      const status = await new Promise<string>((resolve, reject) => {
        channel.subscribe((s) => {
          if (s === 'SUBSCRIBED') resolve(s)
          if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error('Could not connect to the room. Check the Supabase setup and internet connection.'))
        })
      })
      if (status !== 'SUBSCRIBED') throw new Error('Could not connect.')
      await channel.track({ id: myId, nickname: name, joinedAt: Date.now() })
      setConnected(true)
      if (create) {
        const first: GameState = {
          roomCode, hostId: myId, players: [{ id: myId, name, isHost: true }],
          turnIndex: 0, kind: null, prompt: null, round: 0, updatedAt: Date.now(),
        }
        await publishState(first)
      } else {
        await send({ type: 'REQUEST_STATE' })
        await send({ type: 'PLAYER_JOIN', player: { id: myId, name, isHost: false } })
        // A brief wait allows the host's state broadcast to arrive.
        window.setTimeout(() => {
          if (!stateRef.current) setError('No room host responded. Check the code or ask the host to reopen the room.')
        }, 2500)
      }
      setScreen('room')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to join the room.')
      setConnected(false)
    } finally { setBusy(false) }
  }

  useEffect(() => () => {
    if (channelRef.current && supabase) void supabase.removeChannel(channelRef.current)
  }, [])

  const createRoom = () => void joinRoom(randomCode(), true)
  const joinExisting = () => void joinRoom(roomInput, false)

  const choose = async (kind: PromptKind) => {
    if (!state) return
    if (isHost) {
      await publishState({ ...state, kind, prompt: pickPrompt(kind, state.prompt), round: state.round + 1, updatedAt: Date.now() })
    } else {
      await send({ type: 'PICK', playerId: myId, kind })
    }
  }
  const skip = async () => {
    if (!state) return
    if (isHost) {
      const kind = state.kind ?? 'truth'
      await publishState({ ...state, prompt: pickPrompt(kind, state.prompt), round: state.round + 1, updatedAt: Date.now() })
    } else await send({ type: 'SKIP', playerId: myId })
  }
  const nextTurn = async () => {
    if (!state) return
    if (isHost) await publishState({ ...state, turnIndex: (state.turnIndex + 1) % Math.max(state.players.length, 1), kind: null, prompt: null, updatedAt: Date.now() })
    else await send({ type: 'NEXT', playerId: myId })
  }
  const copyCode = async () => {
    if (!state) return
    try { await navigator.clipboard.writeText(state.roomCode); setError('Room code copied!') }
    catch { setError(`Room code: ${state.roomCode} — copy it manually.`) }
  }
  const leave = async () => {
    if (channelRef.current && supabase) await supabase.removeChannel(channelRef.current)
    channelRef.current = null; stateRef.current = null; setState(null); setScreen('home'); setConnected(false); setError('')
  }

  const modes = useMemo(() => [
    { name: 'Truth or Dare', icon: Sparkles, status: 'PLAY FIRST', color: 'pink' },
    { name: 'Real-Life Choices', icon: Heart, status: 'COMING SOON', color: 'blue' },
    { name: 'Quiz Battle', icon: Gamepad2, status: 'COMING SOON', color: 'orange' },
    { name: 'Friendship Test', icon: Users, status: 'COMING SOON', color: 'green' },
    { name: 'Dreams & Future', icon: MessageCircle, status: 'COMING SOON', color: 'purple' },
    { name: 'Life Mode', icon: ShieldCheck, status: 'COMING SOON', color: 'yellow' },
  ], [])

  if (screen === 'room' && state) return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => void leave()} aria-label="Leave room"><ArrowLeft size={18}/></button>
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); void leave() }}><span className="brand-mark"><Gamepad2 size={20}/></span> LINDA</a>
        <span className={`connection ${connected ? 'online' : ''}`}><span className="dot"/> {connected ? 'Connected' : 'Reconnecting'}</span>
      </header>
      <section className="room-layout">
        <div className="room-heading">
          <p className="eyebrow">YOUR PRIVATE GAME ROOM</p>
          <h1>Let the good times <span className="gradient-text">begin.</span></h1>
          <p className="muted">Invite friends with the code below. No accounts, no downloads.</p>
          <button className="room-code" onClick={() => void copyCode()}><span>{state.roomCode}</span><Copy size={17}/><small>Copy code</small></button>
        </div>
        <div className="game-grid">
          <section className="panel game-panel">
            <div className="panel-top"><div><p className="eyebrow">ROUND {state.round + (state.prompt ? 0 : 1)}</p><h2>Truth or Dare</h2></div><span className="pill"><Sparkles size={14}/> PLAYING</span></div>
            <div className="turn-banner"><span className="avatar">{(currentPlayer?.name ?? '?').slice(0, 1).toUpperCase()}</span><div><small>UP NEXT</small><strong>{currentPlayer?.name ?? 'Waiting for players'}</strong></div></div>
            {!state.prompt ? (
              <div className="choice-area">
                <p>Pick your path. Keep it kind, keep it fun.</p>
                <div className="choice-buttons">
                  <button className="choice truth" onClick={() => void choose('truth')}><span>💬</span><strong>TRUTH</strong><small>Answer a friendly question</small></button>
                  <button className="choice dare" onClick={() => void choose('dare')}><span>⚡</span><strong>DARE</strong><small>Try a silly mini-challenge</small></button>
                </div>
              </div>
            ) : (
              <div className="prompt-card">
                <span className={`prompt-type ${state.kind}`}>{state.kind === 'truth' ? '💬 TRUTH' : '⚡ DARE'}</span>
                <p>{state.prompt}</p>
                <div className="prompt-actions"><button className="secondary-btn" onClick={() => void skip()}>Skip prompt</button><button className="primary-btn" onClick={() => void nextTurn()}>Next player's turn <ArrowLeft className="flip" size={16}/></button></div>
              </div>
            )}
            <p className="safe-note"><ShieldCheck size={15}/> Everyone can skip any prompt. Be respectful and never pressure anyone to share.</p>
          </section>
          <aside className="panel players-panel">
            <div className="panel-top"><div><p className="eyebrow">THE CREW</p><h2>Players <span className="count">{state.players.length}/12</span></h2></div><Users size={20}/></div>
            <div className="player-list">{state.players.map((player, i) => <div className={`player-row ${currentPlayer?.id === player.id ? 'active' : ''}`} key={player.id}><span className={`avatar avatar-${i % 5}`}>{player.name.slice(0, 1).toUpperCase()}</span><span className="player-name">{player.name}{player.id === myId && <small> YOU</small>}</span>{player.isHost && <Crown size={15} className="crown"/>}{currentPlayer?.id === player.id && <span className="turn-tag">TURN</span>}</div>)}</div>
            <div className="player-tip"><Sparkles size={16}/><span>Good games are built on trust, kindness and a little bit of chaos.</span></div>
          </aside>
        </div>
      </section>
    </main>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Gamepad2 size={20}/></span> LINDA</a>
        <span className="top-tag"><span className="dot"/> YOUR FRIEND GROUP, BUT A GAME</span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-pill"><Sparkles size={14}/> THE ONLINE PARTY ROOM</span>
          <h1>Less scrolling.<br/>More <span className="gradient-text">real moments.</span></h1>
          <p className="hero-desc">Big questions, tiny challenges, unforgettable laughs. Bring your people together — wherever they are.</p>
          <div className="hero-benefits"><span><Users size={15}/> Play with friends</span><span><Wifi size={15}/> Real-time rooms</span><span><ShieldCheck size={15}/> Skip any prompt</span></div>
        </div>
        <div className="join-card">
          <div className="card-spark"><Sparkles size={21}/></div>
          <p className="eyebrow">READY WHEN YOU ARE</p>
          <h2>Start a game night.</h2>
          <label htmlFor="nickname">Your temporary nickname</label>
          <input id="nickname" maxLength={18} placeholder="e.g. Moonlight" value={nickname} onChange={(e) => setNickname(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createRoom()}/>
          <button className="primary-btn full" disabled={busy} onClick={() => void createRoom()}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} Create a room</button>
          <div className="or-divider"><span/> OR JOIN A ROOM <span/></div>
          <div className="join-row"><input aria-label="Room code" maxLength={5} placeholder="ENTER CODE" value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/><button className="secondary-btn" disabled={busy} onClick={() => void joinExisting()}>Join <Link2 size={15}/></button></div>
          {error && <p className="error-msg" role="status">{error}</p>}
          <p className="privacy-note"><ShieldCheck size={14}/> No login. Use a nickname, and share only what feels comfortable.</p>
        </div>
      </section>
      <section className="modes-section">
        <div className="section-title"><div><p className="eyebrow">PICK YOUR VIBE</p><h2>Six ways to <span className="gradient-text">connect.</span></h2></div><p className="muted">One room. Your people. Your rules.</p></div>
        <div className="mode-grid">{modes.map(({ name, icon: Icon, status, color }) => <article className={`mode-card ${color}`} key={name}><div className="mode-icon"><Icon size={22}/></div><div><h3>{name}</h3><p>{name === 'Truth or Dare' ? 'Friendly questions & silly challenges.' : 'A new way to play together is on the way.'}</p></div><span className={`mode-status ${status === 'PLAY FIRST' ? 'ready' : ''}`}>{status}</span></article>)}</div>
      </section>
      <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Gamepad2 size={17}/></span> PLAYVERSE</a><span>Made for connection, not comparison.</span><span className="footer-right"><ShieldCheck size={14}/> Play kindly. Skip freely.</span></footer>
    </main>
  )
}

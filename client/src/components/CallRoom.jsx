import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api, { getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

// Mặc định chỉ có STUN; máy chủ trả thêm TURN (nếu đã cấu hình) để gọi được qua mọi loại mạng
const DEFAULT_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function getMedia() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true }); // không có camera → chỉ giọng nói
    } catch {
      return new MediaStream(); // không có cả micro → vẫn vào để nghe / xem
    }
  }
}

const clock = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
};

function VideoTile({
  stream, name, avatarUrl, muted, mirrored, media, label, hand, recording,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  const showVideo = stream && stream.getVideoTracks().length > 0 && media?.video !== false;
  return (
    <div className={`call-tile ${hand ? 'hand-up' : ''}`}>
      <video ref={ref} autoPlay playsInline muted={muted} className={mirrored ? 'mirror' : ''} style={{ display: showVideo ? 'block' : 'none' }} />
      {!showVideo && <div className="call-tile-avatar"><Avatar name={name} src={avatarUrl} size={88} /></div>}
      {hand && <div className="call-tile-hand" title="Đang giơ tay">✋</div>}
      {recording && <div className="call-tile-rec" title="Người này đang ghi âm">🔴 REC</div>}
      <div className="call-tile-name">
        {media?.audio === false ? '🔇 ' : '🎤 '}{name}{label ? ` ${label}` : ''}
      </div>
    </div>
  );
}

// Phòng gọi toàn màn hình: video · nhắn tin · giơ tay · danh sách người tham gia · ghi âm · kết thúc
// Mỗi người kết nối trực tiếp (WebRTC) với từng người khác, máy chủ chỉ chuyển tín hiệu.
export default function CallRoom({
  token, room, isLeader, onLeave, onEnd,
}) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // socketId → { info, stream, media, hand, recording }
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [hand, setHand] = useState(false);
  const [status, setStatus] = useState('Đang kết nối…');
  const [side, setSide] = useState(null); // null | 'people' | 'chat'
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [toasts, setToasts] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const pcs = useRef({});
  const pending = useRef({}); // ICE đến trước khi có mô tả phiên
  const localRef = useRef(null);
  const screenRef = useRef(null);
  const iceRef = useRef(DEFAULT_ICE);
  const sideRef = useRef(side);
  const chatEnd = useRef(null);
  const rec = useRef(null); // { ctx, dest, recorder, chunks, connected:Set }
  sideRef.current = side;

  const toast = (msg) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  // Đồng hồ thời gian cuộc gọi / thời gian ghi âm
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
      if (rec.current) setRecSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    let closed = false;

    const signal = (to, data) => socket.emit('call:signal', { to, data });
    const setPeer = (id, patch) => setPeers((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    const dropPeer = (id) => {
      pcs.current[id]?.close();
      delete pcs.current[id];
      delete pending.current[id];
      setPeers((p) => { const { [id]: _, ...rest } = p; return rest; });
    };

    const createPeer = (id, info, initiator) => {
      const pc = new RTCPeerConnection(iceRef.current);
      pcs.current[id] = pc;
      localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
      pc.onicecandidate = (e) => e.candidate && signal(id, { candidate: e.candidate });
      pc.ontrack = (e) => setPeer(id, { stream: e.streams[0] });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') setPeer(id, { failed: true });
      };
      if (info) {
        setPeer(id, {
          info, media: info.media, hand: info.hand, recording: info.recording,
        });
      }
      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => signal(id, { sdp: pc.localDescription }));
      }
      return pc;
    };

    const onPeerJoined = (info) => {
      setPeer(info.socketId, {
        info, media: info.media, hand: info.hand, recording: info.recording,
      });
      toast(`👋 ${info.fullName} đã vào phòng`);
    };
    const onSignal = async ({ from, data }) => {
      let pc = pcs.current[from];
      if (!pc) {
        if (data.sdp?.type !== 'offer') return;
        pc = createPeer(from, null, false);
      }
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        (pending.current[from] || []).forEach((c) => pc.addIceCandidate(c).catch(() => {}));
        delete pending.current[from];
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          signal(from, { sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) pc.addIceCandidate(data.candidate).catch(() => {});
        else (pending.current[from] = pending.current[from] || []).push(data.candidate);
      }
    };
    const onPeerLeft = ({ socketId }) => {
      setPeers((p) => {
        if (p[socketId]?.info) toast(`${p[socketId].info.fullName} đã rời phòng`);
        return p;
      });
      dropPeer(socketId);
    };
    const onPeerMedia = ({ socketId, media }) => setPeer(socketId, { media });
    const onPeerHand = ({ socketId, fullName, raised }) => {
      if (socketId === socket.id) return;
      setPeer(socketId, { hand: raised });
      if (raised) toast(`✋ ${fullName} giơ tay muốn phát biểu`);
    };
    const onPeerRecording = ({ socketId, fullName, on }) => {
      if (socketId === socket.id) return;
      setPeer(socketId, { recording: on });
      toast(on ? `🔴 ${fullName} bắt đầu ghi âm cuộc gọi` : `${fullName} đã dừng ghi âm`);
    };
    const onChat = (msg) => {
      setMessages((list) => [...list, msg]);
      if (sideRef.current !== 'chat' && msg.userId !== user.id) {
        setUnread((n) => n + 1);
        toast(`💬 ${msg.fullName}: ${msg.text.slice(0, 60)}`);
      }
    };
    const onEnded = () => onLeave('Trưởng nhóm đã kết thúc cuộc gọi');

    (async () => {
      try {
        const res = await api.get('/calls/ice-servers');
        iceRef.current = { iceServers: res.data.iceServers };
      } catch { /* dùng STUN mặc định */ }
      const stream = await getMedia();
      if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
      localRef.current = stream;
      setLocalStream(stream);
      setCam(stream.getVideoTracks().length > 0);
      setMic(stream.getAudioTracks().length > 0);

      socket.on('call:peer-joined', onPeerJoined);
      socket.on('call:signal', onSignal);
      socket.on('call:peer-left', onPeerLeft);
      socket.on('call:peer-media', onPeerMedia);
      socket.on('call:peer-hand', onPeerHand);
      socket.on('call:peer-recording', onPeerRecording);
      socket.on('call:chat', onChat);
      socket.on('call:ended', onEnded);

      const media = { audio: stream.getAudioTracks().length > 0, video: stream.getVideoTracks().length > 0 };
      socket.emit('call:join', { token, media }, (res) => {
        if (!res?.ok) { onLeave(res?.message || 'Không vào được phòng'); return; }
        setStatus('');
        setMessages(res.chat || []);
        // Người vào sau chủ động gọi tới từng người đang có trong phòng
        res.peers.forEach((p) => createPeer(p.socketId, p, true));
      });
    })();

    return () => {
      closed = true;
      stopRecording(false);
      socket.emit('call:leave');
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:signal', onSignal);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:peer-media', onPeerMedia);
      socket.off('call:peer-hand', onPeerHand);
      socket.off('call:peer-recording', onPeerRecording);
      socket.off('call:chat', onChat);
      socket.off('call:ended', onEnded);
      Object.values(pcs.current).forEach((pc) => pc.close());
      pcs.current = {};
      localRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Báo cho người khác biết mình đang bật / tắt mic, camera
  const sendMedia = (audio, video) => getSocket().emit('call:media', { audio, video });

  const toggleMic = () => {
    const next = !mic;
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMic(next);
    sendMedia(next, cam || sharing);
  };

  const toggleCam = () => {
    const next = !cam;
    localRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    setCam(next);
    sendMedia(mic, next || sharing);
  };

  const toggleHand = () => {
    const next = !hand;
    setHand(next);
    getSocket().emit('call:hand', next);
  };

  const replaceVideo = (track) => Object.values(pcs.current).forEach((pc) => {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });

  const toggleShare = async () => {
    const camTrack = localRef.current?.getVideoTracks()[0];
    if (!camTrack) {
      toast('Cần có camera khi vào phòng mới chia sẻ màn hình được.');
      return;
    }
    if (sharing) {
      screenRef.current?.getTracks().forEach((t) => t.stop());
      replaceVideo(camTrack);
      setSharing(false);
      sendMedia(mic, cam);
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = screen;
      const track = screen.getVideoTracks()[0];
      replaceVideo(track);
      track.onended = () => { replaceVideo(camTrack); setSharing(false); sendMedia(mic, cam); };
      setSharing(true);
      sendMedia(mic, true);
    } catch { /* người dùng hủy chọn màn hình */ }
  };

  // ----- Ghi âm: trộn tiếng của mình + mọi người rồi ghi thành file .webm -----
  const connectAudio = (stream) => {
    const r = rec.current;
    if (!r || !stream || r.connected.has(stream.id) || !stream.getAudioTracks().length) return;
    r.ctx.createMediaStreamSource(stream).connect(r.dest);
    r.connected.add(stream.id);
  };

  // Người vào phòng sau khi đã bắt đầu ghi → ghi luôn tiếng của họ
  useEffect(() => {
    if (!recording) return;
    Object.values(peers).forEach((p) => connectAudio(p.stream));
  }, [peers, recording]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = () => {
    if (typeof MediaRecorder === 'undefined') {
      toast('Trình duyệt này không hỗ trợ ghi âm');
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    rec.current = {
      ctx, dest, recorder, chunks: [], connected: new Set(),
    };
    connectAudio(localRef.current);
    Object.values(peers).forEach((p) => connectAudio(p.stream));
    recorder.ondataavailable = (e) => e.data.size && rec.current?.chunks.push(e.data);
    recorder.start(1000);
    setRecSeconds(0);
    setRecording(true);
    getSocket().emit('call:recording', true);
    toast('🔴 Bắt đầu ghi âm. Mọi người trong phòng đều được thông báo.');
  };

  function stopRecording(download = true) {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setRecording(false);
    getSocket().emit('call:recording', false);
    r.recorder.onstop = () => {
      r.ctx.close();
      if (!download || !r.chunks.length) return;
      const blob = new Blob(r.chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
      a.href = url;
      a.download = `ghi-am-cuoc-goi-${room.code}-${stamp}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    if (r.recorder.state !== 'inactive') r.recorder.stop();
    if (download) toast('Đã dừng ghi âm, file đang được tải về máy');
  }

  const sendChat = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    getSocket().emit('call:chat', text);
    setText('');
  };

  const openSide = (name) => {
    setSide(side === name ? null : name);
    if (name === 'chat') setUnread(0);
  };

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, side]);

  const leave = () => {
    if (recording) stopRecording(true);
    onLeave();
  };
  const endForAll = () => {
    if (recording) stopRecording(true);
    onEnd();
  };

  const list = Object.entries(peers);
  const count = list.length + 1;
  const someoneRecording = recording || list.some(([, p]) => p.recording);
  const people = [
    {
      id: 'me', name: `${user.fullName} (bạn)`, avatarUrl: user.avatarUrl, media: { audio: mic, video: cam || sharing }, hand, recording,
    },
    ...list.map(([id, p]) => ({
      id, name: p.info?.fullName || 'Đang kết nối…', avatarUrl: p.info?.avatarUrl, media: p.media, hand: p.hand, recording: p.recording,
    })),
  ];
  const hands = people.filter((p) => p.hand);

  if (minimized) {
    return createPortal(
      <button type="button" className="call-mini" onClick={() => setMinimized(false)}>
        <span className="live-dot" /> Đang trong cuộc gọi · {count} người · {clock(seconds)} — <strong>Mở lại</strong>
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div className="call-full">
      <div className="call-top">
        <div className="call-top-info">
          <strong>📞 {room.title || 'Cuộc gọi nhóm'}</strong>
          <span className="muted">Mã phòng {room.code} · {count} người · {clock(seconds)}</span>
          {someoneRecording && <span className="rec-badge">🔴 Đang ghi âm{recording ? ` ${clock(recSeconds)}` : ''}</span>}
          {hands.length > 0 && <span className="hand-badge">✋ {hands.length} người giơ tay</span>}
        </div>
        <div className="row">
          {status && <span className="muted">{status}</span>}
          <button type="button" className="btn ghost-light" onClick={() => setMinimized(true)} title="Thu nhỏ, cuộc gọi vẫn tiếp tục">⤡ Thu nhỏ</button>
        </div>
      </div>

      <div className="call-body">
        <div className="call-stage">
          <div className={`call-grid n${Math.min(count, 9)}`}>
            <VideoTile
              stream={sharing ? screenRef.current : localStream}
              name={user.fullName}
              avatarUrl={user.avatarUrl}
              label="(bạn)"
              muted
              mirrored={!sharing}
              media={{ audio: mic, video: cam || sharing }}
              hand={hand}
              recording={recording}
            />
            {list.map(([id, p]) => (
              <VideoTile
                key={id}
                stream={p.stream}
                name={p.info?.fullName || 'Đang kết nối…'}
                avatarUrl={p.info?.avatarUrl}
                media={p.media}
                hand={p.hand}
                recording={p.recording}
                label={p.failed ? '(mất kết nối)' : ''}
              />
            ))}
          </div>
          {list.length === 0 && !status && <p className="muted center">Đang chờ các thành viên khác vào phòng…</p>}
        </div>

        {side && (
          <aside className="call-side">
            <div className="call-side-tabs">
              <button type="button" className={side === 'people' ? 'active' : ''} onClick={() => openSide('people')}>👥 Người tham gia ({count})</button>
              <button type="button" className={side === 'chat' ? 'active' : ''} onClick={() => openSide('chat')}>💬 Tin nhắn</button>
              <button type="button" className="call-side-close" onClick={() => setSide(null)} title="Đóng">×</button>
            </div>
            {side === 'people' && (
              <ul className="call-people">
                {[...people].sort((a, b) => b.hand - a.hand).map((p) => (
                  <li key={p.id}>
                    <Avatar name={p.name} src={p.avatarUrl} size={32} />
                    <span className="grow">{p.name}</span>
                    {p.hand && <span title="Đang giơ tay">✋</span>}
                    {p.recording && <span title="Đang ghi âm">🔴</span>}
                    <span title={p.media?.audio === false ? 'Mic đang tắt' : 'Mic đang bật'}>{p.media?.audio === false ? '🔇' : '🎤'}</span>
                    <span title={p.media?.video === false ? 'Camera đang tắt' : 'Camera đang bật'} className={p.media?.video === false ? 'off-icon' : ''}>📷</span>
                  </li>
                ))}
              </ul>
            )}
            {side === 'chat' && (
              <>
                <div className="call-chat">
                  {messages.length === 0 && <p className="muted small center">Chưa có tin nhắn. Tin nhắn chỉ hiện trong cuộc gọi này.</p>}
                  {messages.map((m) => (
                    <div key={m.id} className={`call-msg ${m.userId === user.id ? 'mine' : ''}`}>
                      <small>{m.userId === user.id ? 'Bạn' : m.fullName} · {new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                      <div>{m.text}</div>
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
                <form className="call-chat-form" onSubmit={sendChat}>
                  <input placeholder="Nhắn cho mọi người…" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
                  <button type="submit" className="btn primary" disabled={!text.trim()}>Gửi</button>
                </form>
              </>
            )}
          </aside>
        )}
      </div>

      <div className="call-controls">
        <button type="button" className={`cbtn ${mic ? '' : 'off'}`} onClick={toggleMic} disabled={!localStream?.getAudioTracks().length} title={mic ? 'Tắt mic' : 'Bật mic'}>
          <span>{mic ? '🎤' : '🔇'}</span><small>{mic ? 'Tắt mic' : 'Bật mic'}</small>
        </button>
        <button type="button" className={`cbtn ${cam ? '' : 'off'}`} onClick={toggleCam} disabled={!localStream?.getVideoTracks().length} title={cam ? 'Tắt camera' : 'Bật camera'}>
          <span>📷</span><small>{cam ? 'Tắt cam' : 'Bật cam'}</small>
        </button>
        <button type="button" className={`cbtn ${hand ? 'on' : ''}`} onClick={toggleHand} title="Giơ tay phát biểu">
          <span>✋</span><small>{hand ? 'Hạ tay' : 'Giơ tay'}</small>
        </button>
        <button type="button" className={`cbtn ${sharing ? 'on' : ''}`} onClick={toggleShare} title="Chia sẻ màn hình">
          <span>🖥</span><small>{sharing ? 'Dừng chia sẻ' : 'Chia sẻ'}</small>
        </button>
        <button type="button" className={`cbtn ${recording ? 'rec' : ''}`} onClick={() => (recording ? stopRecording(true) : startRecording())} title="Ghi âm cuộc gọi">
          <span>{recording ? '⏹' : '⏺'}</span><small>{recording ? `Dừng ghi ${clock(recSeconds)}` : 'Ghi âm'}</small>
        </button>
        <span className="cbtn-sep" />
        <button type="button" className={`cbtn ${side === 'people' ? 'on' : ''}`} onClick={() => openSide('people')} title="Người tham gia">
          <span>👥</span><small>Người tham gia ({count})</small>
        </button>
        <button type="button" className={`cbtn ${side === 'chat' ? 'on' : ''}`} onClick={() => openSide('chat')} title="Nhắn tin">
          <span>💬</span><small>Tin nhắn</small>
          {unread > 0 && <i className="cbtn-badge">{unread}</i>}
        </button>
        <span className="cbtn-sep" />
        <button type="button" className="cbtn leave" onClick={leave} title="Rời phòng">
          <span>🚪</span><small>Rời phòng</small>
        </button>
        {isLeader && (
          <button type="button" className="cbtn end" onClick={endForAll} title="Kết thúc cuộc họp cho tất cả mọi người">
            <span>📵</span><small>Kết thúc cuộc họp</small>
          </button>
        )}
      </div>

      <div className="call-toasts">
        {toasts.map((t) => <div key={t.id} className="call-toast">{t.msg}</div>)}
      </div>
    </div>,
    document.body,
  );
}

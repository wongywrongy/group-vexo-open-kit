import { useCallback, useEffect, useMemo, useState } from 'react';

const api = window.glasses;

/** media://local/<path inside the data folder>, each part escaped. */
export const mediaUrl = (rel) => 'media://local/' + rel.split('/').map(encodeURIComponent).join('/');

const fmtTime = (ms) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) : 'unknown time';
const fmtClock = (ms) => (ms ? new Date(ms).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(ms % 1000).padStart(3, '0') : '');
const fmtBytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function App() {
  const [lib, setLib] = useState(null);
  const [selected, setSelected] = useState(null); // { kind: 'session' | 'video', id }

  const refresh = useCallback(async () => setLib(await api.scan()), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000); // new photos and recordings show up by themselves
    return () => clearInterval(t);
  }, [refresh]);

  // Pick the newest item at the start, and drop a selection whose folder disappeared.
  useEffect(() => {
    if (!lib) return;
    const exists = selected && (selected.kind === 'session' ? lib.sessions : lib.videos).some((x) => x.id === selected.id);
    if (exists) return;
    if (lib.videos[0] && (!lib.sessions[0] || lib.videos[0].time > lib.sessions[0].time)) setSelected({ kind: 'video', id: lib.videos[0].id });
    else if (lib.sessions[0]) setSelected({ kind: 'session', id: lib.sessions[0].id });
    else setSelected(null);
  }, [lib, selected]);

  const choose = async () => {
    await api.chooseFolder();
    setSelected(null);
    refresh();
  };

  if (!lib) return <div className="loading">Loading…</div>;
  const item = selected && (selected.kind === 'session' ? lib.sessions : lib.videos).find((x) => x.id === selected.id);

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <span className="dot" aria-hidden />
          Glasses Viewer
        </header>
        <button className="folder" onClick={choose} title={lib.root}>
          <span className="folder-label">Data folder</span>
          <span className="folder-path">
            <bdi dir="ltr">{lib.root}</bdi>
          </span>
        </button>

        <Section title="Recordings" count={lib.videos.length}>
          {lib.videos.map((v) => (
            <NavItem
              key={v.id}
              active={selected?.kind === 'video' && selected.id === v.id}
              onClick={() => setSelected({ kind: 'video', id: v.id })}
              title={fmtTime(v.time)}
              sub={[v.recording ? fmtBytes(v.recordingBytes) : 'no video file', plural(v.frames.length, 'frame')].join(' · ')}
              live={v.live}
            />
          ))}
        </Section>
        <Section title="Photo sessions" count={lib.sessions.length}>
          {lib.sessions.map((s) => (
            <NavItem
              key={s.id}
              active={selected?.kind === 'session' && selected.id === s.id}
              onClick={() => setSelected({ kind: 'session', id: s.id })}
              title={fmtTime(s.time)}
              sub={`${plural(s.photos.length, 'photo')} · ${plural(s.events, 'event')}`}
            />
          ))}
        </Section>
      </aside>

      <main className="main">
        {!item && <Empty lib={lib} onChoose={choose} />}
        {item && selected.kind === 'session' && <SessionView key={item.id} session={item} />}
        {item && selected.kind === 'video' && <VideoView key={item.id} video={item} />}
      </main>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="section">
      <h2>
        {title} <span className="count">{count}</span>
      </h2>
      {count === 0 ? <p className="none">None yet</p> : <ul>{children}</ul>}
    </section>
  );
}

function NavItem({ active, onClick, title, sub, live }) {
  return (
    <li>
      <button className={`nav ${active ? 'active' : ''}`} onClick={onClick}>
        <span className="nav-title">
          {title}
          {live && <span className="live">LIVE</span>}
        </span>
        <span className="nav-sub">{sub}</span>
      </button>
    </li>
  );
}

function Empty({ lib, onChoose }) {
  return (
    <div className="empty">
      <h1>{lib.exists ? 'Nothing recorded yet' : 'No data folder here yet'}</h1>
      <p>
        This app shows what <code>mentra-glasses-tool</code> saves. Start it with <code>npm start</code> in{' '}
        <code>mentra-glasses-tool</code>, open the app on the glasses, and photos appear here by themselves. For video, run{' '}
        <code>npm run video</code> too.
      </p>
      <p className="muted">Looking in {lib.root}</p>
      <button className="primary" onClick={onChoose}>
        Choose another folder
      </button>
    </div>
  );
}

function Toolbar({ title, meta, reveal, children }) {
  return (
    <div className="toolbar">
      <div>
        <h1>{title}</h1>
        <p className="muted">{meta}</p>
      </div>
      <div className="toolbar-actions">
        {children}
        <button onClick={() => api.reveal(reveal)}>Show in Finder</button>
      </div>
    </div>
  );
}

function SessionView({ session }) {
  const [tab, setTab] = useState('photos');
  const [open, setOpen] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (tab !== 'events') return;
    let stop = false;
    const load = async () => {
      const ev = await api.events(session.id);
      if (!stop) setEvents(ev);
    };
    load();
    const t = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [tab, session.id]);

  const meta = [session.label, plural(session.photos.length, 'photo'), plural(session.events, 'event'), session.imu ? plural(session.imu, 'IMU sample') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="view">
      <Toolbar title={fmtTime(session.time)} meta={meta} reveal={session.photos[0] ?? `${session.id}/events.jsonl`}>
        <div className="tabs" role="tablist">
          {['photos', 'events'].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'photos' ? 'Photos' : 'Events'}
            </button>
          ))}
        </div>
      </Toolbar>

      {tab === 'photos' &&
        (session.photos.length ? (
          <Grid items={session.photos} onOpen={setOpen} />
        ) : (
          <p className="muted pad">No photos in this session.</p>
        ))}
      {tab === 'events' && <EventsTable events={events} />}
      {open !== null && <Lightbox items={session.photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Grid({ items, onOpen }) {
  return (
    <div className="grid">
      {items.map((rel, i) => (
        <button key={rel} className="thumb" onClick={() => onOpen(i)} title={rel.split('/').pop()}>
          <img src={mediaUrl(rel)} alt="" loading="lazy" draggable={false} />
          <span className="thumb-n">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

function Lightbox({ items, index, onIndex, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  const rel = items[index];
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Photo">
      <img src={mediaUrl(rel)} alt="" onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous">
          ←
        </button>
        <span>
          {index + 1} / {items.length} · {rel.split('/').pop()}
        </span>
        <button disabled={index === items.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next">
          →
        </button>
        <button onClick={() => api.reveal(rel)}>Show in Finder</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function EventsTable({ events }) {
  const [filter, setFilter] = useState('all');
  const types = useMemo(() => ['all', ...new Set(events.map((e) => e.type))], [events]);
  const shown = (filter === 'all' ? events : events.filter((e) => e.type === filter)).slice().reverse();
  if (!events.length) return <p className="muted pad">No events yet.</p>;
  return (
    <div className="events">
      <div className="chips">
        {types.map((t) => (
          <button key={t} className={filter === t ? 'chip on' : 'chip'} onClick={() => setFilter(t)}>
            {t}
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((e, i) => {
            const { time, type, ...rest } = e;
            const details = Object.keys(rest).length ? JSON.stringify(rest) : '';
            return (
              <tr key={`${time}-${i}`}>
                <td className="mono">{fmtClock(time)}</td>
                <td>
                  <span className={`tag tag-${String(type).replace(/[^a-z_]/gi, '')}`}>{String(type)}</span>
                </td>
                <td className="mono details" title={details}>
                  {details}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VideoView({ video }) {
  const [open, setOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  // While video is arriving, show the newest frame twice a second.
  useEffect(() => {
    if (!video.live || !video.latest) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [video.live, video.latest]);

  const isMkv = video.recording?.endsWith('.mkv');
  const meta = [video.recording ? fmtBytes(video.recordingBytes) : 'no video file yet', plural(video.frames.length, 'frame screenshot')].join(' · ');

  return (
    <div className="view">
      <Toolbar title={fmtTime(video.time)} meta={meta} reveal={video.recording ?? video.latest ?? video.frames[0]} />

      {video.live && video.latest && (
        <section className="panel">
          <h2>
            <span className="live">LIVE</span> Newest frame
          </h2>
          <img className="live-frame" src={`${mediaUrl(video.latest)}?t=${tick}`} alt="Newest frame from the glasses" />
        </section>
      )}

      {video.recording && (
        <section className="panel">
          <h2>Recording</h2>
          {video.live && <p className="muted">Still recording. Reopen this view later to watch to the end.</p>}
          {!failed ? (
            <video className="player" src={mediaUrl(video.recording)} controls preload="metadata" onError={() => setFailed(true)} />
          ) : (
            <div className="notice">
              <p>This recording cannot be played here{isMkv ? ' (older .mkv recording)' : ''}. Convert it to MP4 in a terminal:</p>
              <code>
                ffmpeg -i {video.recording.split('/').pop()} -c copy recording.mp4
              </code>
              <button onClick={() => api.reveal(video.recording)}>Show in Finder</button>
            </div>
          )}
        </section>
      )}

      {video.frames.length > 0 && (
        <section className="panel">
          <h2>Frame screenshots</h2>
          <Grid items={video.frames} onOpen={setOpen} />
        </section>
      )}
      {open !== null && <Lightbox items={video.frames} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

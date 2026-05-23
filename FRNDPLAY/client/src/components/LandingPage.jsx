import "./LandingPage.css";
import frndplayLogo from "../assets/frndplay-logo.png";
export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-section hero">
  <div className="landing-container">
    <div className="logo-wrap">
      <img src={frndplayLogo} alt="FRNDPLAY logo" className="logo" />
      <span>FRNDPLAY</span>
    </div>

    <h1>Turn song requests into a live shared queue.</h1>

    <p className="hero-subtitle">
      FRNDPLAY helps streamers, creators, and groups collect song
      requests, vote on tracks, and manage the queue in real time —
      without digging through chat.
    </p>

    <div className="button-row">
      <a href="/app" className="primary-btn">Launch FRNDPLAY</a>
      <a href="#demo" className="secondary-btn">Watch Demo</a>
    </div>

    <div className="feature-chips">
      <span>Live rooms</span>
      <span>Song voting</span>
      <span>Host controls</span>
      <span>Shareable links</span>
    </div>

    <p className="trust-line">
      Built for streamers, aux battles, parties, and creator communities.
    </p>

    <div className="app-preview">
      <div className="preview-header">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
        <p>Live Room: AUX NIGHT</p>
      </div>

      <div className="preview-body">
        <div className="now-playing">
          <p className="label">Now Playing</p>
          <h3>SZA — Snooze</h3>
          <p>Added by Jay</p>
        </div>

        <div className="queue-list">
          <div className="queue-item">
            <span>1</span>
            <div>
              <strong>Drake — Passionfruit</strong>
              <p>8 votes</p>
            </div>
          </div>

          <div className="queue-item">
            <span>2</span>
            <div>
              <strong>Brent Faiyaz — Clouded</strong>
              <p>6 votes</p>
            </div>
          </div>

          <div className="queue-item">
            <span>3</span>
            <div>
              <strong>Future — Use Me</strong>
              <p>5 votes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
            

      <section className="landing-section section-border">
        <div className="landing-container problem-grid">
          <div>
            <h2>Song requests get messy fast.</h2>
            <p className="section-text">
              When people drop songs in chat, DMs, or group messages, the host
              has to search manually, ask who the artist is, keep track of
              requests, and decide what plays next. FRNDPLAY turns that chaos
              into one simple shared room.
            </p>
          </div>

          <div className="card">
            <p className="section-text">Without FRNDPLAY:</p>
            <ul>
              <li>❌ Lost song requests in chat</li>
              <li>❌ Incomplete song names</li>
              <li>❌ Manual searching</li>
              <li>❌ No clean voting system</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container center">
          <h2>How it works</h2>

          <div className="steps-grid">
            {[
              ["1", "Create a room", "Start a live room for your stream, party, or group."],
              ["2", "Share the link", "Invite people with a simple room link or code."],
              ["3", "Add songs", "Guests search and submit songs directly into the queue."],
              ["4", "Vote together", "The room can vote on what should play next."],
              ["5", "Host controls", "The host manages playback and keeps the room moving."],
            ].map(([number, title, text]) => (
              <div className="card" key={number}>
                <div className="step-number">{number}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section use-cases">
        <div className="landing-container center">
          <h2>Made for any moment where people fight over the aux.</h2>
          <p className="section-text">
            FRNDPLAY works anywhere people want to suggest, vote on, and manage
            music together.
          </p>

          <div className="use-grid">
            {[
              ["🎥", "Streamers", "Let viewers submit and vote on songs during live segments."],
              ["🔥", "Aux battles", "Run cleaner aux wars without losing track of requests."],
              ["🎉", "Parties", "Let everyone add music without passing around one phone."],
              ["💬", "Creator communities", "Give your audience a more interactive music experience."],
            ].map(([icon, title, text]) => (
              <div className="card" key={title}>
                <div className="icon">{icon}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="landing-section">
        <div className="landing-container center">
          <h2>See FRNDPLAY in action.</h2>
          <p className="section-text">
            Demo video coming soon. The app is already live and ready to test.
          </p>

          <div className="demo-box">
            Demo placeholder — replace this section when your demo video is ready.
          </div>

          <div className="button-row">
            <a href="/app" className="primary-btn">Launch App</a>
            <a
              href="mailto:hiimkeion@gmail.com?subject=FRNDPLAY Creator Test"
              className="secondary-btn"
            >
              Request a Creator Test
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section creator-cta">
        <div className="landing-container center">
          <h2>Want to test FRNDPLAY with your audience?</h2>
          <p className="section-text">
            I’m looking for small streamers and creators to test FRNDPLAY during
            live song request segments, aux battles, music reactions, or
            community hangouts.
          </p>

          <a
            href="mailto:hiimkeion@gmail.com?subject=FRNDPLAY Creator Test"
            className="white-btn"
          >
            Contact for a Creator Test
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <p>FRNDPLAY — Built by Keion Dunlap</p>
          <div>
            <a href="/app">Launch App</a>
            <a href="#demo">Demo</a>
            <a href="mailto:hiimkeion@gmail.com">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
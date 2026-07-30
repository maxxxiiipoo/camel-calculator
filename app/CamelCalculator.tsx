"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_META,
  DEFAULT_WEIGHTS,
  MARKET_CONFIG,
  PREFERENCE_OPTIONS,
  QUESTIONS,
  type CategoryId,
  type PreferenceKey,
} from "../lib/config";
import { calculateScore, validWeightTotal, type Answers, type Preferences } from "../lib/scoring";

type Stage = "landing" | "consent" | "identity" | "preferences" | "quiz" | "reveal" | "result";
type Motion = "full" | "reduced" | "off";

const categoryOrder = Object.keys(CATEGORY_META) as CategoryId[];
const formatMoney = (value: number, currency: "USD" | "SAR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

function Camel({ className = "", gold = false }: { className?: string; gold?: boolean }) {
  return (
    <span className={`camel ${gold ? "gold" : ""} ${className}`} aria-hidden="true">
      <i className="camel-neck" /><i className="camel-head" /><i className="camel-ear" />
      <i className="camel-body" /><i className="hump one" /><i className="hump two" />
      <i className="leg a" /><i className="leg b" /><i className="leg c" /><i className="leg d" />
      <i className="tail" />
    </span>
  );
}

function DesertScene({ busy = false }: { busy?: boolean }) {
  return (
    <div className={`desert-scene ${busy ? "busy" : ""}`} aria-hidden="true">
      <div className="sun" /><div className="cloud c1" /><div className="cloud c2" />
      <div className="stars">✦ · ✧ · ✦ · ✧</div>
      <div className="dune back" /><div className="dune front" />
      <div className="caravan">
        <Camel /><Camel className="delay1" /><Camel className="delay2" />
      </div>
      <div className="dust d1" /><div className="dust d2" />
    </div>
  );
}

function Settings({ motion, setMotion, sound, setSound }: {
  motion: Motion; setMotion: (m: Motion) => void; sound: boolean; setSound: (s: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings">
      <button className="icon-button" aria-label="Visual and audio settings" onClick={() => setOpen(!open)}>⚙</button>
      {open && <div className="settings-panel">
        <strong>Show controls</strong>
        <label>Motion
          <select value={motion} onChange={(e) => setMotion(e.target.value as Motion)}>
            <option value="full">Full motion</option><option value="reduced">Reduced motion</option><option value="off">Motion off</option>
          </select>
        </label>
        <label className="toggle"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Sound effects <em>off by default</em></label>
      </div>}
    </div>
  );
}

export default function CamelCalculator() {
  const [stage, setStage] = useState<Stage>("landing");
  const [motion, setMotion] = useState<Motion>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "reduced"
      : "full",
  );
  const [sound, setSound] = useState(false);
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [rating, setRating] = useState<"myself" | "partner">("myself");
  const [name, setName] = useState("");
  const [preferences, setPreferences] = useState<Preferences>({});
  const [skipAppearance, setSkipAppearance] = useState(false);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [answers, setAnswers] = useState<Answers>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [displayCount, setDisplayCount] = useState(0);
  const [error, setError] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const result = useMemo(
    () => calculateScore(answers, preferences, weights, skipAppearance),
    [answers, preferences, weights, skipAppearance],
  );
  const current = QUESTIONS[questionIndex];
  const progress = Math.round((questionIndex / QUESTIONS.length) * 100);

  useEffect(() => {
    const onVisibility = () => document.documentElement.classList.toggle("page-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  useEffect(() => {
    if (stage !== "reveal") return;
    const c = window.setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 650);
    const reveal = window.setTimeout(() => {
      let count = 0;
      const ticker = window.setInterval(() => {
        count = Math.min(result.camelCount, count + Math.max(1, Math.ceil(result.camelCount / 24)));
        setDisplayCount(count);
        if (count >= result.camelCount) {
          window.clearInterval(ticker);
          window.setTimeout(() => setStage("result"), 600);
        }
      }, 45);
    }, 2100);
    return () => { window.clearInterval(c); window.clearTimeout(reveal); };
  }, [stage, result.camelCount, motion]);

  function begin() { setStage("consent"); }
  function restart() {
    setStage("landing"); setAnswers({}); setQuestionIndex(0); setName(""); setCountdown(3); setDisplayCount(0); setError("");
  }
  function nextQuestion() {
    if (answers[current.id] == null) { setError("The camel requires an answer. It is preparing to spit."); return; }
    setError("");
    if (questionIndex === QUESTIONS.length - 1) {
      if (motion === "off") {
        setCountdown(0);
        setDisplayCount(result.camelCount);
        setStage("result");
      } else {
        setStage("reveal");
      }
    }
    else setQuestionIndex((i) => i + 1);
  }
  function setPreference(key: PreferenceKey, value: string) {
    setPreferences((p) => ({ ...p, [key]: value === "none" ? null : Number(value) }));
  }
  async function share() {
    const text = `${name || "A mysterious traveler"} scored ${result.camelCount} fictional working camels — ${result.tier.title}. For entertainment only.`;
    if (navigator.share) {
      try { await navigator.share({ title: "Camel Calculator", text, url: location.href }); return; } catch {}
    }
    await navigator.clipboard.writeText(`${text} ${location.href}`);
    setError("Result copied. The desert post office is impressed.");
  }
  function downloadCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, "#111b3a"); grad.addColorStop(1, "#7d3025");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#eabf72"; ctx.font = "700 28px Georgia"; ctx.fillText("CAMEL CALCULATOR · DESERT EDITION", 70, 75);
    ctx.fillStyle = "#fff7df"; ctx.font = "700 42px Georgia"; ctx.fillText(name || "MYSTERIOUS TRAVELER", 70, 155);
    ctx.font = "700 170px Georgia"; ctx.fillText(String(result.camelCount), 65, 340);
    ctx.font = "700 34px Georgia"; ctx.fillText("FICTIONAL WORKING CAMELS", 410, 285);
    ctx.fillStyle = "#eabf72"; ctx.font = "italic 38px Georgia"; ctx.fillText(result.tier.title, 410, 335);
    const cats = categoryOrder;
    cats.forEach((key, i) => {
      const x = 70 + i * 175; const h = result.categoryScores[key] * 1.3;
      ctx.fillStyle = "#d36b46"; ctx.fillRect(x, 520 - h, 120, h);
      ctx.fillStyle = "#fff7df"; ctx.font = "18px sans-serif"; ctx.fillText(CATEGORY_META[key].short, x, 550);
    });
    ctx.fillStyle = "#fff7df"; ctx.font = "18px sans-serif"; ctx.fillText("FOR ENTERTAINMENT ONLY · PEOPLE ARE NOT PROPERTY", 70, 605);
    const link = document.createElement("a"); link.download = "camel-calculator-result.png"; link.href = canvas.toDataURL("image/png"); link.click();
  }

  return (
    <main>
      <Settings motion={motion} setMotion={setMotion} sound={sound} setSound={setSound} />
      {(stage === "landing" || stage === "consent") && <DesertScene busy={stage === "consent"} />}

      {stage === "landing" && <section className="hero">
        <div className="brand-lockup"><span className="eyebrow">THE INTERNET’S LEAST NECESSARY METRIC</span><span className="brand-mark">CC</span></div>
        <h1>Camel<br /><em>Calculator</em></h1>
        <p className="lead">Two minutes. One desert. An unreasonable number of fictional working camels.</p>
        <button className="primary stampede" onClick={begin}>Count the Camels <span>→</span></button>
        <p className="micro">Adults only · subjective preferences · zero science · no photos</p>
        <div className="ticket"><span>TONIGHT ONLY</span><strong>THE GREAT HERD REVEAL</strong><i>✦ RIYADH MARKET FANTASY EDITION ✦</i></div>
      </section>}

      {stage === "consent" && <section className="panel compact">
        <span className="eyebrow">BEFORE THE CARAVAN DEPARTS</span>
        <h2>Adults. Consent. A sense of humor.</h2>
        <p>This is fictional entertainment. A human being’s worth cannot be measured, and body shape does not establish fertility or childbirth ability.</p>
        <label className="check"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /><span><strong>I am 18 or older</strong><small>This experience is strictly for adults.</small></span></label>
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><strong>I understand the joke</strong><small>Only rate adults who are in on the joke.</small></span></label>
        <button className="primary" disabled={!adult || !consent} onClick={() => setStage("identity")}>Enter the desert →</button>
      </section>}

      {stage === "identity" && <section className="panel">
        <StepHeader number="01" title="Who’s entering the arena?" subtitle="The answer stays in this browser unless you explicitly share the result." />
        <div className="choice-grid">
          <button className={rating === "myself" ? "choice active" : "choice"} onClick={() => setRating("myself")}><span>☀</span><strong>Rate myself</strong><small>Bold. Efficient. Respect.</small></button>
          <button className={rating === "partner" ? "choice active" : "choice"} onClick={() => setRating("partner")}><span>♡</span><strong>Rate a consenting partner</strong><small>They are an adult and in on the joke.</small></button>
        </div>
        <label className="field"><span>First name or nickname <em>optional</em></span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="The Oasis Enigma" /></label>
        <div className="actions"><button className="text-button" onClick={() => setStage("consent")}>← Back</button><button className="primary" onClick={() => setStage("preferences")}>Build preference profile →</button></div>
      </section>}

      {stage === "preferences" && <section className="panel wide">
        <StepHeader number="02" title="Desert Preference Profile" subtitle="You set the ideal. The quiz measures proximity—no trait is universally superior." />
        <label className="skip"><input type="checkbox" checked={skipAppearance} onChange={(e) => setSkipAppearance(e.target.checked)} /><span><strong>Skip appearance scoring</strong><small>Its 65% weight moves proportionally to non-appearance categories.</small></span></label>
        {!skipAppearance && <div className="preference-grid">
          {(Object.keys(PREFERENCE_OPTIONS) as PreferenceKey[]).map((key) => <label key={key}>
            <span>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
            <select value={preferences[key] == null ? "none" : preferences[key]} onChange={(e) => setPreference(key, e.target.value)}>
              <option value="none">No preference</option>
              {PREFERENCE_OPTIONS[key].map((option, i) => <option value={i} key={option}>{option}</option>)}
            </select>
          </label>)}
        </div>}
        <details className="weights"><summary>Customize category weights <span>{Object.values(weights).reduce((a, b) => a + b, 0)}% total</span></summary>
          <div className="weight-grid">{categoryOrder.map((key) => <label key={key}><span>{CATEGORY_META[key].short}</span><input type="number" min="0" max="100" value={weights[key]} onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })} /><i>%</i></label>)}</div>
          {!validWeightTotal(weights) && <p className="validation">Weights must total exactly 100%.</p>}
          <button className="text-button" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>Reset to dramatic defaults</button>
        </details>
        <div className="actions"><button className="text-button" onClick={() => setStage("identity")}>← Back</button><button className="primary" disabled={!validWeightTotal(weights)} onClick={() => setStage("quiz")}>Start the crossing →</button></div>
      </section>}

      {stage === "quiz" && <section className="quiz-shell">
        <div className="map" aria-label={`${progress}% complete`}><div className="map-track"><div className="map-fill" style={{ width: `${progress}%` }} /><Camel className="map-camel" /></div><span>BASE CAMP</span><span>THE OASIS</span></div>
        <div className="quiz-card" key={current.id}>
          <div className="category-flag">{CATEGORY_META[current.category].icon} {CATEGORY_META[current.category].label}</div>
          <div className="question-count">{String(questionIndex + 1).padStart(2, "0")} / {QUESTIONS.length}</div>
          {current.id === "cooking" && <div className="chef-camel"><Camel /><b>CHEF</b></div>}
          <span className="question-icon">{current.icon}</span><h2>{current.label}</h2><p>{current.hint}</p>
          {current.options ? <div className="option-row">{current.options.map((option, i) => <button key={option} className={answers[current.id] === i ? "scale-option selected" : "scale-option"} onClick={() => setAnswers({ ...answers, [current.id]: i })}><span className={`abstract-shape s${i}`} /><strong>{option}</strong></button>)}</div>
          : <div className="rating-row" role="radiogroup" aria-label={current.label}>{[0,1,2,3,4].map((value) => <button role="radio" aria-checked={answers[current.id] === value} key={value} className={answers[current.id] === value ? "rating selected" : "rating"} onClick={() => setAnswers({ ...answers, [current.id]: value })}><strong>{value + 1}</strong><span>{["Barely", "A little", "Solid", "Excellent", "Legendary"][value]}</span></button>)}</div>}
          {error && <div className="error" role="alert"><span>💦</span>{error}</div>}
          <div className="quiz-actions"><button className="text-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}>← Previous</button><button className="primary" onClick={nextQuestion}>{questionIndex === QUESTIONS.length - 1 ? "Summon the herd" : "Next crossing"} →</button></div>
        </div>
        <div className="preview-herd" aria-hidden="true">{Array.from({ length: Math.min(6, Math.floor(Object.values(answers).filter((v) => v >= 3).length / 2)) }).map((_, i) => <Camel key={i} />)}</div>
      </section>}

      {stage === "reveal" && <section className="reveal">
        <div className="sandstorm" /><p>THE HERD IS APPROACHING</p>
        {countdown > 0 ? <div className="countdown">{countdown}</div> : <><div className="rolling-count">{displayCount}</div><Camel className="hero-camel" /><div className="reveal-herd">{Array.from({ length: Math.min(12, Math.ceil(displayCount / 15)) }).map((_, i) => <Camel key={i} gold={result.camelCount >= 180 && i === 5} />)}</div></>}
      </section>}

      {stage === "result" && <section className={`result tier-${Math.floor(result.camelCount / 40)}`}>
        <div className="result-hero">
          <span className="eyebrow">THE OFFICIAL UNOFFICIAL VERDICT</span>
          <p>{name || (rating === "myself" ? "You are" : "Your desert companion is")}</p>
          <div className="big-number">{result.camelCount}</div>
          <h1>fictional working camels</h1>
          <h2>{result.tier.title}</h2><p className="result-message">“{result.message}”</p>
          <Camel className="result-camel" gold={result.camelCount >= 180} />
        </div>
        <div className="result-grid">
          <article className="score-card"><span className="card-label">THE DESERT LEDGER</span><h3>How the herd formed</h3>
            <div className="bars">{categoryOrder.map((key) => <div className="bar" key={key}><div><span>{CATEGORY_META[key].label}</span><strong>{Math.round(result.categoryScores[key])}</strong></div><i><b style={{ width: `${result.categoryScores[key]}%` }} /></i></div>)}</div>
            <div className="bonus"><span>✦ Proportion harmony</span><strong>+{result.proportionHarmonyBonus.toFixed(1)}</strong><span>✦ Well-rounded bonus</span><strong>+{result.wellRoundedBonus.toFixed(1)}</strong></div>
            <details><summary>How it works</summary><p>Each answer is scored against your own preference profile using a bell-shaped fit curve. Exact matches earn the most; nearby answers remain strong; distant answers taper off. Category scores follow your weights, then two small capped bonuses are applied. The final 0–100 entertainment score maps deterministically to 12–220 camels. It is not scientific.</p></details>
            {process.env.NODE_ENV === "development" && <details><summary>Developer breakdown</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
          </article>
          <article className="economics"><span className="card-label">IMAGINARY HERD ECONOMICS</span><h3>What might that herd represent?</h3>
            {[["Low", MARKET_CONFIG.lowUsd], ["Reference", MARKET_CONFIG.referenceUsd], ["High", MARKET_CONFIG.highUsd]].map(([label, raw]) => { const value = Number(raw) * result.camelCount; return <div className="money-row" key={String(label)}><span>{label} herd estimate<small>@ {formatMoney(Number(raw), "USD")} / working camel</small></span><strong>{formatMoney(value, "USD")}<small>{formatMoney(value * MARKET_CONFIG.usdToSar, "SAR")}</small></strong></div>; })}
            <p className="market-note"><strong>{MARKET_CONFIG.market} · {MARKET_CONFIG.assumptionVersion}</strong><br />Illustrative estimates only. Real camel prices vary substantially by age, health, training, breed, sex, lineage, market conditions, and intended use. Racing, breeding, and prize-winning camels may fall far outside this ordinary working-camel range.</p>
          </article>
        </div>
        <div className="share-card" ref={cardRef}><span>DESERT POSTCARD</span><strong>{result.camelCount}</strong><h3>{result.tier.title}</h3><div className="mini-bars">{categoryOrder.map((key) => <i key={key} style={{ height: `${Math.max(10, result.categoryScores[key])}%` }} />)}</div><small>CAMEL CALCULATOR · FOR ENTERTAINMENT ONLY</small></div>
        {error && <p className="copy-status" role="status">{error}</p>}
        <div className="result-actions"><button className="secondary" onClick={downloadCard}>↓ Download postcard</button><button className="primary" onClick={share}>Share the absurdity ↗</button><button className="text-button" onClick={() => setStage("preferences")}>Adjust preferences</button><button className="text-button reset" onClick={restart}><Camel /> Start over</button></div>
      </section>}

      <footer><strong>Camel Calculator</strong><p>Fictional entertainment for consenting adults. People are not property. Appearance preferences are subjective. Body shape does not establish fertility or childbirth ability. Responses stay in your browser unless you share.</p><button onClick={() => (document.getElementById("safety") as HTMLDialogElement)?.showModal()}>Privacy & safety</button></footer>
      <dialog id="safety"><button className="dialog-close" onClick={() => (document.getElementById("safety") as HTMLDialogElement)?.close()}>×</button><h2>The serious bit, briefly.</h2><p>This is a fictional, adults-only attraction and compatibility quiz—not a price, diagnosis, fertility assessment, or statement of human worth. Only rate consenting adults who are in on the joke. No answers are sent to a server. Sharing is always your choice.</p></dialog>
    </main>
  );
}

function StepHeader({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return <header className="step-header"><span>{number}</span><div><p>DESERT CHECKPOINT</p><h1>{title}</h1><small>{subtitle}</small></div></header>;
}

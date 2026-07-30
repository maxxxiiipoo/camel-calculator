"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { MARKET_CONFIG, UPLOAD_LIMITS, type VisualCategory, type VisualObservation } from "../lib/config";
import { herdEconomics, scoreObservation } from "../lib/scoring";

type Stage = "landing" | "consent" | "upload" | "analyzing" | "reveal" | "result";
type Motion = "full" | "reduced" | "off";
type Photo = { id: string; url: string; dataUrl: string; rotation: number; zoom: number };

const labels: Record<VisualCategory, string> = { face: "Face & harmony", body: "Body proportions", hair: "Hair", style: "Style", coherence: "Visual coherence" };
const money = (value: number, currency: "USD" | "SAR") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

function Camel({ className = "", gold = false }: { className?: string; gold?: boolean }) {
  return <span className={`camel ${gold ? "gold" : ""} ${className}`} aria-hidden="true"><i className="camel-neck" /><i className="camel-head" /><i className="camel-ear" /><i className="camel-body" /><i className="hump one" /><i className="hump two" /><i className="leg a" /><i className="leg b" /><i className="leg c" /><i className="leg d" /><i className="tail" /></span>;
}

function DesertScene() {
  return <div className="desert-scene" aria-hidden="true"><div className="sun" /><div className="cloud c1" /><div className="cloud c2" /><div className="stars">✦ · ✧ · ✦ · ✧</div><div className="dune back" /><div className="dune front" /><div className="caravan"><Camel /><Camel className="delay1" /><Camel className="delay2" /></div></div>;
}

async function sanitizeImage(file: File, rotation = 0, zoom = 1) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sig = (file.type === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8) ||
    (file.type === "image/png" && header[0] === 137 && header[1] === 80) ||
    (file.type === "image/webp" && String.fromCharCode(...header.slice(0, 4)) === "RIFF");
  if (!UPLOAD_LIMITS.acceptedMimeTypes.includes(file.type as never) || !sig || file.size > UPLOAD_LIMITS.maxBytes) throw new Error("Use a genuine JPEG, PNG, or WebP under 8 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > UPLOAD_LIMITS.maxDimension || bitmap.height > UPLOAD_LIMITS.maxDimension) throw new Error("That image is too large. Maximum dimensions are 4096 × 4096.");
  const max = 1440;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const swap = Math.abs(rotation % 180) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((swap ? bitmap.height : bitmap.width) * scale);
  canvas.height = Math.round((swap ? bitmap.width : bitmap.height) * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f3dfb3"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.scale(zoom, zoom);
  ctx.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

export default function CamelCalculator() {
  const [stage, setStage] = useState<Stage>("landing");
  const [motion, setMotion] = useState<Motion>(() =>
    typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full",
  );
  const [consents, setConsents] = useState([false, false, false, false, false]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(0);
  const [error, setError] = useState("");
  const [observation, setObservation] = useState<VisualObservation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => observation ? scoreObservation(observation) : null, [observation]);
  const economics = result ? herdEconomics(result.camels) : null;

  useEffect(() => { document.documentElement.dataset.motion = motion; }, [motion]);

  async function addFiles(files: FileList | File[]) {
    setError("");
    const selected = Array.from(files).slice(0, UPLOAD_LIMITS.maxFiles - photos.length);
    try {
      const added = await Promise.all(selected.map(async (file) => {
        const dataUrl = await sanitizeImage(file);
        return { id: crypto.randomUUID(), url: dataUrl, dataUrl, rotation: 0, zoom: 1 };
      }));
      setPhotos((existing) => [...existing, ...added]);
    } catch (e) { setError(e instanceof Error ? e.message : "That photograph could not be prepared."); }
  }
  function removePhoto(id: string) { setPhotos((items) => items.filter((p) => p.id !== id)); }
  async function rotatePhoto(photo: Photo) {
    const response = await fetch(photo.dataUrl); const file = new File([await response.blob()], "photo.jpg", { type: "image/jpeg" });
    const rotation = (photo.rotation + 90) % 360; const dataUrl = await sanitizeImage(file, 90);
    setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, rotation, dataUrl, url: dataUrl } : p));
  }
  function deletePhotos() { setPhotos([]); setObservation(null); setError(""); setStage("upload"); }
  function restart() { setPhotos([]); setObservation(null); setError(""); setName(""); setConsents([false, false, false, false, false]); setStage("landing"); }

  async function analyze() {
    setStage("analyzing"); setStatus(0); setError("");
    const timer = window.setInterval(() => setStatus((s) => Math.min(5, s + 1)), 900);
    try {
      const preparedImages = await Promise.all(photos.map(async (photo) => {
        const response = await fetch(photo.dataUrl);
        const file = new File([await response.blob()], "sanitized.jpg", { type: "image/jpeg" });
        return sanitizeImage(file, 0, photo.zoom);
      }));
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: preparedImages }) });
      const body = await response.json() as { observation?: VisualObservation; error?: string };
      if (!response.ok || !body.observation) throw new Error(body.error || "The caravan could not finish the analysis.");
      setObservation(body.observation); setStatus(6);
      window.setTimeout(() => setStage(motion === "off" ? "result" : "reveal"), motion === "off" ? 0 : 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed."); setStage("upload");
    } finally { window.clearInterval(timer); }
  }
  function downloadCard() {
    if (!result) return;
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d")!; const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, "#101a38"); grad.addColorStop(1, "#8d3f2f"); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#e7b95f"; ctx.font = "700 28px Georgia"; ctx.fillText("CAMEL CALCULATOR · VISUAL EDITION", 65, 75);
    ctx.fillStyle = "#fff8e8"; ctx.font = "700 44px Georgia"; ctx.fillText(name || "MYSTERIOUS TRAVELER", 65, 150);
    ctx.font = "700 190px Georgia"; ctx.fillText(String(result.camels), 60, 375); ctx.font = "700 34px Georgia"; ctx.fillText("FICTIONAL WORKING CAMELS", 420, 275);
    ctx.fillStyle = "#e7b95f"; ctx.font = "italic 42px Georgia"; ctx.fillText(result.tier.title, 420, 335);
    ctx.fillStyle = "#fff8e8"; ctx.font = "22px Arial"; ctx.fillText(`Analysis confidence: ${Math.round(result.confidence * 100)}%`, 420, 390);
    ctx.font = "18px Arial"; ctx.fillText("FICTIONAL ENTERTAINMENT FOR CONSENTING ADULTS · PHOTO NOT INCLUDED", 65, 585);
    const a = document.createElement("a"); a.download = "camel-calculator-result.png"; a.href = canvas.toDataURL("image/png"); a.click();
  }

  return <main>
    <div className="settings"><select aria-label="Motion preference" value={motion} onChange={(e) => setMotion(e.target.value as Motion)}><option value="full">Full motion</option><option value="reduced">Reduced motion</option><option value="off">Motion off</option></select></div>
    {(stage === "landing" || stage === "consent") && <DesertScene />}
    {stage === "landing" && <section className="hero"><span className="eyebrow">THE INTERNET’S LEAST NECESSARY VISUAL ANALYSIS</span><h1>Camel<br /><em>Calculator</em></h1><p className="lead">Upload one to three appropriate photos. The caravan observes visible traits. Your private rubric counts the fictional camels.</p><button className="primary stampede" onClick={() => setStage("consent")}>Upload & Calculate <span>→</span></button><p className="micro">Adults only · no face recognition · no permanent photo storage · zero science</p></section>}

    {stage === "consent" && <section className="panel compact consent-photo"><span className="eyebrow">PHOTO RIGHTS CHECKPOINT</span><h2>Adults. Permission. Appropriate photos.</h2><p>Only upload photos of adults who are in on the joke.</p>
      {[
        "Every person shown is at least 18 years old.",
        "I am the person shown or have that person’s permission.",
        "The image is not intimate, explicit, private, or deceptive.",
        "The result is fictional entertainment.",
        "I understand that a person’s real worth cannot be calculated.",
      ].map((copy, i) => <label className="check" key={copy}><input type="checkbox" checked={consents[i]} onChange={(e) => setConsents((c) => c.map((v, x) => x === i ? e.target.checked : v))} /><span><strong>{copy}</strong></span></label>)}
      <button className="primary" disabled={!consents.every(Boolean)} onClick={() => setStage("upload")}>Choose photographs →</button>
    </section>}

    {stage === "upload" && <section className="upload-page"><header><span className="eyebrow">VISUAL EVIDENCE · 1–3 PHOTOS</span><h1>Give the caravan<br /><em>a clear view.</em></h1><p>A face photo is best. A front or three-quarter full-body photo improves coverage. A third angle is optional—more photos never add points.</p></header>
      <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}>
        <Camel /><strong>{photos.length ? "Add another angle" : "Drop photographs into the desert"}</strong><span>or tap to choose from your device</span><small>JPEG, PNG, WebP · 8 MB each · up to 4096 px</small>
        <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <aside className="privacy-note"><strong>☾ Your photos are private cargo.</strong><p>They are re-encoded in your browser to strip metadata, sent only for this analysis, never placed in public storage, never added to the share card, and not retained by Camel Calculator. Restart deletes local photo state.</p></aside>
      {photos.length > 0 && <div className="photo-grid">{photos.map((photo, i) => <article className="photo-card" key={photo.id}><div className="photo-frame"><img src={photo.url} alt={`Selected photograph ${i + 1}`} style={{ transform: `scale(${photo.zoom})` }} /></div><div><strong>VIEW {i + 1}</strong><button onClick={() => rotatePhoto(photo)}>↻ Rotate</button><label>Crop <input aria-label={`Crop photo ${i + 1}`} type="range" min="1" max="1.6" step=".1" value={photo.zoom} onChange={(e) => setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, zoom: Number(e.target.value) } : p))} /></label><button onClick={() => removePhoto(photo.id)}>Remove</button></div></article>)}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <label className="field nickname"><span>Nickname <em>optional</em></span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="The Oasis Enigma" /></label>
      <div className="actions"><button className="text-button danger" disabled={!photos.length} onClick={deletePhotos}>Delete my photos</button><button className="primary" disabled={!photos.length} onClick={analyze}>Analyze {photos.length || ""} photo{photos.length === 1 ? "" : "s"} →</button></div>
    </section>}

    {stage === "analyzing" && <section className="analysis-stage"><div className="analysis-camels"><div className="inspector"><span className="spectacles">◉ ◉</span><Camel /><i>CLIPBOARD</i></div><div className="rope-camel"><Camel /><span>〰 〰</span></div></div><div className="floating-photos">{photos.map((p) => <img key={p.id} src={p.url} alt="" />)}</div><div className="road-sign">{["Consulting the caravan", "Checking visible evidence", "Observing face & hair", "Reviewing proportions", "Balancing the humps", "Stamping OBSERVED", "Ready for the herd"][status]}</div><div className="analysis-progress"><i style={{ width: `${(status + 1) / 7 * 100}%` }} /></div><p>Observation and scoring are separate. No scientific, biometric, medical, or fertility claims are being made.</p></section>}

    {stage === "reveal" && result && <section className="reveal"><div className="sandstorm" /><p>THE HERD HAS BEEN CALCULATED</p><div className="rolling-count">{result.camels}</div><Camel className="hero-camel" gold={result.camels >= 180} /><div className="reveal-herd">{Array.from({ length: Math.min(12, Math.ceil(result.camels / 15)) }).map((_, i) => <Camel key={i} gold={result.camels >= 180 && i === 5} />)}</div><button className="primary reveal-button" onClick={() => setStage("result")}>See the desert ledger →</button></section>}

    {stage === "result" && result && observation && economics && <section className="result"><div className="result-hero"><span className="eyebrow">VISIBLE-APPEARANCE ENTERTAINMENT RESULT</span><p>{name || "This mysterious traveler"} scored</p><div className="big-number">{result.camels}</div><h1>fictional working camels</h1><h2>{result.tier.title}</h2><p className="result-message">People are not property. This is a subjective visual joke, not a real valuation.</p><Camel className="result-camel" gold={result.camels >= 180} /></div>
      <div className="result-grid"><article className="score-card"><span className="card-label">VISIBLE TRAIT BREAKDOWN</span><h3>What the caravan could assess</h3>{(Object.keys(labels) as VisualCategory[]).map((key) => <div className="bar" key={key}><div><span>{labels[key]}</span><strong>{result.categoryScores[key] == null ? "Not visible" : Math.round(result.categoryScores[key]!)}</strong></div><i><b style={{ width: `${result.categoryScores[key] ?? 0}%` }} /></i></div>)}<div className="confidence"><strong>Analysis confidence</strong><span>{Math.round(result.confidence * 100)}% · {result.confidence >= .8 ? "High" : "Moderate"}</span></div>{result.missingTraits.length > 0 && <p className="missing"><strong>Could not assess:</strong> {result.missingTraits.join(", ")}</p>}<details><summary>Why this result?</summary><p>Visible observations were matched to the repository’s private rubric. Unknown traits were removed and their weight redistributed within the category. Image quality changed confidence, not attractiveness points. The vision layer never chose a camel count; the deterministic scoring module did.</p></details></article>
      <article className="economics"><span className="card-label">IMAGINARY HERD ECONOMICS</span><h3>Ordinary working dromedaries</h3>{[["Low", economics.low, economics.lowSar],["Reference", economics.reference, economics.referenceSar],["High", economics.high, economics.highSar]].map(([l,u,s]) => <div className="money-row" key={String(l)}><span>{l} estimate</span><strong>{money(Number(u),"USD")}<small>{money(Number(s),"SAR")}</small></strong></div>)}<p className="market-note">{MARKET_CONFIG.market} · {MARKET_CONFIG.assumptionVersion}. Illustrative only. Racing, breeding, festival, and prize-winning camels may fall far outside this ordinary working-camel range.</p></article></div>
      <div className="result-actions"><button className="secondary" onClick={downloadCard}>↓ Download privacy-safe card</button><button className="text-button danger" onClick={deletePhotos}>Delete my photos</button><button className="text-button" onClick={restart}>Start over</button></div>
    </section>}
    <footer><strong>Camel Calculator</strong><p>Fictional entertainment for consenting adults. No face recognition. No claims about health, fertility, personality, ethnicity, intelligence, maternal ability, or childbirth. Photos are never included in the default share card.</p></footer>
  </main>;
}

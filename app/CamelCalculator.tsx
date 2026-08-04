"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { track } from "@vercel/analytics";
import { LOCAL_MODEL, MARKET_CONFIG, UPLOAD_LIMITS, VISUAL_RUBRIC, type VisualCategory, type VisualObservation } from "../lib/config";
import { herdEconomics, nonlinearFit, scoreObservation } from "../lib/scoring";

type Stage = "landing" | "consent" | "upload" | "analyzing" | "reveal" | "result";
type Motion = "full" | "reduced" | "off";
type Photo = { id: string; url: string; dataUrl: string; rotation: number; zoom: number };
type ObserverPhase = "idle" | "downloading" | "loading" | "analyzing";
type LeaderboardEntry = { id: string; displayName: string; camelCount: number; rank: number; photoUrl: string; submittedAt: string };

const LEADERBOARD_ORIGIN = "https://camel-calculator.mghockey61858841.chatgpt.site";

const labels: Record<VisualCategory, string> = { face: "Face & harmony", body: "Body proportions", hair: "Hair", style: "Style", coherence: "Visual coherence" };
const money = (value: number, currency: "USD" | "SAR") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const describeTrait = (value: string) => value === "not_visible" || value === "unknown"
  ? "Not visible"
  : value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const describeMatch = (value: string, preferred: string) => {
  if (value === "not_visible" || value === "unknown") return "Not visible";
  const fit = nonlinearFit(value, preferred);
  return fit >= 0.9 ? "Strong preference match" : fit >= 0.6 ? "Partial preference match" : "Different from configured preference";
};

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

function sanitizedDataUrlToFile(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:image/jpeg;base64,")) {
    throw new Error("The prepared photograph is invalid. Remove it and upload it again.");
  }
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], "sanitized.jpg", { type: "image/jpeg" });
}

export default function CamelCalculator() {
  const [stage, setStage] = useState<Stage>("landing");
  const [motion, setMotion] = useState<Motion>(() =>
    typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full",
  );
  const [consents, setConsents] = useState([false, false, false, false, false, false]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(0);
  const [observerPhase, setObserverPhase] = useState<ObserverPhase>("idle");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(LOCAL_MODEL.estimatedDownloadBytes);
  const [backend, setBackend] = useState<"webgpu" | "wasm">("wasm");
  const [modelCached, setModelCached] = useState(false);
  const [metrics, setMetrics] = useState<{ analysisMs: number; backend: string } | null>(null);
  const [error, setError] = useState("");
  const [observation, setObservation] = useState<VisualObservation | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [leaderboardConsent, setLeaderboardConsent] = useState(false);
  const [leaderboardBusy, setLeaderboardBusy] = useState(false);
  const [leaderboardMessage, setLeaderboardMessage] = useState("");
  const [shareCardUrl, setShareCardUrl] = useState("");
  const [shareCardBlob, setShareCardBlob] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const backendRef = useRef<"webgpu" | "wasm">("wasm");
  const preparedRef = useRef<string[]>([]);
  const progressRef = useRef(new Map<string, { loaded: number; total: number }>());
  const trackedResultRef = useRef<string | null>(null);
  const result = useMemo(() => observation ? scoreObservation(observation) : null, [observation]);
  const economics = result ? herdEconomics(result.camels) : null;
  const analyticsConsent = consents[5];

  useEffect(() => { document.documentElement.dataset.motion = motion; }, [motion]);
  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    if (!analyticsConsent || !result || stage !== "result") return;
    const resultKey = `${result.camels}:${result.tier.title}:${photos.length}`;
    if (trackedResultRef.current === resultKey) return;
    trackedResultRef.current = resultKey;
    const band = (value: number | null) => value == null ? "not_visible" : `${Math.floor(value / 10) * 10}-${Math.floor(value / 10) * 10 + 9}`;
    track("camel_result", {
      camel_band: `${Math.floor(result.camels / 10) * 10}-${Math.floor(result.camels / 10) * 10 + 9}`,
      tier: result.tier.title,
      face_score_band: band(result.categoryScores.face),
      body_score_band: band(result.categoryScores.body),
      photo_count: photos.length,
      observer_backend: metrics?.backend ?? backend,
    });
  }, [analyticsConsent, backend, metrics?.backend, photos.length, result, stage]);
  useEffect(() => {
    if (stage === "upload" && "caches" in window) {
      caches.has("transformers-cache").then(setModelCached);
    }
  }, [stage]);

  function createObserverWorker() {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./local-observer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "phase") setObserverPhase(message.phase);
      if (message.type === "progress") {
        const item = message.event;
        if (item.status === "progress" && typeof item.loaded === "number") {
          progressRef.current.set(item.file ?? crypto.randomUUID(), { loaded: item.loaded, total: item.total ?? 0 });
          const values = [...progressRef.current.values()];
          setDownloadedBytes(values.reduce((sum, value) => sum + value.loaded, 0));
          const total = values.reduce((sum, value) => sum + value.total, 0);
          if (total > 0) setDownloadTotal(total);
        }
      }
      if (message.type === "ready") {
        backendRef.current = message.backend;
        setBackend(message.backend);
        setModelCached(true);
        worker.postMessage({ type: "analyze", images: preparedRef.current });
      }
      if (message.type === "photo") setStatus(message.index);
      if (message.type === "retry") setStatus(message.index);
      if (message.type === "complete") {
        const value = message.observation as VisualObservation;
        setMetrics(message.metrics);
        if (!value.evidence.appropriate || value.evidence.adultConfidence < VISUAL_RUBRIC.minimumAdultConfidence) {
          setError("The photo appears to contain no person or explicit content. No score was produced. Try a different appropriate photo.");
          setStage("upload");
          return;
        }
        setObservation(value);
        setStage(motion === "off" ? "result" : "reveal");
      }
      if (message.type === "cache-status") setModelCached(Boolean(message.cached));
      if (message.type === "cache-cleared") setModelCached(false);
      if (message.type === "error") {
        if (backendRef.current === "webgpu") {
          backendRef.current = "wasm";
          setBackend("wasm");
          setObserverPhase("loading");
          createObserverWorker().postMessage({ type: "load", device: "wasm" });
          return;
        }
        setError(message.message || "Local analysis failed. Try again or use a clearer photograph.");
        setStage("upload");
      }
    };
    worker.onerror = () => {
      setError("This device could not start the private local observer.");
      setStage("upload");
    };
    return worker;
  }

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
    const file = sanitizedDataUrlToFile(photo.dataUrl);
    const rotation = (photo.rotation + 90) % 360; const dataUrl = await sanitizeImage(file, 90);
    setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, rotation, dataUrl, url: dataUrl } : p));
  }
  function deletePhotos() {
    workerRef.current?.postMessage({ type: "cancel" });
    preparedRef.current = [];
    setPhotos([]); setObservation(null); setError(""); setStage("upload");
  }
  function restart() {
    preparedRef.current = [];
    if (shareCardUrl) URL.revokeObjectURL(shareCardUrl);
    setPhotos([]); setObservation(null); setError(""); setName(""); setConsents([false, false, false, false, false, false]); setShareCardUrl(""); setShareCardBlob(null); trackedResultRef.current = null; setStage("landing");
  }

  async function analyze() {
    setStage("analyzing"); setStatus(0); setError(""); setObserverPhase("downloading");
    setDownloadedBytes(0); progressRef.current.clear();
    try {
      preparedRef.current = await Promise.all(photos.map(async (photo) => {
        const file = sanitizedDataUrlToFile(photo.dataUrl);
        return sanitizeImage(file, 0, photo.zoom);
      }));
      const capability = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> }; deviceMemory?: number };
      const canWebGpu = Boolean(capability.gpu && (capability.deviceMemory == null || capability.deviceMemory >= 4));
      const selectedBackend = canWebGpu ? "webgpu" : "wasm";
      backendRef.current = selectedBackend;
      setBackend(selectedBackend);
      createObserverWorker().postMessage({ type: "load", device: selectedBackend });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed."); setStage("upload");
    }
  }
  function cancelAnalysis() {
    workerRef.current?.postMessage({ type: "cancel" });
    workerRef.current?.terminate();
    workerRef.current = null;
    setError("Local analysis was cancelled. Partially downloaded files may remain cached.");
    setStage("upload");
  }
  function removeDownloadedModel() {
    const worker = workerRef.current ?? createObserverWorker();
    worker.postMessage({ type: "clear-cache" });
  }
  async function loadImage(source: string) {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode();
    return image;
  }
  async function createCardBlob() {
    if (!result || !photos[0]) throw new Error("The photo is no longer available on this device.");
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d")!; const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, "#101a38"); grad.addColorStop(1, "#8d3f2f"); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
    const image = await loadImage(photos[0].dataUrl);
    const imageScale = Math.max(440 / image.width, 550 / image.height);
    const drawWidth = image.width * imageScale; const drawHeight = image.height * imageScale;
    ctx.save(); ctx.beginPath(); ctx.roundRect(38, 40, 440, 550, 18); ctx.clip();
    ctx.drawImage(image, 38 + (440 - drawWidth) / 2, 40 + (550 - drawHeight) / 2, drawWidth, drawHeight); ctx.restore();
    ctx.strokeStyle = "#e7b95f"; ctx.lineWidth = 7; ctx.strokeRect(38, 40, 440, 550);
    ctx.fillStyle = "#e7b95f"; ctx.font = "700 24px Georgia"; ctx.fillText("♛  CAMEL CALCULATOR", 530, 82);
    ctx.fillStyle = "#fff8e8"; ctx.font = "italic 38px Georgia"; ctx.fillText("I’m worth", 530, 160);
    ctx.fillStyle = "#e7b95f"; ctx.font = "700 190px Georgia"; ctx.fillText(String(result.camels), 515, 340);
    ctx.fillStyle = "#fff8e8"; ctx.font = "700 48px Georgia"; ctx.fillText("CAMELS", 535, 395);
    ctx.fillStyle = "#e7b95f"; ctx.font = "italic 31px Georgia"; ctx.fillText(result.tier.title, 535, 450);
    ctx.fillStyle = "#fff8e8"; ctx.font = "700 23px Arial"; ctx.fillText("How many camels are you worth?", 535, 525);
    ctx.font = "15px Arial"; ctx.fillStyle = "#fff8e8aa"; ctx.fillText("FICTIONAL ENTERTAINMENT · CONSENTING ADULTS", 535, 565);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create card.")), "image/png"));
  }
  async function createShareableCard() {
    try {
      const blob = await createCardBlob();
      if (shareCardUrl) URL.revokeObjectURL(shareCardUrl);
      setShareCardBlob(blob); setShareCardUrl(URL.createObjectURL(blob));
    } catch (e) { setLeaderboardMessage(e instanceof Error ? e.message : "Could not create the share card."); }
  }
  function downloadShareCard() {
    if (!shareCardUrl) return;
    const anchor = document.createElement("a"); anchor.download = "my-camel-count.png"; anchor.href = shareCardUrl; anchor.click();
  }
  async function nativeShareCard() {
    if (!shareCardBlob) return;
    const file = new File([shareCardBlob], "my-camel-count.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: "My Camel Calculator result", text: `I’m worth ${result?.camels} fictional camels.`, files: [file] });
    else downloadShareCard();
  }
  async function leaderboardPhoto() {
    if (!photos[0]) throw new Error("The photo is no longer available.");
    const image = await loadImage(photos[0].dataUrl);
    const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 600;
    const ctx = canvas.getContext("2d")!; const scale = Math.max(480 / image.width, 600 / image.height);
    const width = image.width * scale; const height = image.height * scale;
    ctx.drawImage(image, (480 - width) / 2, (600 - height) / 2, width, height);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not process leaderboard photo.")), "image/jpeg", .78));
  }
  async function openLeaderboard() {
    setLeaderboardOpen(true); setLeaderboardMessage("");
    try {
      const response = await fetch(`${LEADERBOARD_ORIGIN}/api/leaderboard`);
      if (!response.ok) throw new Error();
      const data = await response.json() as { entries: LeaderboardEntry[] };
      setLeaderboard(data.entries);
    } catch { setLeaderboardMessage("The global caravan ledger is temporarily unavailable."); }
  }
  async function submitLeaderboard() {
    if (!result || !leaderboardConsent) return;
    setLeaderboardBusy(true); setLeaderboardMessage("");
    try {
      const photo = await leaderboardPhoto();
      const form = new FormData();
      form.set("displayName", name || "Desert Traveler"); form.set("camelCount", String(result.camels)); form.set("consent", "true"); form.set("photo", photo, "leaderboard.jpg");
      const response = await fetch(`${LEADERBOARD_ORIGIN}/api/leaderboard`, { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Leaderboard submission failed.");
      setJoinOpen(false); setLeaderboardConsent(false); await openLeaderboard();
    } catch (e) { setLeaderboardMessage(e instanceof Error ? e.message : "Leaderboard submission failed."); }
    finally { setLeaderboardBusy(false); }
  }

  return <main>
    {analyticsConsent && <Analytics />}
    <div className="settings"><button className="leaderboard-link" onClick={openLeaderboard}>Leaderboard</button><select aria-label="Motion preference" value={motion} onChange={(e) => setMotion(e.target.value as Motion)}><option value="full">Full motion</option><option value="reduced">Reduced motion</option><option value="off">Motion off</option></select></div>
    {(stage === "landing" || stage === "consent") && <DesertScene />}
    {stage === "landing" && <section className="hero"><span className="eyebrow">THE INTERNET’S LEAST NECESSARY VISUAL ANALYSIS</span><h1>Camel<br /><em>Calculator</em></h1><p className="lead">Upload one to three appropriate photos. The caravan observes visible traits. Your private rubric counts the fictional camels.</p><button className="primary stampede" onClick={() => setStage("consent")}>Upload & Calculate <span>→</span></button><p className="micro">Adults only · no face recognition · photos saved only by leaderboard opt-in · zero science</p></section>}

    {stage === "consent" && <section className="panel compact consent-photo"><span className="eyebrow">PHOTO RIGHTS CHECKPOINT</span><h2>Adults. Permission. Appropriate photos.</h2><p>Only upload photos of adults who are in on the joke.</p>
      {[
        "Every person shown is at least 18 years old.",
        "I am the person shown or have that person’s permission.",
        "The image is not intimate, explicit, private, or deceptive.",
        "The result is fictional entertainment.",
        "I understand that a person’s real worth cannot be calculated.",
        "I agree to anonymous usage and result-band analytics. Page activity, photo count, broad score bands, and the fictional result tier may be recorded to improve Camel Calculator. Photos, filenames, nickname, and raw visual observations are never included.",
      ].map((copy, i) => <label className="check" key={copy}><input type="checkbox" checked={consents[i]} onChange={(e) => setConsents((c) => c.map((v, x) => x === i ? e.target.checked : v))} /><span><strong>{copy}</strong></span></label>)}
      <button className="primary" disabled={!consents.every(Boolean)} onClick={() => setStage("upload")}>Choose photographs →</button>
    </section>}

    {stage === "upload" && <section className="upload-page"><header><span className="eyebrow">VISUAL EVIDENCE · 1–3 PHOTOS</span><h1>Give the caravan<br /><em>a clear view.</em></h1><p>A face photo is best. A front or three-quarter full-body photo improves coverage. A third angle is optional—more photos never add points.</p></header>
      <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}>
        <Camel /><strong>{photos.length ? "Add another angle" : "Drop photographs into the desert"}</strong><span>or tap to choose from your device</span><small>JPEG, PNG, WebP · 8 MB each · up to 4096 px</small>
        <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <aside className="privacy-note"><strong>☾ Your photo is not permanently saved unless you choose to join the public leaderboard.</strong><p>Normal analysis stays on this device. If—and only if—you later opt into the leaderboard, one downsized processed photo is uploaded with your display name and camel count so the public entry can be shown. Share cards are generated locally and do not join the leaderboard.</p></aside>
      {photos.length > 0 && <div className="photo-grid">{photos.map((photo, i) => <article className="photo-card" key={photo.id}><div className="photo-frame"><img src={photo.url} alt={`Selected photograph ${i + 1}`} style={{ transform: `scale(${photo.zoom})` }} /></div><div><strong>VIEW {i + 1}</strong><button onClick={() => rotatePhoto(photo)}>↻ Rotate</button><label>Crop <input aria-label={`Crop photo ${i + 1}`} type="range" min="1" max="1.6" step=".1" value={photo.zoom} onChange={(e) => setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, zoom: Number(e.target.value) } : p))} /></label><button onClick={() => removePhoto(photo.id)}>Remove</button></div></article>)}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <label className="field nickname"><span>Nickname <em>optional</em></span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="The Oasis Enigma" /></label>
      <div className="model-facts"><span><strong>{LOCAL_MODEL.id.split("/")[1]}</strong> · q4 · {LOCAL_MODEL.license}</span><small>{modelCached ? "Observer cached for repeat visits." : `First-run download: approximately ${Math.round(LOCAL_MODEL.estimatedDownloadBytes / 1024 / 1024)} MB.`}</small>{modelCached && <button className="text-button danger" onClick={removeDownloadedModel}>Remove downloaded model</button>}</div>
      <div className="actions"><button className="text-button danger" disabled={!photos.length} onClick={deletePhotos}>Delete my photos</button><button className="primary" disabled={!photos.length} onClick={analyze}>Analyze {photos.length || ""} photo{photos.length === 1 ? "" : "s"} locally →</button></div>
    </section>}

    {stage === "analyzing" && <section className="analysis-stage"><div className="analysis-camels"><div className="inspector"><span className="spectacles">◉ ◉</span><Camel /><i>CLIPBOARD</i></div><div className="rope-camel"><Camel /><span>〰 〰</span></div></div><div className="floating-photos">{photos.map((p) => <img key={p.id} src={p.url} alt="" />)}</div><div className="road-sign">{observerPhase === "downloading" ? "Downloading observer" : observerPhase === "loading" ? "Loading observer" : `Analyzing photo ${status + 1} of ${photos.length}`}</div>{observerPhase === "downloading" && <><div className="analysis-progress" aria-label={`${Math.round(downloadedBytes / Math.max(downloadTotal, 1) * 100)}% downloaded`}><i style={{ width: `${Math.min(100, downloadedBytes / Math.max(downloadTotal, 1) * 100)}%` }} /></div><strong>{Math.round(downloadedBytes / 1024 / 1024)} / {Math.round(downloadTotal / 1024 / 1024)} MB</strong><small>Downloaded once and cached by your browser.</small></>}<p>Using {backend === "webgpu" ? "WebGPU acceleration" : "WebAssembly fallback"}. Observation and deterministic scoring remain separate.</p><button className="secondary" onClick={cancelAnalysis}>Cancel</button></section>}

    {stage === "reveal" && result && <section className="reveal"><div className="sandstorm" /><p>THE HERD HAS BEEN CALCULATED</p><div className="rolling-count">{result.camels}</div><Camel className="hero-camel" gold={result.camels >= 180} /><div className="reveal-herd">{Array.from({ length: Math.min(12, Math.ceil(result.camels / 15)) }).map((_, i) => <Camel key={i} gold={result.camels >= 180 && i === 5} />)}</div><button className="primary reveal-button" onClick={() => setStage("result")}>See the desert ledger →</button></section>}

    {stage === "result" && result && observation && economics && <section className="result"><div className="result-hero"><span className="eyebrow">VISIBLE-APPEARANCE ENTERTAINMENT RESULT</span><p>{name || "This mysterious traveler"} scored</p><div className="big-number">{result.camels}</div><h1>fictional working camels</h1><h2>{result.tier.title}</h2><p className="result-message">People are not property. This is a subjective visual joke, not a real valuation.</p><Camel className="result-camel" gold={result.camels >= 180} /></div>
      <div className="split-ledgers">
        <article><span className="card-label">FACE-ONLY LEDGER</span>{result.faceCamels == null ? <><strong className="unseen">Not visible</strong><p>No face penalty. The final herd was reweighted to the visible categories.</p></> : <><strong>{result.faceCamels}<small> camels</small></strong><p>A separate estimate from the visible face—not a share of the final herd.</p></>}{[
          ["Facial symmetry", observation.face.apparentSymmetry.value, VISUAL_RUBRIC.preferences.apparentSymmetry],
          ["Feature balance", observation.face.featureBalance.value, VISUAL_RUBRIC.preferences.featureBalance],
          ["Expression", observation.face.expression.value, VISUAL_RUBRIC.preferences.expression],
          ["Eye presentation", observation.face.eyeAppearance.value, VISUAL_RUBRIC.preferences.eyeAppearance],
          ["Hair presentation", observation.hair.presentation.value, "prominent"],
        ].map(([label, value, preferred]) => <div key={label}><span>{label}<small>{describeTrait(value)}</small></span><b>{describeMatch(value, preferred)}</b></div>)}</article>
        <article><span className="card-label">BODY-ONLY LEDGER</span>{result.bodyCamels == null ? <><strong className="unseen">Not visible</strong><p>No body penalty. The final herd was reweighted to the visible categories.</p></> : <><strong>{result.bodyCamels}<small> camels</small></strong><p>A separate estimate from visible proportions—not a share of the final herd.</p></>}{[
          ["Build", observation.physique.build.value, VISUAL_RUBRIC.preferences.build],
          ["Waist definition", observation.physique.waistDefinition.value, VISUAL_RUBRIC.preferences.waistDefinition],
          ["Chest prominence", observation.physique.chestProminence.value, VISUAL_RUBRIC.preferences.chestProminence],
          ["Hip prominence", observation.physique.hipProminence.value, VISUAL_RUBRIC.preferences.hipProminence],
          ["Glute prominence", observation.physique.gluteProminence.value, VISUAL_RUBRIC.preferences.gluteProminence],
          ["Proportional balance", observation.physique.proportionalBalance.value, VISUAL_RUBRIC.preferences.proportionalBalance],
          ["Posture", observation.physique.posture.value, VISUAL_RUBRIC.preferences.posture],
        ].map(([label, value, preferred]) => <div key={label}><span>{label}<small>{describeTrait(value)}</small></span><b>{describeMatch(value, preferred)}</b></div>)}</article>
      </div>
      <div className="result-grid"><article className="score-card"><span className="card-label">COMBINED VISIBLE TRAIT BREAKDOWN</span><h3>How the final herd was built</h3>{(Object.keys(labels) as VisualCategory[]).map((key) => <div className="bar" key={key}><div><span>{labels[key]}</span><strong>{result.categoryScores[key] == null ? "Not visible" : Math.round(result.categoryScores[key]!)}</strong></div><i><b style={{ width: `${result.categoryScores[key] ?? 0}%` }} /></i></div>)}<div className="confidence"><strong>Analysis confidence</strong><span>{Math.round(result.confidence * 100)}% · {result.confidence >= .8 ? "High" : "Moderate"}</span></div>{result.missingTraits.length > 0 && <p className="missing"><strong>Could not assess:</strong> {result.missingTraits.join(", ")}</p>}<details><summary>Why this result?</summary><p>The face-led rubric emphasizes visible facial harmony, feature balance, eye presentation, smile, hair presentation, grooming, and overall proportions. Hair color is descriptive only and never adds or removes points. Missing categories are removed and the remaining weights are redistributed. The final conversion uses a steep nonlinear curve: ordinary scores produce modest herds, while 100-plus camels are reserved for stronger profiles. Evidence confidence affects the score, while photo quality itself is never treated as attractiveness.</p></details></article>
      <article className="economics"><span className="card-label">IMAGINARY HERD ECONOMICS</span><h3>Ordinary working dromedaries</h3>{[["Low", economics.low, economics.lowSar],["Reference", economics.reference, economics.referenceSar],["High", economics.high, economics.highSar]].map(([l,u,s]) => <div className="money-row" key={String(l)}><span>{l} estimate</span><strong>{money(Number(u),"USD")}<small>{money(Number(s),"SAR")}</small></strong></div>)}<p className="market-note">{MARKET_CONFIG.market} · {MARKET_CONFIG.assumptionVersion}. Illustrative only. Racing, breeding, festival, and prize-winning camels may fall far outside this ordinary working-camel range.</p></article></div>
      {metrics && <p className="local-metrics">Local observer: {metrics.backend.toUpperCase()} · analysis {(metrics.analysisMs / 1000).toFixed(1)}s · images never left this device</p>}
      {shareCardUrl && <div className="share-card-preview"><img src={shareCardUrl} alt="Camel Calculator share card preview" /><div><button className="secondary" onClick={downloadShareCard}>Download Card</button><button className="secondary" onClick={nativeShareCard}>Share Card</button></div></div>}
      <div className="leaderboard-privacy">Your photo is not permanently saved unless you choose to join the public leaderboard. Creating or sharing a card never submits it.</div>
      <div className="result-actions"><button className="secondary" onClick={createShareableCard}>Create Shareable Card</button><button className="primary" onClick={() => { setLeaderboardConsent(false); setLeaderboardMessage(""); setJoinOpen(true); }}>Join Global Leaderboard</button><button className="text-button danger" onClick={deletePhotos}>Delete my photos</button><button className="text-button" onClick={restart}>Start over</button></div>
    </section>}
    {joinOpen && result && photos[0] && <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="join-title"><div className="leaderboard-modal"><button className="dialog-close" aria-label="Close" onClick={() => setJoinOpen(false)}>×</button><span className="card-label">PUBLIC CARAVAN REGISTRY</span><h2 id="join-title">Join the leaderboard?</h2><div className="entry-preview"><img src={photos[0].url} alt="Processed leaderboard photo preview" /><div><strong>{name || "Desert Traveler"}</strong><b>{result.camels} camels</b><span>Expected rank: {leaderboard.length ? `#${leaderboard.filter((entry) => entry.camelCount > result.camels).length + 1}` : "calculated after submission"}</span></div></div><p>Only this downsized processed photo, display name, camel count, consent time, and submission date will be saved and publicly displayed. The original full-resolution upload is never stored.</p><label className="check public-consent"><input type="checkbox" checked={leaderboardConsent} onChange={(event) => setLeaderboardConsent(event.target.checked)} /><span><strong>I agree to have my photo, camel count, and ranking saved and publicly displayed on the global leaderboard.</strong></span></label>{leaderboardMessage && <p className="error" role="alert">{leaderboardMessage}</p>}<div className="modal-actions"><button className="text-button" onClick={() => setJoinOpen(false)}>Cancel</button><button className="primary" disabled={!leaderboardConsent || leaderboardBusy} onClick={submitLeaderboard}>{leaderboardBusy ? "Submitting…" : "Submit to Leaderboard"}</button></div></div></div>}
    {leaderboardOpen && <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title"><div className="leaderboard-board"><button className="dialog-close" aria-label="Close" onClick={() => setLeaderboardOpen(false)}>×</button><span className="card-label">GLOBAL CARAVAN REGISTRY</span><h2 id="leaderboard-title">The Camel Leaderboard</h2><p>Highest fictional camel count first. Every person shown explicitly opted into this public display.</p>{leaderboardMessage && <p className="error" role="alert">{leaderboardMessage}</p>}<div className="leaderboard-list">{leaderboard.map((entry) => <article key={entry.id} className={entry.rank <= 3 ? `podium rank-${entry.rank}` : ""}><span className="rank">#{entry.rank}</span><img src={entry.photoUrl} alt={`${entry.displayName}'s leaderboard portrait`} /><div><strong>{entry.displayName}</strong><small>{entry.rank <= 3 ? ["Golden Caravan", "Silver Saddle", "Bronze Oasis"][entry.rank - 1] : "Global contender"}</small></div><b>{entry.camelCount}<small> camels</small></b></article>)}{!leaderboard.length && !leaderboardMessage && <p className="empty-ledger">No public entries yet. The first caravan awaits.</p>}</div></div></div>}
    <footer><strong>Camel Calculator</strong><p>Fictional entertainment for consenting adults. Analysis is local. Photos are stored only after explicit public-leaderboard opt-in; share cards stay local. No face recognition or health, fertility, personality, ethnicity, intelligence, maternal, or childbirth claims.</p></footer>
  </main>;
}

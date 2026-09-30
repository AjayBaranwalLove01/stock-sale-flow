import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDisplayContent,
  pairDisplay,
  displayHeartbeat,
  logDisplayPlay,
  type DisplayContent,
  type DisplayItem,
} from "@/lib/signage.functions";

export const Route = createFileRoute("/display")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Store Display — Digital Signage" },
      { name: "description", content: "Full-screen in-store advertisement display for a paired screen." },
      { property: "og:title", content: "Store Display — Digital Signage" },
      {
        property: "og:description",
        content: "Full-screen in-store advertisement display for a paired screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisplayPage,
});

const TOKEN_KEY = "signage.display.token";
const CACHE_KEY = "signage.display.cache";

function withinSchedule(it: DisplayItem, now: Date) {
  if (it.days_of_week?.length && !it.days_of_week.includes(now.getDay())) return false;
  const hhmm = now.toTimeString().slice(0, 8);
  if (it.start_time && hhmm < it.start_time) return false;
  if (it.end_time && hhmm > it.end_time) return false;
  return true;
}

function DisplayPage() {
  const [token, setToken] = useState<string | null>(null);
  const [content, setContent] = useState<DisplayContent | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);

  const fetchContent = useServerFn(getDisplayContent);
  const pair = useServerFn(pairDisplay);
  const beat = useServerFn(displayHeartbeat);
  const logPlay = useServerFn(logDisplayPlay);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    const stored = fromUrl || localStorage.getItem(TOKEN_KEY);
    if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
    if (stored) setToken(stored);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        setContent(JSON.parse(cached) as DisplayContent);
      } catch {
        /* ignore bad cache */
      }
    }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchContent({ data: { token } });
      setContent(data);
      setOffline(false);
      setError(null);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reach the server";
      if (/not registered|disabled/i.test(msg)) {
        setError(msg);
      } else {
        setOffline(true);
      }
    }
  }, [token, fetchContent]);

  useEffect(() => {
    if (!token) return;
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [token, load]);

  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => {
      void beat({ data: { token } }).catch(() => setOffline(true));
    }, 60_000);
    return () => clearInterval(t);
  }, [token, beat]);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setPairing(true);
    setError(null);
    try {
      const res = await pair({ data: { code } });
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  function unpair() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CACHE_KEY);
    setToken(null);
    setContent(null);
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <form
          onSubmit={handlePair}
          className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div>
            <h1 className="text-xl font-semibold">Pair this screen</h1>
            <p className="text-sm text-muted-foreground">
              Enter the display code from Digital Signage → Displays.
            </p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoFocus
            className="h-12 w-full rounded-md border bg-background text-center font-mono text-2xl tracking-widest uppercase"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={pairing}
            className="h-11 w-full rounded-md bg-primary font-medium text-primary-foreground disabled:opacity-60"
          >
            {pairing ? "Pairing…" : "Pair display"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <Player
      content={content}
      offline={offline}
      error={error}
      onPlay={(adId) => void logPlay({ data: { token, adId } }).catch(() => undefined)}
      onUnpair={unpair}
    />
  );
}

function Player({
  content,
  offline,
  error,
  onPlay,
  onUnpair,
}: {
  content: DisplayContent | null;
  offline: boolean;
  error: string | null;
  onPlay: (adId: string) => void;
  onUnpair: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [showControls, setShowControls] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const hide = setTimeout(() => setShowControls(false), 5000);
    const wake = () => {
      setShowControls(true);
      clearTimeout(hide);
      setTimeout(() => setShowControls(false), 5000);
    };
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(hide);
      window.removeEventListener("mousemove", wake);
    };
  }, []);

  const items = useMemo(
    () => (content?.items ?? []).filter((i) => withinSchedule(i, now)),
    [content, now],
  );
  const settings = content?.settings;
  const current = items.length ? items[index % items.length] : null;

  const next = useCallback(() => setIndex((i) => i + 1), []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!current) return;
    onPlay(current.id);
    if (current.type === "video" && current.use_full_video) return; // advanced by onEnded
    const secs = current.duration || settings?.default_duration || 10;
    timer.current = setTimeout(next, secs * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, index, items.length]);

  const portrait = settings?.orientation === "portrait";

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-lg">{error}</p>
        <button onClick={onUnpair} className="rounded border border-white/40 px-4 py-2 text-sm">
          Pair a different display
        </button>
      </main>
    );
  }

  return (
    <main
      className={`relative h-screen w-screen overflow-hidden bg-black text-white ${
        portrait ? "portrait-display" : ""
      }`}
    >
      {current ? (
        <Slide item={current} transition={settings?.transition ?? "fade"} muted={settings?.video_muted ?? true} onEnded={next} />
      ) : (
        <div className="flex h-full items-center justify-center text-center text-white/70">
          <div>
            <p className="text-2xl font-medium">{content?.business.name ?? "Store display"}</p>
            <p className="mt-2 text-sm">No advertisements are scheduled right now.</p>
          </div>
        </div>
      )}

      {(settings?.show_clock || settings?.show_business_name) && (
        <div className="pointer-events-none absolute top-4 left-6 flex items-center gap-3 rounded-full bg-black/45 px-4 py-1.5 text-sm backdrop-blur">
          {settings?.show_clock && (
            <span className="font-medium">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {settings?.show_business_name && <span className="opacity-80">{content?.business.name}</span>}
        </div>
      )}

      {offline && (
        <div className="absolute top-4 right-6 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-black">
          Offline — showing cached playlist
        </div>
      )}

      {showControls && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2 text-xs">
          <button
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-full bg-white/15 px-4 py-2 backdrop-blur hover:bg-white/25"
          >
            Enter full screen
          </button>
          <button onClick={next} className="rounded-full bg-white/15 px-4 py-2 backdrop-blur hover:bg-white/25">
            Skip
          </button>
          <button onClick={onUnpair} className="rounded-full bg-white/15 px-4 py-2 backdrop-blur hover:bg-white/25">
            Unpair
          </button>
        </div>
      )}
    </main>
  );
}

export function Slide({
  item,
  transition,
  muted,
  onEnded,
}: {
  item: DisplayItem;
  transition: "fade" | "slide" | "none";
  muted: boolean;
  onEnded: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (item.show_qr && item.qr_url) {
      void import("qrcode")
        .then(({ default: QRCode }) => QRCode.toDataURL(item.qr_url ?? "", { margin: 1, width: 320 }))
        .then(setQr)
        .catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [item.show_qr, item.qr_url]);

  const anim =
    transition === "slide"
      ? "animate-in slide-in-from-right duration-500"
      : transition === "fade"
        ? "animate-in fade-in duration-500"
        : "";

  const price = item.product;
  const promo = item.promotion;

  return (
    <div key={item.id} className={`h-full w-full ${anim}`}>
      {item.type === "video" && item.media_url ? (
        <video
          src={item.media_url}
          className="h-full w-full object-contain"
          autoPlay
          muted={muted}
          playsInline
          onEnded={onEnded}
          onError={onEnded}
        />
      ) : item.type === "image" && item.media_url ? (
        <img src={item.media_url} alt={item.title ?? item.name} className="h-full w-full object-contain" />
      ) : item.type === "product" && price ? (
        <div className="flex h-full w-full items-center justify-center gap-12 p-[6vh]">
          {price.image && (
            <img src={price.image} alt={price.name} className="max-h-[70vh] max-w-[45%] object-contain" />
          )}
          <div className="max-w-[45%]">
            <h2 className="text-[6vh] leading-tight font-bold">{price.name}</h2>
            {price.description && <p className="mt-3 text-[2.4vh] opacity-70">{price.description}</p>}
            <div className="mt-8 flex items-end gap-6">
              {price.mrp > price.price && (
                <span className="text-[4vh] line-through opacity-50">₹{price.mrp}</span>
              )}
              <span className="text-[9vh] leading-none font-extrabold text-amber-400">₹{price.price}</span>
            </div>
            {item.offer_text && (
              <p className="mt-6 inline-block rounded-full bg-amber-400 px-6 py-2 text-[3vh] font-bold text-black">
                {item.offer_text}
              </p>
            )}
          </div>
          {qr && <img src={qr} alt="Scan to shop" className="absolute right-10 bottom-10 w-[16vh] rounded bg-white p-2" />}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center p-[8vh] text-center">
          <h2 className="text-[9vh] leading-tight font-extrabold">
            {promo?.title ?? item.title ?? item.name}
          </h2>
          {(promo?.description ?? item.description) && (
            <p className="mt-6 text-[3.5vh] opacity-80">{promo?.description ?? item.description}</p>
          )}
          {promo && promo.discount_type !== "none" && (
            <p className="mt-10 rounded-full bg-amber-400 px-10 py-4 text-[5vh] font-bold text-black">
              {promo.discount_type === "percent"
                ? `${promo.discount_value}% OFF`
                : `₹${promo.discount_value} OFF`}
            </p>
          )}
          {item.offer_text && !promo && (
            <p className="mt-10 rounded-full bg-amber-400 px-10 py-4 text-[5vh] font-bold text-black">
              {item.offer_text}
            </p>
          )}
          {qr && <img src={qr} alt="Scan to shop" className="mt-10 w-[18vh] rounded bg-white p-3" />}
        </div>
      )}
    </div>
  );
}

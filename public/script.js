(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Nav background on scroll */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 20);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Reveal on scroll (staggered per section) */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    const groups = new Map();
    reveals.forEach((el) => {
      const parent = el.closest("section") || document.body;
      const i = groups.get(parent) || 0;
      el.style.setProperty("--d", `${Math.min(i * 0.08, 0.5)}s`);
      groups.set(parent, i + 1);
    });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* Typewriter rotator */
  const rotator = document.getElementById("rotator");
  const roles = [
    "dispositivos embarcados & IoT",
    "sistemas, integrações & interfaces",
    "inteligência artificial",
    "cyber security",
  ];
  if (rotator && !reduced) {
    let r = 0, c = roles[0].length, deleting = false;
    const tick = () => {
      const word = roles[r];
      if (!deleting) {
        c++;
        if (c > word.length) { deleting = true; return setTimeout(tick, 2200); }
      } else {
        c--;
        if (c === 0) { deleting = false; r = (r + 1) % roles.length; }
      }
      rotator.textContent = roles[r].slice(0, c);
      setTimeout(tick, deleting ? 28 : 55);
    };
    setTimeout(() => { deleting = true; tick(); }, 2600);
  }

  /* Live clock (Brasília) */
  const clock = document.getElementById("clock");
  if (clock) {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Sao_Paulo",
    });
    const upd = () => { clock.textContent = `${fmt.format(new Date())} BRT`; };
    upd();
    setInterval(upd, 1000);
  }

  /* Year */
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* Card spotlight */
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const b = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - b.left}px`);
      card.style.setProperty("--my", `${e.clientY - b.top}px`);
    });
  });

  /* Malha fechada: sem animação para quem prefere movimento reduzido */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".loop__svg").forEach((svg) => { try { svg.setCurrentTime(4); svg.pauseAnimations(); } catch (_) {} });
  }

  /* Contact form */
  const form = document.getElementById("contact-form");
  if (form) {
    const status = document.getElementById("form-status");
    const btn = form.querySelector(".form__submit");
    const label = form.querySelector(".form__label");
    const setStatus = (msg, kind) => {
      status.textContent = msg;
      status.className = `form__status${kind ? ` is-${kind}` : ""}`;
    };
    const resetTurnstile = () => { try { window.turnstile && window.turnstile.reset(); } catch (_) {} };

    form.addEventListener("input", (e) => e.target.closest(".field")?.classList.remove("is-invalid"));

    // Máscara de telefone BR: (DD) 9XXXX-XXXX. Números com "+" ficam livres (internacional).
    const phone = form.querySelector("#f-phone");
    phone?.addEventListener("input", () => {
      if (phone.value.trim().startsWith("+")) return;
      const d = phone.value.replace(/\D/g, "").slice(0, 11);
      let out = d;
      if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length > 6) out = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
      phone.value = out;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("");

      let firstInvalid = null;
      form.querySelectorAll(".field:not(.field--hp) input, .field textarea").forEach((el) => {
        const bad = !el.checkValidity();
        el.closest(".field").classList.toggle("is-invalid", bad);
        if (bad && !firstInvalid) firstInvalid = el;
      });
      if (firstInvalid) {
        setStatus("Confira os campos destacados.", "err");
        firstInvalid.focus();
        return;
      }

      const data = new FormData(form);
      const token = data.get("cf-turnstile-response");
      if (!token) { setStatus("Aguarde a verificação anti-robô concluir.", "err"); return; }

      btn.disabled = true;
      label.textContent = "Enviando…";
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            phone: data.get("phone"),
            message: data.get("message"),
            website: data.get("website"),
            token,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          form.reset();
          setStatus("Mensagem enviada! Respondo em breve.", "ok");
        } else {
          setStatus(json.error || "Não foi possível enviar. Tente novamente.", "err");
        }
      } catch (_) {
        setStatus("Sem conexão com o servidor. Tente novamente.", "err");
      } finally {
        resetTurnstile();
        btn.disabled = false;
        label.textContent = "Enviar mensagem";
      }
    });
  }

  /* Photo tilt */
  const frame = document.querySelector(".frame");
  if (frame && !reduced && window.matchMedia("(pointer: fine)").matches) {
    frame.addEventListener("pointermove", (e) => {
      const b = frame.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width - 0.5;
      const y = (e.clientY - b.top) / b.height - 0.5;
      frame.style.setProperty("--ry", `${x * 8}deg`);
      frame.style.setProperty("--rx", `${-y * 8}deg`);
    });
    frame.addEventListener("pointerleave", () => {
      frame.style.setProperty("--ry", "0deg");
      frame.style.setProperty("--rx", "0deg");
    });
  }

  /* Hero PCB traces with travelling signal pulses */
  const canvas = document.getElementById("traces");
  if (!canvas || reduced) return;
  const ctx = canvas.getContext("2d");
  const STEP = 48;
  let W, H, dpr, traces = [], pulses = [], raf, running = true;

  const build = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    traces = [];
    const cols = Math.ceil(W / STEP), rows = Math.ceil(H / STEP);
    const count = Math.round((cols * rows) / 18);
    for (let n = 0; n < count; n++) {
      let x = Math.floor(Math.random() * cols) * STEP;
      let y = Math.floor(Math.random() * rows) * STEP;
      const pts = [[x, y]];
      let dir = Math.floor(Math.random() * 4);
      const segs = 2 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segs; s++) {
        const len = (1 + Math.floor(Math.random() * 4)) * STEP;
        if (dir === 0) x += len; else if (dir === 1) y += len; else if (dir === 2) x -= len; else y -= len;
        pts.push([x, y]);
        dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      }
      let total = 0;
      const lens = [];
      for (let i = 1; i < pts.length; i++) {
        const l = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
        lens.push(l); total += l;
      }
      traces.push({ pts, lens, total });
    }
    pulses = traces.filter(() => Math.random() < 0.45).map((t) => ({
      t, d: Math.random() * t.total, v: 0.6 + Math.random() * 1.4,
    }));
  };

  const pointAt = (tr, d) => {
    for (let i = 0; i < tr.lens.length; i++) {
      if (d <= tr.lens[i]) {
        const [x0, y0] = tr.pts[i], [x1, y1] = tr.pts[i + 1];
        const k = d / tr.lens[i];
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
      }
      d -= tr.lens[i];
    }
    return tr.pts[tr.pts.length - 1];
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(122,165,255,0.09)";
    traces.forEach((tr) => {
      ctx.beginPath();
      tr.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      const [ex, ey] = tr.pts[tr.pts.length - 1];
      ctx.fillStyle = "rgba(122,165,255,0.18)";
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    });
    pulses.forEach((p) => {
      p.d += p.v;
      if (p.d > p.t.total) p.d = 0;
      const [x, y] = pointAt(p.t, p.d);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, "rgba(140,180,255,0.9)");
      g.addColorStop(1, "rgba(61,123,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    });
    if (running) raf = requestAnimationFrame(draw);
  };

  build(); draw();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 150); });
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { cancelAnimationFrame(raf); draw(); }
  }).observe(canvas);
})();

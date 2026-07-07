(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-particles';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '0', pointerEvents: 'none' });
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let w, h, particles;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeParticles() {
    const count = Math.min(70, Math.floor((w * h) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 + 0.4,
      vy: Math.random() * 0.25 + 0.05,
      vx: (Math.random() - 0.5) * 0.15,
      a: Math.random() * 0.5 + 0.2
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.y -= p.vy; p.x += p.vx;
      if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
      if (p.x < -5) p.x = w + 5;
      if (p.x > w + 5) p.x = -5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140,180,255,${p.a})`;
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => { resize(); makeParticles(); });
  resize(); makeParticles(); tick();
})();

/**
 * layout-particles.js
 *
 * Canvas particle background for ARCHITECTURE.html
 * Specification: NUTRIENTS.md §7 PARTICLE_SPEC
 *
 * - Particle count: ~100 (scales with viewport)
 * - Particle size: 1-3px
 * - Color: var(--text-muted) at 30% opacity
 * - Movement: Slow drift (0.2-0.5px/frame)
 * - Connection lines: Between particles within 100px, opacity based on distance
 * - Frame rate: requestAnimationFrame, throttle to 30fps on low-power devices
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // Configuration — matches §7 PARTICLE_SPEC
  // ═══════════════════════════════════════════════════════════════
  const CONFIG = {
    // Particle count scales with viewport (~100 on desktop)
    baseParticleCount: 100,
    minParticleCount: 40,
    maxParticleCount: 150,

    // Particle size range (px)
    minSize: 1,
    maxSize: 3,

    // Movement speed range (px/frame)
    minSpeed: 0.2,
    maxSpeed: 0.5,

    // Connection distance threshold (px)
    connectionDistance: 100,

    // Colors — matches var(--text-muted) from NUTRIENTS.md §2
    particleColor: '96, 96, 112', // RGB for #606070
    particleOpacity: 0.3,
    connectionOpacity: 0.15,

    // Frame rate throttling
    targetFPS: 30,
    lowPowerThreshold: 20, // If FPS drops below this, reduce particles
  };

  // ═══════════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════════
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animationId = null;
  let lastFrameTime = 0;
  let frameInterval = 1000 / CONFIG.targetFPS;
  let isLowPowerMode = false;
  let frameCount = 0;
  let fpsCheckInterval = null;

  // ═══════════════════════════════════════════════════════════════
  // Particle Class
  // ═══════════════════════════════════════════════════════════════
  class Particle {
    constructor(canvasWidth, canvasHeight) {
      this.reset(canvasWidth, canvasHeight);
    }

    reset(canvasWidth, canvasHeight) {
      this.x = Math.random() * canvasWidth;
      this.y = Math.random() * canvasHeight;
      this.size = CONFIG.minSize + Math.random() * (CONFIG.maxSize - CONFIG.minSize);

      // Random velocity within speed range
      const speed = CONFIG.minSpeed + Math.random() * (CONFIG.maxSpeed - CONFIG.minSpeed);
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;

      // Slight opacity variation
      this.opacity = CONFIG.particleOpacity * (0.7 + Math.random() * 0.3);
    }

    update(canvasWidth, canvasHeight) {
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around edges with padding
      const padding = CONFIG.connectionDistance;
      if (this.x < -padding) this.x = canvasWidth + padding;
      if (this.x > canvasWidth + padding) this.x = -padding;
      if (this.y < -padding) this.y = canvasHeight + padding;
      if (this.y > canvasHeight + padding) this.y = -padding;
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${CONFIG.particleColor}, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════
  function init() {
    canvas = document.getElementById('particle-canvas');
    if (!canvas) {
      console.warn('[layout-particles] Canvas element not found');
      return;
    }

    ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[layout-particles] Could not get 2D context');
      return;
    }

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Draw static particles once, no animation
      resizeCanvas();
      createParticles();
      drawStaticFrame();
      return;
    }

    // Set up resize handler
    window.addEventListener('resize', handleResize);
    resizeCanvas();
    createParticles();

    // Start FPS monitoring for low-power mode detection
    startFPSMonitor();

    // Start animation loop
    lastFrameTime = performance.now();
    animate();
  }

  // ═══════════════════════════════════════════════════════════════
  // Canvas Resize
  // ═══════════════════════════════════════════════════════════════
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
  }

  function handleResize() {
    resizeCanvas();

    // Recreate particles with new count based on viewport
    createParticles();
  }

  // ═══════════════════════════════════════════════════════════════
  // Particle Management
  // ═══════════════════════════════════════════════════════════════
  function getParticleCount() {
    const viewportArea = window.innerWidth * window.innerHeight;
    const referenceArea = 1920 * 1080; // Reference: 1080p desktop

    let count = Math.round(CONFIG.baseParticleCount * (viewportArea / referenceArea));
    count = Math.max(CONFIG.minParticleCount, Math.min(CONFIG.maxParticleCount, count));

    // Reduce particles in low-power mode
    if (isLowPowerMode) {
      count = Math.round(count * 0.5);
    }

    return count;
  }

  function createParticles() {
    const count = getParticleCount();
    const width = window.innerWidth;
    const height = window.innerHeight;

    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(width, height));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Drawing
  // ═══════════════════════════════════════════════════════════════
  function drawConnections() {
    const maxDist = CONFIG.connectionDistance;
    const maxDistSq = maxDist * maxDist;

    ctx.strokeStyle = `rgba(${CONFIG.particleColor}, ${CONFIG.connectionOpacity})`;
    ctx.lineWidth = 0.5;

    // Optimization: only check each pair once
    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxDistSq) {
          const dist = Math.sqrt(distSq);
          const opacity = CONFIG.connectionOpacity * (1 - dist / maxDist);

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${CONFIG.particleColor}, ${opacity})`;
          ctx.stroke();
        }
      }
    }
  }

  function drawStaticFrame() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    // Draw connections first (behind particles)
    drawConnections();

    // Draw particles
    for (const particle of particles) {
      particle.draw(ctx);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Animation Loop
  // ═══════════════════════════════════════════════════════════════
  function animate(currentTime) {
    animationId = requestAnimationFrame(animate);

    // Throttle to target FPS
    const elapsed = currentTime - lastFrameTime;
    if (elapsed < frameInterval) return;

    lastFrameTime = currentTime - (elapsed % frameInterval);
    frameCount++;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update particles
    for (const particle of particles) {
      particle.update(width, height);
    }

    // Draw connections (behind particles)
    if (!isLowPowerMode) {
      drawConnections();
    }

    // Draw particles
    for (const particle of particles) {
      particle.draw(ctx);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FPS Monitoring for Low-Power Mode
  // ═══════════════════════════════════════════════════════════════
  function startFPSMonitor() {
    let lastCheckTime = performance.now();
    let lastFrameCount = 0;

    fpsCheckInterval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastCheckTime;
      const frames = frameCount - lastFrameCount;
      const fps = (frames / elapsed) * 1000;

      lastCheckTime = now;
      lastFrameCount = frameCount;

      // Switch to low-power mode if FPS is consistently low
      if (fps < CONFIG.lowPowerThreshold && !isLowPowerMode) {
        isLowPowerMode = true;
        createParticles(); // Reduce particle count
      }
    }, 5000); // Check every 5 seconds
  }

  // ═══════════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════════
  function destroy() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (fpsCheckInterval) {
      clearInterval(fpsCheckInterval);
      fpsCheckInterval = null;
    }

    window.removeEventListener('resize', handleResize);
    particles = [];
  }

  // ═══════════════════════════════════════════════════════════════
  // Expose API for debugging/testing
  // ═══════════════════════════════════════════════════════════════
  window.LayoutParticles = {
    init,
    destroy,
    getParticleCount: () => particles.length,
    isLowPowerMode: () => isLowPowerMode,
  };

  // ═══════════════════════════════════════════════════════════════
  // Initialize on DOM ready
  // ═══════════════════════════════════════════════════════════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

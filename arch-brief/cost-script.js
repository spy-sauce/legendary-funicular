/**
 * cost-script.js — Cost Visualization Animation Logic
 * Agent: cost-agent
 * Contract: NUTRIENTS.md §8 (COST_MODEL)
 *
 * Handles:
 * - Initial animation on page load
 * - Replay animation on hover
 * - Number counter animations (optional enhancement)
 */

(function() {
  'use strict';

  // ============================================
  // Cost Model Data (from NUTRIENTS.md §8)
  // ============================================
  const COST_DATA = {
    model: 'claude-sonnet-4-6',
    inputRate: 3.00,   // per 1M tokens
    outputRate: 15.00, // per 1M tokens

    sequential: {
      agents: 5,
      avgInputTokens: 50000,
      avgOutputTokens: 10000,
      timeUnits: 5,
    },

    parallel: {
      agents: 5,
      avgInputTokens: 50000,
      avgOutputTokens: 10000,
      timeUnits: 1,
      overhead: 1.1,
    }
  };

  // ============================================
  // Calculate costs
  // ============================================
  function calculateAgentCost(inputTokens, outputTokens, inputRate, outputRate) {
    const inputCost = (inputTokens / 1000000) * inputRate;
    const outputCost = (outputTokens / 1000000) * outputRate;
    return inputCost + outputCost;
  }

  function calculateSequentialCost() {
    const perAgentCost = calculateAgentCost(
      COST_DATA.sequential.avgInputTokens,
      COST_DATA.sequential.avgOutputTokens,
      COST_DATA.inputRate,
      COST_DATA.outputRate
    );
    return perAgentCost * COST_DATA.sequential.agents;
  }

  function calculateParallelCost() {
    const perAgentCost = calculateAgentCost(
      COST_DATA.parallel.avgInputTokens,
      COST_DATA.parallel.avgOutputTokens,
      COST_DATA.inputRate,
      COST_DATA.outputRate
    );
    // Parallel cost is same tokens, but we show max_leaf_cost * overhead
    return perAgentCost * COST_DATA.parallel.overhead;
  }

  // ============================================
  // Animation Controller
  // ============================================
  class CostAnimator {
    constructor(section) {
      this.section = section;
      this.hasAnimated = false;
      this.init();
    }

    init() {
      // Set up intersection observer for initial animation
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && !this.hasAnimated) {
              this.triggerAnimation();
              this.hasAnimated = true;
            }
          });
        },
        { threshold: 0.3 }
      );

      this.observer.observe(this.section);

      // Set up hover replay
      this.section.addEventListener('mouseenter', () => {
        if (this.hasAnimated) {
          this.replayAnimation();
        }
      });

      // Log calculated values (for debugging/verification)
      this.logCalculations();
    }

    triggerAnimation() {
      this.section.classList.add('animate');
      this.animateSpeedupBadge();
    }

    replayAnimation() {
      // Remove and re-add class to restart animations
      this.section.classList.remove('animate', 'replay');

      // Force reflow
      void this.section.offsetWidth;

      this.section.classList.add('replay');
      this.animateSpeedupBadge();
    }

    animateSpeedupBadge() {
      const badge = this.section.querySelector('.speedup-badge');
      if (!badge) return;

      badge.style.transform = 'scale(0.8)';
      badge.style.opacity = '0';

      setTimeout(() => {
        badge.style.transition = 'transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 300ms ease';
        badge.style.transform = 'scale(1)';
        badge.style.opacity = '1';
      }, 600);
    }

    logCalculations() {
      const seqCost = calculateSequentialCost();
      const parCost = calculateParallelCost();

      console.log('[cost-agent] Cost Calculations:');
      console.log(`  Sequential: $${seqCost.toFixed(2)} over ${COST_DATA.sequential.timeUnits}T`);
      console.log(`  Parallel:   $${parCost.toFixed(2)} over ${COST_DATA.parallel.timeUnits}T`);
      console.log(`  Speedup:    ${COST_DATA.sequential.timeUnits}x faster`);
    }
  }

  // ============================================
  // Number Counter Animation (optional)
  // ============================================
  function animateCounter(element, target, duration = 1000) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;

      element.textContent = '$' + current.toFixed(2);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ============================================
  // Initialize on DOM ready
  // ============================================
  function init() {
    const costSection = document.getElementById('cost-section');
    if (costSection) {
      new CostAnimator(costSection);
    }
  }

  // Support both direct script loading and module usage
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for potential module usage
  if (typeof window !== 'undefined') {
    window.CostVisualization = {
      COST_DATA,
      calculateSequentialCost,
      calculateParallelCost,
      CostAnimator,
      animateCounter
    };
  }
})();

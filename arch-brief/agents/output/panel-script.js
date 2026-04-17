/**
 * panel-script.js — Slide-in detail panel logic for ARCHITECTURE.html
 * Contract: NUTRIENTS.md §6 PANEL_SPEC + §1 DATA_CONTRACTS (ComponentEntry)
 * Agent: panel-agent | Branch: feat/panel-agent
 *
 * Exports:
 *   - openPanel(component: ComponentEntry): Promise<void>
 *   - closePanel(): void
 *   - highlightSyntax(code: string): string
 */

(function (global) {
  'use strict';

  // ============================================
  // DOM REFERENCES
  // ============================================
  const backdrop = document.getElementById('panel-backdrop');
  const panel = document.getElementById('detail-panel');
  const closeBtn = document.getElementById('panel-close');
  const titleEl = document.getElementById('panel-title');
  const descEl = document.getElementById('panel-desc');
  const filepathEl = document.getElementById('panel-filepath');
  const copyBtn = document.getElementById('filepath-copy');
  const codeContainer = document.getElementById('panel-code-container');
  const codeEl = document.getElementById('panel-code');
  const exportsSection = document.getElementById('panel-exports-section');
  const exportsList = document.getElementById('panel-exports');

  // ============================================
  // STATE
  // ============================================
  let currentComponent = null;
  let isOpen = false;

  // ============================================
  // SYNTAX HIGHLIGHTING
  // TypeScript keywords, strings, comments (inline, no external lib)
  // ============================================
  const KEYWORDS = [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
    'false', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import',
    'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'private',
    'protected', 'public', 'readonly', 'return', 'static', 'super', 'switch',
    'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var',
    'void', 'while', 'with', 'yield', 'as', 'namespace', 'module', 'declare',
    'abstract', 'is', 'keyof', 'never', 'unknown', 'any', 'asserts', 'infer',
    'satisfies', 'override'
  ];

  const TYPES = [
    'string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'Array',
    'Promise', 'Map', 'Set', 'Record', 'Partial', 'Required', 'Pick', 'Omit',
    'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'Parameters', 'Awaited',
    'void', 'null', 'undefined'
  ];

  /**
   * Escape HTML entities
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Apply syntax highlighting to TypeScript/JavaScript code
   * Returns HTML string with <span class="sh-*"> wrappers
   */
  function highlightSyntax(code) {
    if (!code || typeof code !== 'string') return '';

    // We'll process line by line to handle comments correctly
    const lines = code.split('\n');
    let inBlockComment = false;
    const result = [];

    for (const line of lines) {
      let highlighted = '';
      let i = 0;
      const len = line.length;

      while (i < len) {
        // Inside block comment
        if (inBlockComment) {
          const endIdx = line.indexOf('*/', i);
          if (endIdx !== -1) {
            highlighted += '<span class="sh-comment">' + escapeHtml(line.slice(i, endIdx + 2)) + '</span>';
            i = endIdx + 2;
            inBlockComment = false;
          } else {
            highlighted += '<span class="sh-comment">' + escapeHtml(line.slice(i)) + '</span>';
            i = len;
          }
          continue;
        }

        // Block comment start
        if (line.slice(i, i + 2) === '/*') {
          const endIdx = line.indexOf('*/', i + 2);
          if (endIdx !== -1) {
            highlighted += '<span class="sh-comment">' + escapeHtml(line.slice(i, endIdx + 2)) + '</span>';
            i = endIdx + 2;
          } else {
            highlighted += '<span class="sh-comment">' + escapeHtml(line.slice(i)) + '</span>';
            inBlockComment = true;
            i = len;
          }
          continue;
        }

        // Line comment
        if (line.slice(i, i + 2) === '//') {
          highlighted += '<span class="sh-comment">' + escapeHtml(line.slice(i)) + '</span>';
          i = len;
          continue;
        }

        // Decorator
        if (line[i] === '@') {
          const match = line.slice(i).match(/^@[\w]+/);
          if (match) {
            highlighted += '<span class="sh-decorator">' + escapeHtml(match[0]) + '</span>';
            i += match[0].length;
            continue;
          }
        }

        // Strings (double quotes)
        if (line[i] === '"') {
          let j = i + 1;
          while (j < len && line[j] !== '"') {
            if (line[j] === '\\') j++; // skip escaped char
            j++;
          }
          highlighted += '<span class="sh-string">' + escapeHtml(line.slice(i, j + 1)) + '</span>';
          i = j + 1;
          continue;
        }

        // Strings (single quotes)
        if (line[i] === "'") {
          let j = i + 1;
          while (j < len && line[j] !== "'") {
            if (line[j] === '\\') j++;
            j++;
          }
          highlighted += '<span class="sh-string">' + escapeHtml(line.slice(i, j + 1)) + '</span>';
          i = j + 1;
          continue;
        }

        // Template literals
        if (line[i] === '`') {
          let j = i + 1;
          while (j < len && line[j] !== '`') {
            if (line[j] === '\\') j++;
            j++;
          }
          highlighted += '<span class="sh-string">' + escapeHtml(line.slice(i, j + 1)) + '</span>';
          i = j + 1;
          continue;
        }

        // Numbers
        if (/[0-9]/.test(line[i])) {
          const match = line.slice(i).match(/^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/);
          if (match) {
            highlighted += '<span class="sh-number">' + escapeHtml(match[0]) + '</span>';
            i += match[0].length;
            continue;
          }
        }

        // Words (keywords, types, functions)
        if (/[a-zA-Z_$]/.test(line[i])) {
          const match = line.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
          if (match) {
            const word = match[0];
            // Check if followed by ( => function
            const nextChar = line[i + word.length];
            if (KEYWORDS.includes(word)) {
              highlighted += '<span class="sh-keyword">' + escapeHtml(word) + '</span>';
            } else if (TYPES.includes(word)) {
              highlighted += '<span class="sh-type">' + escapeHtml(word) + '</span>';
            } else if (nextChar === '(') {
              highlighted += '<span class="sh-function">' + escapeHtml(word) + '</span>';
            } else {
              highlighted += escapeHtml(word);
            }
            i += word.length;
            continue;
          }
        }

        // Operators and punctuation
        if (/[=+\-*/%<>!&|^~?:;,.]/.test(line[i])) {
          highlighted += '<span class="sh-operator">' + escapeHtml(line[i]) + '</span>';
          i++;
          continue;
        }

        // Default: escape and output
        highlighted += escapeHtml(line[i]);
        i++;
      }

      result.push(highlighted);
    }

    return result.join('\n');
  }

  // ============================================
  // PANEL OPERATIONS
  // ============================================

  /**
   * Open panel with component data
   * @param {ComponentEntry} component - Component to display
   */
  async function openPanel(component) {
    if (!component) return;

    currentComponent = component;

    // Set header info
    titleEl.textContent = component.title || component.id || 'Unknown';
    descEl.textContent = component.desc || '';

    // Set file path
    filepathEl.textContent = component.file || '';

    // Reset copy button
    copyBtn.classList.remove('copied');

    // Show loading state
    codeContainer.classList.add('loading');
    codeEl.innerHTML = '';

    // Render exports
    renderExports(component.exports || []);

    // Open panel
    backdrop.classList.add('open');
    panel.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    isOpen = true;

    // Focus close button for accessibility
    closeBtn.focus();

    // Fetch and display source code
    try {
      const source = await fetchSource(component);
      codeEl.innerHTML = highlightSyntax(source);
    } catch (err) {
      codeEl.innerHTML = '<span class="panel-error">Error loading source: ' + escapeHtml(err.message) + '</span>';
    } finally {
      codeContainer.classList.remove('loading');
    }
  }

  /**
   * Fetch source code for component
   * @param {ComponentEntry} component
   * @returns {Promise<string>}
   */
  async function fetchSource(component) {
    // If source is inlined in component data
    if (component.source) {
      return component.source;
    }

    // If source is in global ARCH_DATA
    if (typeof ARCH_DATA !== 'undefined' && ARCH_DATA.sources && ARCH_DATA.sources[component.file]) {
      return ARCH_DATA.sources[component.file];
    }

    // Fetch from relative path
    if (component.file) {
      const resp = await fetch(component.file);
      if (!resp.ok) {
        throw new Error('Failed to fetch: ' + resp.status + ' ' + resp.statusText);
      }
      return await resp.text();
    }

    return '// No source available';
  }

  /**
   * Render exports list
   * @param {string[]} exports
   */
  function renderExports(exports) {
    if (!exports || exports.length === 0) {
      exportsSection.classList.add('hidden');
      exportsList.innerHTML = '';
      return;
    }

    exportsSection.classList.remove('hidden');
    exportsList.innerHTML = exports.map(exp => '<li>' + escapeHtml(exp) + '</li>').join('');
  }

  /**
   * Close the panel
   */
  function closePanel() {
    backdrop.classList.remove('open');
    panel.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    isOpen = false;
    currentComponent = null;
  }

  /**
   * Copy file path to clipboard
   */
  async function copyFilePath() {
    if (!currentComponent || !currentComponent.file) return;

    try {
      await navigator.clipboard.writeText(currentComponent.file);
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = currentComponent.file;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
      document.body.removeChild(textarea);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Backdrop click
  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) {
        closePanel();
      }
    });
  }

  // Copy button click
  if (copyBtn) {
    copyBtn.addEventListener('click', copyFilePath);
  }

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      closePanel();
    }
  });

  // ============================================
  // PUBLIC API
  // ============================================
  global.ArchPanel = {
    open: openPanel,
    close: closePanel,
    highlightSyntax: highlightSyntax,
    isOpen: function () { return isOpen; },
    getCurrentComponent: function () { return currentComponent; }
  };

})(typeof window !== 'undefined' ? window : this);

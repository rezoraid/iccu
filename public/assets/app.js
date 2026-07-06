(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const rowTemplate = el('routeRowTemplate');
  const logEl = el('log');
  const bootLoader = el('bootLoader');
  const filterInput = el('filterInput');
  const copyBaseBtn = el('copyBaseBtn');

  let manifest = null;
  let routes = [];

  function groupLabel(key) {
    return manifest.groups[key]?.label || key;
  }

  function groupOrder(key) {
    return manifest.groups[key]?.order ?? 99;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      const original = btn.innerHTML;
      const labelSpan = btn.querySelector('span:not(.icon-copy)');
      btn.classList.add('copied');
      if (labelSpan) {
        labelSpan.textContent = 'Tersalin!';
      } else {
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = original;
      }, 1600);
    }
  }

  async function boot() {
    try {
      const [manifestRes, routesRes] = await Promise.all([
        fetch('/manifest.json').then((r) => r.json()),
        fetch('/api/routes').then((r) => r.json())
      ]);

      manifest = manifestRes.result;
      routes = routesRes.result;

      el('tagline').textContent = manifest.identity.tagline;
      el('routeCount').textContent = routes.length;
      el('baseUrl').textContent = window.location.origin;
      document.title = manifest.identity.name;

      renderLog();
    } catch (err) {
      logEl.innerHTML = '<p class="empty-state">Gagal memuat endpoint. Coba muat ulang halaman.</p>';
      logEl.hidden = false;
    } finally {
      bootLoader.hidden = true;
    }
  }

  function renderLog() {
    logEl.hidden = false;
    const term = filterInput.value.trim().toLowerCase();
    logEl.innerHTML = '';

    const groups = [...new Set(routes.map((r) => r.group))].sort(
      (a, b) => groupOrder(a) - groupOrder(b)
    );

    groups.forEach((g) => {
      const items = routes.filter((r) => {
        if (r.group !== g) return false;
        if (term && !(r.name.toLowerCase().includes(term) || r.path.toLowerCase().includes(term))) {
          return false;
        }
        return true;
      });

      if (!items.length) return;

      const title = document.createElement('div');
      title.className = 'log-group-title';
      title.textContent = groupLabel(g);
      logEl.appendChild(title);

      items.forEach((route) => logEl.appendChild(buildRow(route)));
    });

    if (!logEl.children.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Tidak ada endpoint yang cocok dengan pencarian itu.';
      logEl.appendChild(empty);
    }
  }

  function sampleFor(param) {
    if (param.example) return param.example;
    return 'contoh';
  }

  function buildRow(route) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.verb').textContent = route.method;
    node.querySelector('.path').textContent = route.path;
    node.querySelector('.name').textContent = route.name;
    node.querySelector('.desc').textContent = route.description;

    const fieldsEl = node.querySelector('.fields');
    const runBtn = node.querySelector('.run-btn');
    const autofillBtn = node.querySelector('.autofill-btn');
    const resultBox = node.querySelector('.result');
    const resultLoading = node.querySelector('.result-loading');
    const resultHead = node.querySelector('.result-head');
    const resultStatus = node.querySelector('.result-status');
    const resultTime = node.querySelector('.result-time');
    const resultSize = node.querySelector('.result-size');
    const copyResultBtn = node.querySelector('.copy-result-btn');
    const resultJson = node.querySelector('.result-json');
    const resultImage = node.querySelector('.result-image');

    let lastResultText = '';
    let currentUrl = '';

    function getCurrentUrl() {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      const query = new URLSearchParams();
      inputs.forEach((input) => {
        const val = input.value.trim();
        if (val) query.set(input.dataset.key, val);
      });
      const qs = query.toString();
      return `${window.location.origin}${route.path}${qs ? `?${qs}` : ''}`;
    }

    function highlightInputs() {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      inputs.forEach((input) => {
        if (input.value.trim()) {
          input.classList.add('filled');
          setTimeout(() => {
            input.classList.remove('filled');
          }, 1500);
        }
      });
    }

    route.params.forEach((param) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML = `<label for="p-${route.path}-${param.key}">${param.key}${param.required ? '' : ' (opsional)'}</label>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `p-${route.path}-${param.key}`;
      input.placeholder = param.hint || '';
      input.dataset.key = param.key;
      input.dataset.required = param.required ? '1' : '0';
      
      input.addEventListener('input', () => {
        input.classList.remove('invalid');
        input.classList.remove('filled');
      });
      wrap.appendChild(input);
      fieldsEl.appendChild(wrap);
    });

    if (!route.params.length) {
      autofillBtn.hidden = true;
    }

    autofillBtn.addEventListener('click', () => {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      inputs.forEach((input) => {
        const param = route.params.find((p) => p.key === input.dataset.key);
        if (param) {
          const sampleValue = sampleFor(param);
          input.value = sampleValue;
          input.classList.remove('invalid');
          input.classList.add('filled');
          setTimeout(() => {
            input.classList.remove('filled');
          }, 1500);
        }
      });
    });

    node.querySelector('.row-head').addEventListener('click', () => {
      node.classList.toggle('open');
    });

    copyResultBtn.addEventListener('click', () => {
      copyText(lastResultText, copyResultBtn);
    });

    runBtn.addEventListener('click', async () => {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      let valid = true;

      inputs.forEach((input) => {
        const val = input.value.trim();
        if (input.dataset.required === '1' && !val) {
          valid = false;
          input.classList.add('invalid');
        } else {
          input.classList.remove('invalid');
        }
      });

      if (!valid) return;

      currentUrl = getCurrentUrl();

      resultBox.hidden = false;
      resultLoading.hidden = false;
      resultLoading.classList.remove('is-done');
      resultHead.hidden = true;
      resultJson.hidden = true;
      resultImage.hidden = true;
      runBtn.disabled = true;

      const stopLoading = () => {
        resultLoading.hidden = true;
        runBtn.disabled = false;
      };
      const safetyTimeout = setTimeout(stopLoading, 20000);

      const startedAt = performance.now();

      try {
        const response = await fetch(currentUrl);
        const elapsedMs = Math.round(performance.now() - startedAt);
        const contentType = response.headers.get('Content-Type') || '';

        resultStatus.textContent = response.status;
        resultStatus.classList.toggle('err', !response.ok);
        resultTime.textContent = `${elapsedMs} ms`;

        if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          resultSize.textContent = formatBytes(blob.size);
          resultImage.src = URL.createObjectURL(blob);
          resultImage.hidden = false;
          lastResultText = currentUrl;
        } else {
          const rawText = await response.text();
          resultSize.textContent = formatBytes(new Blob([rawText]).size);
          let pretty = rawText;
          try {
            pretty = JSON.stringify(JSON.parse(rawText), null, 2);
          } catch (_) { }
          
          const endpointInfo = `Endpoint: ${currentUrl}\n\n`;
          resultJson.textContent = endpointInfo + pretty;
          resultJson.hidden = false;
          lastResultText = pretty;
        }

        resultHead.hidden = false;
      } catch (err) {
        const elapsedMs = Math.round(performance.now() - startedAt);

        resultHead.hidden = false;
        resultStatus.textContent = 'Gagal';
        resultStatus.classList.add('err');
        resultTime.textContent = `${elapsedMs} ms`;
        resultSize.textContent = '—';

        const endpointInfo = `Endpoint: ${currentUrl}\n\n`;
        const message = `Request gagal: ${err.message}`;
        resultJson.textContent = endpointInfo + message;
        resultJson.hidden = false;
        lastResultText = message;
      } finally {
        clearTimeout(safetyTimeout);
        stopLoading();
      }
    });

    return node;
  }

  filterInput.addEventListener('input', renderLog);

  copyBaseBtn.addEventListener('click', () => {
    copyText(window.location.origin, copyBaseBtn);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== filterInput) {
      e.preventDefault();
      filterInput.focus();
    }
  });

  boot();
})();
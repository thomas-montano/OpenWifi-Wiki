// GoatCounter's /count endpoint accepts page views and named events without its hosted script.
// Material's document$ emits for the first page and every instant navigation.
(function () {
  const endpoint = 'https://thomasmontano.goatcounter.com/count';
  const siteHost = 'thomas-montano.github.io';
  let lastPath;
  let firstPage = true;

  function send(fields) {
    // Keep local previews and copies of the generated site out of the reports.
    if (location.hostname !== siteHost) return;

    fetch(endpoint + '?' + new URLSearchParams(fields), {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true
    }).catch(function () {
      // A blocked analytics request must not affect wiki navigation.
    });
  }

  function event(name) {
    // Count each action. GoatCounter otherwise deduplicates events by session.
    send({ p: name, e: '1', ns: '1' });
  }

  function referringHost() {
    try {
      const source = new URL(document.referrer);
      if (!['http:', 'https:'].includes(source.protocol)) return;
      if (source.hostname === location.hostname) return;
      return source.hostname.toLowerCase();
    } catch (_) {
      return;
    }
  }

  function outboundCategory(url) {
    const path = url.pathname.toLowerCase();
    if (/\.(img|zip|xz|gz|tgz|bit|xsa)$/.test(path) || path.includes('/releases/download/')) return 'download';
    if (url.hostname === 'github.com' && (path.startsWith('/open-sdr/openwifi-hw-img') || url.hash.toLowerCase().startsWith('#download'))) return 'download';
    if (/\/releases(?:\/|$)/.test(path)) return 'releases';
    if (url.hostname === 'github.com' && (path.startsWith('/open-sdr/') || path.startsWith('/thomas-montano/openwifi-wiki/'))) return 'source';
    return 'other';
  }

  function trackOutbound(click) {
    if (click.type === 'auxclick' && click.button !== 1) return;
    const link = click.target.closest('a[href]');
    if (!link) return;

    const target = new URL(link.href);
    if (!['http:', 'https:'].includes(target.protocol)) return;
    if (target.hostname === location.hostname) return;
    event('outbound:' + outboundCategory(target));
  }

  function setUpSearch() {
    const form = document.forms.search;
    if (!form) return;
    const input = form.querySelector('[data-md-component="search-query"]');
    const result = document.querySelector('.md-search-result__meta');
    if (!input || !result) return;

    let used = false;
    let noResultsSent = false;
    let timer;

    function checkResults() {
      if (!input.value.trim() || noResultsSent) return;
      if (result.textContent.trim() !== 'No matching documents') return;
      event('search:no-results');
      noResultsSent = true;
    }

    function scheduleCheck() {
      clearTimeout(timer);
      timer = setTimeout(checkResults, 700);
    }

    input.addEventListener('input', function () {
      if (!input.value.trim()) {
        used = false;
        noResultsSent = false;
        clearTimeout(timer);
        return;
      }
      if (!used) {
        event('search:used');
        used = true;
      }
      scheduleCheck();
    });

    new MutationObserver(scheduleCheck).observe(result, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  document$.subscribe(function () {
    const path = location.pathname;
    if (path !== lastPath) {
      const fields = { p: path, s: screen.width };
      if (firstPage) {
        const source = referringHost();
        if (source) fields.r = 'https://' + source;
        firstPage = false;
      }
      send(fields);
      lastPath = path;
    }

    const form = document.forms.feedback;
    if (!form || form.dataset.analyticsBound) return;
    form.dataset.analyticsBound = 'true';
    form.addEventListener('submit', function (submit) {
      submit.preventDefault();
      const rating = submit.submitter && submit.submitter.getAttribute('data-md-value');
      if (rating !== 'yes' && rating !== 'no') return;
      event('feedback:' + rating + ':' + location.pathname);
      form.querySelector('fieldset').disabled = true;
      const note = form.querySelector('.md-feedback__note [data-md-value="' + rating + '"]');
      if (note) note.hidden = false;
    });
    form.hidden = false;
  });

  document.addEventListener('click', trackOutbound);
  document.addEventListener('auxclick', trackOutbound);
  setUpSearch();
})();

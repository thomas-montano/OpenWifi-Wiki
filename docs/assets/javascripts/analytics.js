// GoatCounter's /count endpoint accepts page views and named events without its hosted script.
// Material's document$ emits for the first page and every instant navigation.
(function () {
  const endpoint = 'https://thomasmontano.goatcounter.com/count';
  const siteHost = 'thomas-montano.github.io';
  let lastPath;
  let firstPage = true;
  let agent = false;

  function isAgent() {
    const url = new URL(location.href);
    if (url.searchParams.get('gc') === 'agent') {
      agent = true;
      // Copied or shared addresses must not mark the people who open them.
      url.searchParams.delete('gc');
      history.replaceState(history.state, '', url);
    }
    return agent;
  }

  function send(fields) {
    // Keep local previews and copies of the generated site out of the reports.
    if (location.hostname !== siteHost) return;

    const payload = { ...fields };
    if (isAgent()) {
      payload.p = (fields.e ? 'agent:' : '/__agent__') + fields.p;
      if (fields.t) payload.t = 'Agent: ' + fields.t;
    } else if (navigator.webdriver) {
      // Marked agents skip the flag so GoatCounter keeps them in the agent paths.
      payload.b = '153';
    }

    fetch(endpoint + '?' + new URLSearchParams(payload), {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true
    }).catch(function () {
      // A blocked analytics request must not affect wiki navigation.
    });
  }

  function event(name, title) {
    // Count each action. GoatCounter otherwise deduplicates events by session.
    send({ p: name, t: title || name, e: '1', ns: '1' });
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

  function outboundDestination(url) {
    // The query string can carry personal data, so only the host and path are recorded.
    return (url.hostname + url.pathname).replace(/\/+$/, '').slice(0, 250);
  }

  function trackOutbound(click) {
    if (click.type === 'auxclick' && click.button !== 1) return;
    const link = click.target.closest('a[href]');
    if (!link) return;

    const target = new URL(link.href);
    if (!['http:', 'https:'].includes(target.protocol)) return;
    if (target.hostname === location.hostname) return;
    const category = 'outbound:' + outboundCategory(target);
    event(category + ':' + outboundDestination(target), category);
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
    const pageKey = (isAgent() ? '/__agent__' : '') + path;
    if (pageKey !== lastPath) {
      const fields = { p: path, s: screen.width };
      if (firstPage) {
        const source = referringHost();
        if (source) fields.r = 'https://' + source;
        firstPage = false;
      }
      send(fields);
      lastPath = pageKey;
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

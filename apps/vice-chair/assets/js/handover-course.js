(() => {
  const session = window.FulianAuth?.getSession();
  if (!session || !['vp', 'admin'].includes(session.role)) return;
  document.body.classList.add('vp-mode');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const openButton = document.getElementById('openMenu');
  const closeButton = document.getElementById('closeMenu');
  const setMenu = open => {
    sidebar.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
    openButton.setAttribute('aria-expanded', String(open));
  };
  openButton.setAttribute('aria-controls', 'sidebar');
  openButton.setAttribute('aria-expanded', 'false');
  openButton.addEventListener('click', () => { setMenu(true); closeButton.focus(); });
  closeButton.addEventListener('click', () => { setMenu(false); openButton.focus(); });
  scrim.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && sidebar.classList.contains('open')) { setMenu(false); openButton.focus(); }
  });
  document.querySelector('.user-avatar').textContent = session.name.slice(0, 1);
  let navState = {};
  try { navState = JSON.parse(localStorage.getItem('fulian-nav-groups-v1') || '{}') || {}; } catch {}
  sidebar.querySelectorAll('details[data-nav-key]').forEach(group => {
    if(navState[group.dataset.navKey]) group.open = true;
    group.addEventListener('toggle', () => {
      navState[group.dataset.navKey] = group.open;
      try { localStorage.setItem('fulian-nav-groups-v1', JSON.stringify(navState)); } catch {}
    });
  });
})();

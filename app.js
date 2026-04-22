const API_URL = 'https://randomuser.me/api/?results=20';
const DB_NAME = 'PeopleVaultDB';
const STORE = 'favorites';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let users = [];
let favIds = new Set();
let currentView = 'directory';
let db;

// ── IndexedDB ──

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('name', 'fullName');
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function saveFav(user) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(user);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function removeFav(id) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function getAllFavs() {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
}

// ── Country flags ──

const natToCode = {
  AU:'au',BR:'br',CA:'ca',CH:'ch',DE:'de',DK:'dk',ES:'es',FI:'fi',FR:'fr',
  GB:'gb',IE:'ie',IN:'in',IR:'ir',MX:'mx',NL:'nl',NO:'no',NZ:'nz',RS:'rs',
  TR:'tr',UA:'ua',US:'us'
};
const flagUrl = (nat) => `https://flagcdn.com/w40/${natToCode[nat] || 'un'}.png`;

// ── Normalize user ──

function normalizeUser(u) {
  return {
    id: u.login.uuid,
    fullName: `${u.name.first} ${u.name.last}`,
    first: u.name.first,
    last: u.name.last,
    title: u.name.title,
    email: u.email,
    phone: u.phone,
    cell: u.cell,
    photo: u.picture.large,
    thumbnail: u.picture.thumbnail,
    city: u.location.city,
    state: u.location.state,
    country: u.location.country,
    nat: u.nat,
    street: `${u.location.street.number} ${u.location.street.name}`,
    postcode: u.location.postcode,
    age: u.dob.age,
    username: u.login.username,
    gender: u.gender,
    registered: u.registered.date
  };
}

// ── Fetch users ──

async function fetchUsers() {
  $('#loading').hidden = false;
  $('#load-more').hidden = true;
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const newUsers = data.results.map(normalizeUser);
    users = [...users, ...newUsers];
    renderDirectory();
    toast(`${newUsers.length} personas cargadas`);
  } catch {
    toast('Error de conexión — mostrando caché', true);
  } finally {
    $('#loading').hidden = true;
    $('#load-more').hidden = false;
  }
}

// ── Render cards ──

function cardHTML(user, index) {
  const isFav = favIds.has(user.id);
  const delay = (index % 20) * 40;
  return `
    <article class="card" data-id="${user.id}" style="animation-delay:${delay}ms" role="button" tabindex="0">
      <div class="card-header">
        <img class="avatar" src="${user.thumbnail}" alt="${user.fullName}" loading="lazy" width="56" height="56">
        <div class="card-info">
          <div class="card-name">${user.fullName}</div>
          <div class="card-country">
            <img src="${flagUrl(user.nat)}" alt="${user.nat}" width="16" height="12">
            ${user.country}
          </div>
        </div>
        <button class="btn-fav ${isFav ? 'is-fav' : ''}" data-fav="${user.id}" aria-label="Favorito" title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          ${user.email}
        </div>
        <div class="card-detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          ${user.phone}
        </div>
        <div class="card-detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${user.city}, ${user.state}
        </div>
      </div>
    </article>`;
}

function renderDirectory() {
  const query = $('#search').value.toLowerCase().trim();
  const filtered = users.filter(u =>
    u.fullName.toLowerCase().includes(query) ||
    u.country.toLowerCase().includes(query)
  );
  $('#user-grid').innerHTML = filtered.map((u, i) => cardHTML(u, i)).join('');
}

async function renderFavorites() {
  const favs = await getAllFavs();
  const query = $('#search').value.toLowerCase().trim();
  const filtered = favs.filter(u =>
    u.fullName.toLowerCase().includes(query) ||
    u.country.toLowerCase().includes(query)
  );
  $('#fav-grid').innerHTML = filtered.map((u, i) => cardHTML(u, i)).join('');
  $('#empty-favs').hidden = filtered.length > 0;
  updateBadge(favs.length);
}

function updateBadge(count) {
  const badge = $('#fav-count');
  badge.textContent = count;
  badge.hidden = count === 0;
}

// ── Toggle favorite ──

async function toggleFav(id) {
  const user = users.find(u => u.id === id) || (await getAllFavs()).find(u => u.id === id);
  if (!user) return;

  if (favIds.has(id)) {
    favIds.delete(id);
    await removeFav(id);
    toast(`${user.fullName} eliminado de favoritos`);
  } else {
    favIds.add(id);
    await saveFav(user);
    toast(`${user.fullName} guardado en favoritos ♥`);
  }

  document.querySelectorAll(`[data-fav="${id}"]`).forEach(btn => {
    const isFav = favIds.has(id);
    btn.classList.toggle('is-fav', isFav);
    btn.querySelector('svg path').setAttribute('fill', isFav ? 'currentColor' : 'none');
    btn.title = isFav ? 'Quitar de favoritos' : 'Agregar a favoritos';
  });

  const favs = await getAllFavs();
  updateBadge(favs.length);

  if (currentView === 'favorites') renderFavorites();
}

// ── Modal ──

function openModal(user) {
  const isFav = favIds.has(user.id);
  const regDate = new Date(user.registered).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });

  $('#modal-body').innerHTML = `
    <div class="modal-profile">
      <img class="modal-avatar" src="${user.photo}" alt="${user.fullName}" width="96" height="96">
      <div class="modal-name">${user.title} ${user.fullName}</div>
      <div class="modal-username">@${user.username}</div>
      <div class="modal-details">
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <span class="label">Email</span><span class="value">${user.email}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          <span class="label">Teléfono</span><span class="value">${user.phone}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.05 5A5 5 0 0119 8.95M15.05 1A9 9 0 0123 8.94M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          <span class="label">Celular</span><span class="value">${user.cell}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="label">Dirección</span><span class="value">${user.street}, ${user.city}, ${user.state} ${user.postcode}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          <span class="label">País</span><span class="value">${user.country}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="label">Registro</span><span class="value">${regDate}</span>
        </div>
        <div class="modal-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="label">Edad</span><span class="value">${user.age} años</span>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-fav-modal ${isFav ? 'is-fav' : ''}" data-modal-fav="${user.id}">
        ${isFav ? '♥ En favoritos' : '♡ Agregar a favoritos'}
      </button>
      <button class="btn-close-modal">Cerrar</button>
    </div>`;

  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

// ── Toast ──

let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Events ──

function switchView(view) {
  currentView = view;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'favorites') renderFavorites();
}

document.addEventListener('click', async (e) => {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) { e.stopPropagation(); return toggleFav(favBtn.dataset.fav); }

  const modalFav = e.target.closest('[data-modal-fav]');
  if (modalFav) {
    const id = modalFav.dataset.modalFav;
    await toggleFav(id);
    const isFav = favIds.has(id);
    modalFav.className = `btn-fav-modal ${isFav ? 'is-fav' : ''}`;
    modalFav.textContent = isFav ? '♥ En favoritos' : '♡ Agregar a favoritos';
    return;
  }

  const card = e.target.closest('.card');
  if (card) {
    const id = card.dataset.id;
    const user = users.find(u => u.id === id) || (await getAllFavs()).find(u => u.id === id);
    if (user) openModal(user);
    return;
  }

  if (e.target.closest('.tab')) {
    switchView(e.target.closest('.tab').dataset.view);
    return;
  }

  if (e.target.closest('.modal-backdrop') || e.target.closest('.modal-close') || e.target.closest('.btn-close-modal')) {
    closeModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

$('#load-more').addEventListener('click', fetchUsers);

let searchDebounce;
$('#search').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (currentView === 'directory') renderDirectory();
    else renderFavorites();
  }, 200);
});

// ── Init ──

async function init() {
  await openDB();
  const favs = await getAllFavs();
  favs.forEach(f => favIds.add(f.id));
  updateBadge(favs.length);
  await fetchUsers();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
}

init();

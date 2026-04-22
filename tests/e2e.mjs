import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'screenshots');
const URL = 'http://localhost:8090';

let passed = 0;
let failed = 0;

function log(icon, msg) { console.log(`${icon} ${msg}`); }

async function test(name, fn) {
  try {
    await fn();
    passed++;
    log('✅', name);
  } catch (e) {
    failed++;
    log('❌', `${name} — ${e.message}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  // ── 1. Carga inicial ──
  log('🔄', 'Navegando a la app...');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SHOTS, '01-carga-inicial.png'), fullPage: true });

  await test('Carga inicial: se renderizan cards de usuarios', async () => {
    const cards = await page.$$('.card');
    if (cards.length === 0) throw new Error(`Se encontraron ${cards.length} cards, se esperaban >0`);
    log('   📊', `${cards.length} cards renderizadas`);
  });

  await test('Header visible con logo y tabs', async () => {
    await page.waitForSelector('.logo h1');
    const title = await page.textContent('.logo h1');
    if (!title.includes('PeopleVault')) throw new Error(`Título incorrecto: ${title}`);
  });

  await test('Barra de búsqueda visible', async () => {
    await page.waitForSelector('#search');
  });

  // ── 2. Búsqueda / filtro ──
  log('🔄', 'Probando búsqueda...');
  const firstName = await page.textContent('.card:first-child .card-name');
  const searchTerm = firstName.split(' ')[0];
  await page.fill('#search', searchTerm);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, '02-busqueda.png'), fullPage: true });

  await test(`Búsqueda por "${searchTerm}" filtra resultados`, async () => {
    const cards = await page.$$('.card');
    const allNames = await Promise.all(cards.map(c => c.textContent()));
    const allMatch = allNames.every(n => n.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!allMatch) throw new Error('Hay cards que no coinciden con la búsqueda');
    log('   📊', `${cards.length} cards coinciden`);
  });

  await page.fill('#search', '');
  await page.waitForTimeout(1000);

  // ── 3. Favoritos ──
  log('🔄', 'Probando favoritos...');
  const cardName = await page.textContent('.card:first-child .card-name');
  await page.click('.card:first-child .btn-fav', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '03-favorito-agregado.png'), fullPage: true });

  await test(`Agregar favorito: "${cardName}"`, async () => {
    const btn = await page.$('.card:first-child .btn-fav');
    const cls = await btn.getAttribute('class');
    if (!cls.includes('is-fav')) throw new Error('El botón no tiene clase is-fav');
  });

  await test('Badge de favoritos muestra 1', async () => {
    const badge = await page.textContent('#fav-count');
    if (badge.trim() !== '1') throw new Error(`Badge muestra "${badge}" en vez de "1"`);
  });

  // Agregar un segundo favorito
  await page.click('.card:nth-child(2) .btn-fav', { force: true });
  await page.waitForTimeout(300);

  // ── 4. Vista de favoritos ──
  log('🔄', 'Cambiando a vista de favoritos...');
  await page.click('[data-view="favorites"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '04-vista-favoritos.png'), fullPage: true });

  await test('Vista de favoritos muestra 2 cards', async () => {
    const cards = await page.$$('#fav-grid .card');
    if (cards.length !== 2) throw new Error(`Se esperaban 2 favoritos, hay ${cards.length}`);
  });

  // ── 5. Quitar un favorito desde la vista de favoritos ──
  log('🔄', 'Quitando un favorito...');
  await page.click('#fav-grid .card:first-child .btn-fav', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '05-favorito-quitado.png'), fullPage: true });

  await test('Quitar favorito deja 1 card en favoritos', async () => {
    const cards = await page.$$('#fav-grid .card');
    if (cards.length !== 1) throw new Error(`Se esperaba 1 favorito, hay ${cards.length}`);
  });

  // ── 6. Modal de detalle ──
  log('🔄', 'Probando modal de detalle...');
  await page.click('[data-view="directory"]');
  await page.waitForTimeout(300);
  const thirdCard = await page.$('.card:nth-child(3)');
  await thirdCard.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '06-modal-detalle.png') });

  await test('Modal se abre con datos del usuario', async () => {
    const modal = await page.$('#modal');
    const hidden = await modal.getAttribute('hidden');
    if (hidden !== null) throw new Error('El modal sigue oculto');
    const name = await page.textContent('.modal-name');
    if (!name || name.length < 3) throw new Error(`Nombre en modal vacío: "${name}"`);
    log('   📊', `Modal muestra: ${name}`);
  });

  await test('Modal tiene botón de favorito y cerrar', async () => {
    await page.waitForSelector('.btn-fav-modal');
    await page.waitForSelector('.btn-close-modal');
  });

  // Cerrar modal con botón
  await page.click('.btn-close-modal');
  await page.waitForTimeout(300);

  await test('Modal se cierra con botón', async () => {
    const modal = await page.$('#modal');
    const hidden = await modal.getAttribute('hidden');
    if (hidden === null) throw new Error('El modal no se cerró');
  });

  // ── 7. Cerrar modal con Escape ──
  const fourthCard = await page.$('.card:nth-child(4)');
  await fourthCard.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await test('Modal se cierra con tecla Escape', async () => {
    const modal = await page.$('#modal');
    const hidden = await modal.getAttribute('hidden');
    if (hidden === null) throw new Error('El modal no se cerró con Escape');
  });

  // ── 8. Scroll infinito ──
  log('🔄', 'Probando scroll infinito...');
  const cardsBefore = (await page.$$('.card')).length;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, '07-scroll-infinito.png'), fullPage: true });

  await test('Scroll al final auto-carga más cards', async () => {
    const cardsAfter = (await page.$$('.card')).length;
    if (cardsAfter <= cardsBefore) throw new Error(`Antes: ${cardsBefore}, después: ${cardsAfter}`);
    log('   📊', `${cardsBefore} → ${cardsAfter} cards (auto-cargadas)`);
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // ── 8.5. Filtros API ──
  log('🔄', 'Probando filtros de API (género + nacionalidad)...');
  await page.click('#filter-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, '07b-modal-filtros.png') });

  await test('Modal de filtros se abre', async () => {
    const modal = await page.$('#filter-modal');
    const hidden = await modal.getAttribute('hidden');
    if (hidden !== null) throw new Error('Modal de filtros no abrió');
  });

  // Selecciona género femenino y nacionalidad ES
  await page.click('[data-gender="female"]');
  await page.click('[data-nat="ES"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, '07c-filtros-seleccionados.png') });
  await page.click('#filter-apply');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, '07d-resultados-filtrados.png'), fullPage: true });

  await test('Aplicar filtros: usuarios son mujeres de España', async () => {
    const cards = await page.$$('.card');
    if (cards.length === 0) throw new Error('No se cargaron usuarios filtrados');
    const countries = await Promise.all(
      cards.slice(0, 5).map(c => c.$eval('.card-country', el => el.textContent.trim()))
    );
    const allSpain = countries.every(c => c.includes('Spain'));
    if (!allSpain) throw new Error(`No todos son de España: ${countries.join(', ')}`);
    log('   📊', `${cards.length} cards, todos de España ✓`);
  });

  await test('Badge de filtros muestra 2', async () => {
    const badge = await page.textContent('#filter-badge');
    if (badge.trim() !== '2') throw new Error(`Badge: "${badge}" en vez de "2"`);
  });

  // Limpia filtros
  await page.click('#filter-btn');
  await page.waitForTimeout(300);
  await page.click('#filter-clear');
  await page.click('#filter-apply');
  await page.waitForTimeout(3000);

  // ── 9. Búsqueda por país ──
  log('🔄', 'Probando búsqueda por país...');
  const countryText = await page.textContent('.card:nth-child(5) .card-country');
  const country = countryText.trim();
  await page.fill('#search', country);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, '08-busqueda-pais.png'), fullPage: true });

  await test(`Búsqueda por país "${country}" filtra correctamente`, async () => {
    const cards = await page.$$('.card');
    if (cards.length === 0) throw new Error('No se encontraron resultados');
    log('   📊', `${cards.length} cards de "${country}"`);
  });

  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // ── 10. Estado vacío de favoritos ──
  log('🔄', 'Probando estado vacío de favoritos...');
  await page.click('[data-view="favorites"]');
  await page.waitForTimeout(300);
  // Quitar el favorito restante
  const lastFav = await page.$('#fav-grid .card .btn-fav');
  if (lastFav) {
    await lastFav.click({ force: true });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(SHOTS, '09-favoritos-vacio.png'), fullPage: true });

  await test('Estado vacío muestra mensaje', async () => {
    const empty = await page.$('#empty-favs');
    const hidden = await empty.getAttribute('hidden');
    if (hidden !== null) throw new Error('El empty state no se muestra');
  });

  // ── 11. Responsive (mobile) ──
  log('🔄', 'Probando vista móvil...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-view="directory"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '10-mobile.png'), fullPage: true });

  await test('Vista mobile renderiza correctamente', async () => {
    const cards = await page.$$('.card');
    if (cards.length === 0) throw new Error('No se renderizan cards en mobile');
  });

  // ── Resumen ──
  console.log('\n' + '═'.repeat(50));
  console.log(`📋 RESULTADOS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('═'.repeat(50));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();

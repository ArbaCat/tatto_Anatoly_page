'use strict';
const works = [
  { src:'assets/colour.jpg', title:'Farba. Svetlo. Detail.', category:'Farba · predlaktie', alt:'Farebný portrét s modrým závojom a zlatou svätožiarou na predlaktí', description:'Živopisný portrét, sýta modrá a teplé zlaté tóny. Pozri si celú kompozíciu v pôvodnej fotografii.' },
  { src:'assets/black-grey.jpg', title:'Čierna a sivá.', category:'Čierno-sivá kompozícia', alt:'Čierno-sivá bojovníčka so zvieracou hlavou; tri pohľady na tetovanie', description:'Výraz, svetlo a hĺbka bez farby. Fotografia zachytáva prácu z viacerých uhlov.' },
  { src:'assets/ornament.jpg', title:'Ornament, ktorý patrí k telu.', category:'Folklórny ornament · chrbát', alt:'Farebný symetrický kvetinový ornament na hornej časti chrbta', description:'Kvetinový motív rozprestretý cez ramená. Symetria, výrazná kontúra a farba.' },
  { src:'assets/japanese.jpg', title:'Líška a pivónie.', category:'Farebná kompozícia · rukáv', alt:'Farebný rukáv s líškou a pivóniami, celkový pohľad a detail', description:'Rozsiahlejšia farebná kompozícia. Celkový pohľad a detail z pôvodnej fotografie.' },
  { src:'assets/neo.jpg', title:'Ilustrácia na koži.', category:'Farebný portrét · rameno', alt:'Farebný ilustrovaný portrét ženy na ramene', description:'Ilustratívny portrét s teplou paletou a výraznými obrysmi.' }
];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const root = document.documentElement;
root.classList.add('js');

/* ---------- Motion helpers ---------- */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
const EASE_EXIT = 'cubic-bezier(.4,0,1,1)';
const calm = () => reducedMotion.matches || !Element.prototype.animate;
const runningMotion = new Set();
function track(animation){
  runningMotion.add(animation);
  const done = () => runningMotion.delete(animation);
  animation.finished.then(done, done);
  return animation;
}
function animateIn(element, {distance=14, duration=650, delay=0}={}){
  if(calm()) return;
  track(element.animate([
    {opacity:0, transform:`translateY(${distance}px)`},
    {opacity:1, transform:'none'}
  ], {duration, delay, easing:EASE_OUT, fill:'backwards'}));
}
function stagger(elements, start=0, step=50, distance=16){
  elements.forEach((element, index) => animateIn(element, {distance, duration:640, delay:start + index*step}));
}
reducedMotion.addEventListener('change', () => {
  if(reducedMotion.matches) for(const animation of [...runningMotion]) animation.finish();
});

const pad = n => String(n).padStart(2, '0');
const counter = index => `${pad(index + 1)} / ${pad(works.length)}`;
const wrap = index => (index + works.length) % works.length;

/* Switching works. Every variant (photo, caption, counter) exists up front and sits in the
   same place; switching only moves the .is-active class and CSS transitions do the rest.
   Photos are decoded in advance, so nothing has to load mid-transition, and transitions
   interrupted by fast clicking continue from wherever they are instead of snapping. */
function buildLayers(first){
  const layers = [first];
  for(const work of works.slice(1)){
    const image = first.cloneNode(false);
    image.classList.remove('is-active');
    image.fetchPriority = 'low'; // hidden until switched to; never compete with the first screen
    image.src = work.src; image.alt = work.alt;
    layers[layers.length - 1].after(image);
    layers.push(image);
  }
  for(const image of layers) if(image.decode) image.decode().catch(() => {});
  return layers;
}
function buildStack(container, fill){
  const first = container.firstElementChild;
  const items = [first];
  works.forEach((work, index) => {
    if(index === 0) return;
    const item = first.cloneNode(true);
    item.classList.remove('is-active');
    fill(item, work, index);
    container.append(item);
    items.push(item);
  });
  return items;
}
function activate(items, index, direction=0, {enter=10, container=null}={}){
  const next = items[index];
  // Hand control back to CSS if an entrance animation (e.g. opening the gallery) is still running.
  for(const item of items) for(const animation of item.getAnimations()) if(!animation.transitionProperty) animation.cancel();
  if(container) container.style.setProperty('--out', `${-direction*8}px`);
  if(!direction || calm()){
    for(const item of items){ item.style.transition = 'none'; item.classList.toggle('is-active', item === next); }
    void next.offsetWidth;
    for(const item of items) item.style.transition = '';
    return;
  }
  if(next.classList.contains('is-active')) return;
  // Start the incoming item slightly off to the side it comes from — unless it is still
  // partly visible from a previous switch, in which case it simply turns around.
  if(parseFloat(getComputedStyle(next).opacity) < .05){
    next.style.transition = 'none'; next.style.translate = `${direction*enter}px 0`;
    void next.offsetWidth;
    next.style.transition = ''; next.style.translate = '';
  }
  for(const item of items) item.classList.toggle('is-active', item === next);
}
const fillCounter = (item, work, index) => { item.textContent = counter(index); };
function onSwipe(element, handler){
  let start = null;
  element.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0]; start = {x:touch.clientX, y:touch.clientY};
  }, {passive:true});
  element.addEventListener('touchend', event => {
    if(!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    start = null;
    if(Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)*1.5) handler(dx < 0 ? 1 : -1);
  }, {passive:true});
}

/* ---------- Dialogs ---------- */
const menu = $('#menu-dialog'), gallery = $('#gallery-dialog'), booking = $('#booking-dialog');
const header = $('.header'), hero = $('.hero');
let featuredIndex = 0, galleryIndex = 0;
let heroVisible = true, contactVisible = false;
const mobileBar = $('.mobile-book');
mobileBar.hidden = false;
function updateBar(){
  const show = !(heroVisible || contactVisible || document.querySelector('dialog[open]'));
  mobileBar.classList.toggle('is-visible', show);
  mobileBar.inert = !show;
}
updateBar();
function openDialog(dialog){
  if(dialog._closing){
    for(const animation of dialog.getAnimations()) animation.cancel();
    dialog._closing = null; dialog.classList.remove('is-closing');
  }
  const others = $$('dialog[open]').filter(current => current !== dialog);
  for(const current of others){
    for(const animation of current.getAnimations()) animation.cancel();
    current._closing = null;
    current.close();
    current.classList.remove('is-closing', 'is-swap');
  }
  // Switching from one dialog to another keeps the backdrop steady.
  dialog.classList.toggle('is-swap', others.length > 0);
  dialog._openedAt = performance.now();
  if(!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open'); updateBar();
}
function closeDialog(dialog){
  if(!dialog.open) return Promise.resolve();
  if(dialog._closing) return dialog._closing;
  if(calm()){ dialog.close(); afterClose(dialog); return Promise.resolve(); }
  for(const animation of dialog.getAnimations()) animation.finish();
  dialog.classList.add('is-closing');
  const exit = track(dialog.animate([
    {opacity:1, transform:'none'},
    {opacity:0, transform:dialog === menu ? 'none' : 'translateY(10px) scale(.99)'}
  ], {duration:230, easing:EASE_EXIT, fill:'forwards'}));
  const closing = dialog._closing = exit.finished.catch(() => {}).then(() => {
    if(dialog._closing !== closing) return;
    dialog._closing = null;
    if(dialog.open) dialog.close();
    exit.cancel();
    afterClose(dialog);
  });
  return closing;
}
function afterClose(dialog){
  dialog.classList.remove('is-closing', 'is-swap');
  if(!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
  updateBar();
}
for(const dialog of $$('dialog')){
  dialog.querySelector('.close').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('close', () => afterClose(dialog));
  // Close on the backdrop only when the press both started and ended there: dragging a text
  // selection out of a field must not close the form, and the second click of a double click
  // that opened the dialog must not close it again.
  const onBackdrop = event => {
    if(event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = onBackdrop(event); });
  dialog.addEventListener('click', event => {
    const pressed = pressedBackdrop; pressedBackdrop = false;
    if(!pressed || !onBackdrop(event) || performance.now() - (dialog._openedAt || 0) < 350) return;
    closeDialog(dialog);
  });
}
const plainKey = event => !(event.altKey || event.metaKey || event.ctrlKey || event.shiftKey);
$('.menu-button').addEventListener('click', () => {
  openDialog(menu);
  stagger($$('.menu-dialog nav a, .menu-dialog > .pill'), 90, 55, 18);
});

/* ---------- Selected works ---------- */
const featuredLayers = buildLayers($('#open-featured > img'));
const workCaption = $('#work-caption'), workCounter = $('#work-counter');
const captionItems = buildStack(workCaption, (item, work) => {
  item.querySelector('p').textContent = work.category.toUpperCase();
  item.querySelector('h3').textContent = work.title;
});
const counterItems = buildStack(workCounter, fillCounter);
function showFeatured(index, direction=0){
  featuredIndex = wrap(index); const work = works[featuredIndex];
  activate(featuredLayers, featuredIndex, direction, {enter:14});
  activate(captionItems, featuredIndex, direction, {container:workCaption});
  activate(counterItems, featuredIndex, direction, {enter:6, container:workCounter});
  $('#open-featured').setAttribute('aria-label', `Zväčšiť prácu: ${work.title}`);
  if(direction) $('#work-status').textContent = `${counter(featuredIndex)} — ${work.title}`;
}
$('#previous-work').addEventListener('click', () => showFeatured(featuredIndex - 1, -1));
$('#next-work').addEventListener('click', () => showFeatured(featuredIndex + 1, 1));
$('#prace').addEventListener('keydown', event => {
  if(!plainKey(event)) return; // Alt/Cmd+arrow is browser navigation, not "next work"
  if(event.key === 'ArrowRight'){ event.preventDefault(); showFeatured(featuredIndex + 1, 1); }
  if(event.key === 'ArrowLeft'){ event.preventDefault(); showFeatured(featuredIndex - 1, -1); }
});
onSwipe($('#prace'), direction => showFeatured(featuredIndex + direction, direction));

/* Clip each photo layer to the area the picture actually covers (object-fit: contain
   leaves empty bands). The clip is invisible, but it means only the photograph reacts to
   the pointer — not the black space around it, and never the controls next to it. */
function fitHitArea(image){
  const w = image.naturalWidth, h = image.naturalHeight;
  if(!w || !h || !image.clientWidth) return;
  const s = getComputedStyle(image);
  const pt = parseFloat(s.paddingTop), pr = parseFloat(s.paddingRight), pb = parseFloat(s.paddingBottom), pl = parseFloat(s.paddingLeft);
  const boxW = image.clientWidth - pl - pr, boxH = image.clientHeight - pt - pb;
  const scale = Math.min(boxW/w, boxH/h), drawnW = w*scale, drawnH = h*scale;
  const left = Math.floor(pl + (boxW - drawnW)/2), top = Math.floor(pt + (boxH - drawnH)/2);
  const right = Math.floor(image.clientWidth - left - drawnW), bottom = Math.floor(image.clientHeight - top - drawnH);
  image.style.clipPath = `inset(${Math.max(0, top)}px ${Math.max(0, right)}px ${Math.max(0, bottom)}px ${Math.max(0, left)}px)`;
}
const fitAllHitAreas = () => featuredLayers.forEach(fitHitArea);
for(const image of featuredLayers) if(!image.complete) image.addEventListener('load', () => fitHitArea(image));
fitAllHitAreas();
if('ResizeObserver' in window) new ResizeObserver(fitAllHitAreas).observe($('#open-featured'));
else window.addEventListener('resize', fitAllHitAreas);

/* ---------- Gallery ---------- */
const galleryLayers = buildLayers($('.gallery-photo-wrap > img'));
const galleryText = $('#gallery-text'), galleryCount = $('#gallery-count');
const galleryTextItems = buildStack(galleryText, (item, work) => {
  item.querySelector('.eyebrow').textContent = work.category.toUpperCase();
  item.querySelector('h2').textContent = work.title;
  item.querySelector('.gallery-description').textContent = work.description;
});
const galleryCountItems = buildStack(galleryCount, fillCounter);
function showGallery(index, direction=0){
  galleryIndex = wrap(index); const work = works[galleryIndex];
  activate(galleryLayers, galleryIndex, direction, {enter:14});
  activate(galleryTextItems, galleryIndex, direction, {container:galleryText});
  activate(galleryCountItems, galleryIndex, direction, {enter:6, container:galleryCount});
  gallery.setAttribute('aria-label', work.title);
  // The page's live region is inert behind the modal, so the dialog has its own.
  if(direction) $('#gallery-status').textContent = `${counter(galleryIndex)} — ${work.title}`;
}
function openGallery(index){
  showGallery(index);
  openDialog(gallery);
  if(!calm()) track(galleryLayers[galleryIndex].animate([
    {opacity:0, transform:'scale(1.035)'},
    {opacity:1, transform:'none'}
  ], {duration:800, delay:60, easing:EASE_OUT, fill:'backwards'}));
  stagger($$('.gallery-copy > *'), 120, 45, 12);
}
$('#open-featured').addEventListener('click', () => openGallery(featuredIndex));
$('#work-detail').addEventListener('click', () => openGallery(featuredIndex));
for(const button of $$('[data-work]')) button.addEventListener('click', () => openGallery(Number(button.dataset.work)));
$('#gallery-prev').addEventListener('click', () => showGallery(galleryIndex - 1, -1));
$('#gallery-next').addEventListener('click', () => showGallery(galleryIndex + 1, 1));
gallery.addEventListener('keydown', event => {
  if(!plainKey(event)) return;
  if(event.key === 'ArrowRight'){ event.preventDefault(); showGallery(galleryIndex + 1, 1); }
  if(event.key === 'ArrowLeft'){ event.preventDefault(); showGallery(galleryIndex - 1, -1); }
});
onSwipe($('.gallery-photo-wrap'), direction => showGallery(galleryIndex + direction, direction));

/* ---------- Booking ---------- */
const form = $('#booking-form'), result = $('#message-result');
function openBooking(work){
  form.hidden = false; result.hidden = true; $('#copy-status').textContent = '';
  if(work){
    const idea = form.elements.idea;
    const reference = `Páči sa mi práca „${work.title}“ a chcem prebrať vlastný motív.`;
    if(!idea.value.trim()) idea.value = reference;
    else if(!idea.value.includes(work.title)) idea.value += '\n\n' + reference;
  }
  openDialog(booking);
  stagger($$('.booking-content > :not([hidden])'), 80, 50, 10);
}
for(const button of $$('[data-book]')) button.addEventListener('click', () => openBooking());
$('#gallery-consult').addEventListener('click', () => openBooking(works[galleryIndex]));
form.addEventListener('submit', event => {
  event.preventDefault();
  for(const field of [form.elements.name, form.elements.contact, form.elements.idea]){
    field.setCustomValidity(field.value.trim() ? '' : 'Vyplň, prosím, toto pole.');
  }
  if(!form.reportValidity()) return;
  const data = new FormData(form);
  const message = `Ahoj Anatoly,\n\nvolám sa ${data.get('name').trim()}. Chcem sa poradiť o tetovaní.\n\n${data.get('idea').trim()}\n\nMôj kontakt: ${data.get('contact').trim()}\n\nĎakujem!`;
  $('#prepared-message').value = message;
  // The addresses live in the HTML (they also work without JS); here we only add the text.
  $('#email-message').href = `${baseHref($('#email-message'))}?subject=${encodeURIComponent('Konzultácia — Anatoly Tsar')}&body=${encodeURIComponent(message)}`;
  $('#whatsapp-message').href = `${baseHref($('#whatsapp-message'))}?text=${encodeURIComponent(message)}`;
  form.hidden = true; result.hidden = false; $('#copy-status').textContent = ''; $('#result-title').focus();
  stagger([...result.children], 0, 45, 10);
});
function baseHref(link){
  if(!link.dataset.base) link.dataset.base = link.getAttribute('href').split('?')[0];
  return link.dataset.base;
}
for(const field of form.querySelectorAll('input,textarea')) field.addEventListener('input', () => field.setCustomValidity(''));
$('#edit-message').addEventListener('click', () => { result.hidden = true; form.hidden = false; form.elements.idea.focus(); });
const copyStatus = $('#copy-status');
// navigator.clipboard is missing on file:// and other insecure origins, so guard the whole call.
const copyMessage = async () => {
  try{ await navigator.clipboard.writeText($('#prepared-message').value); return true; }
  catch{ return false; }
};
$('#copy-message').addEventListener('click', async () => {
  if(await copyMessage()){ copyStatus.textContent = 'Skopírované. Teraz ju môžeš vložiť do správy.'; return; }
  const text = $('#prepared-message'); text.focus(); text.select();
  copyStatus.textContent = 'Text je označený. Skopíruj ho cez Ctrl+C alebo ⌘C.';
});
// Instagram and Facebook links can't carry text: copy it on the way out, the link opens as usual.
for(const link of $$('[data-copy-note]')) link.addEventListener('click', async () => {
  copyStatus.textContent = (await copyMessage())
    ? `Správa je skopírovaná. ${link.dataset.copyNote}`
    : `Skopíruj text správy vyššie. ${link.dataset.copyNote}`;
});

/* ---------- FAQ: answers open and close with their height ---------- */
for(const details of $$('.questions details')){
  const summary = details.querySelector('summary');
  summary.addEventListener('click', event => {
    if(calm()) return;
    event.preventDefault();
    const from = details.getBoundingClientRect().height;
    if(details._anim) details._anim.cancel();
    const closing = details.open && !details.classList.contains('is-closing');
    details.classList.add('is-animating');
    let to;
    if(closing){
      details.classList.add('is-closing');
      to = summary.offsetHeight + (details.offsetHeight - details.clientHeight);
    }else{
      details.classList.remove('is-closing');
      details.open = true;
      to = details.getBoundingClientRect().height;
      const answer = details.querySelector('p');
      track(answer.animate([{opacity:0, transform:'translateY(-6px)'}, {opacity:1, transform:'none'}], {duration:520, delay:60, easing:EASE_OUT, fill:'backwards'}));
    }
    const anim = details._anim = details.animate([{height:`${from}px`}, {height:`${to}px`}], {duration:closing ? 380 : 480, easing:EASE_OUT});
    anim.finished.then(() => {
      if(closing) details.open = false;
      details.classList.remove('is-animating', 'is-closing');
      details._anim = null;
    }, () => {});
  });
}

/* ---------- Header and in-page navigation ---------- */
const navLinks = $$('.desktop-nav a[href^="#"], .menu-dialog nav a');
const zones = ['#prace', '#o-mne', '#kontakt'].map(hash => [hash, $(hash)]);
// Layout is measured once (and again when the page changes size), never inside the
// scroll handler: scrolling only reads scrollY and flips a couple of classes.
const layout = {zoneTops:[], docHeight:0, viewport:0, headerHeight:80};
function measure(){
  layout.zoneTops = zones.map(([, element]) => element.getBoundingClientRect().top + window.scrollY);
  layout.docHeight = root.scrollHeight;
  layout.viewport = window.innerHeight;
  layout.headerHeight = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 80;
}
const headerHeight = () => layout.headerHeight;
let lastY = window.scrollY, travel = 0, travelDirection = 0, headerLock = null, activeHash = null;
function updateHeader(){
  const y = Math.max(0, window.scrollY);
  const dy = y - lastY; lastY = y;
  // Count how far the page has moved in one direction; tiny reversals don't toggle the bar.
  if(dy){
    const direction = Math.sign(dy);
    if(direction !== travelDirection){ travelDirection = direction; travel = 0; }
    travel += Math.abs(dy);
  }
  let hidden = header.classList.contains('is-hidden');
  if(headerLock) hidden = headerLock === 'hidden';
  else if(y < 120 || header.querySelector(':focus-visible')) hidden = false;
  else if(travelDirection > 0 && travel > 10) hidden = true;
  else if(travelDirection < 0 && travel > 48) hidden = false;
  // Transparent only at the very top; wherever the bar is visible further down it is solid,
  // so page text never runs underneath the wordmark.
  header.classList.toggle('is-solid', y > 120);
  header.classList.toggle('is-hidden', hidden);
}
function updateActive(){
  const y = window.scrollY, probe = y + layout.viewport*.45;
  let current = null;
  zones.forEach(([hash], index) => { if(layout.zoneTops[index] <= probe) current = hash; });
  if(layout.viewport + y >= layout.docHeight - 2) current = '#kontakt';
  if(current === activeHash) return;
  activeHash = current;
  for(const link of navLinks){
    if(link.getAttribute('href') === current) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}
function onScroll(){ updateHeader(); updateActive(); }
measure();
window.addEventListener('scroll', onScroll, {passive:true});
window.addEventListener('resize', () => { measure(); onScroll(); });
window.addEventListener('load', () => { measure(); onScroll(); });
if('ResizeObserver' in window) new ResizeObserver(() => measure()).observe($('main'));
header.addEventListener('focusin', event => { if(event.target.matches(':focus-visible')) header.classList.remove('is-hidden'); });
onScroll();

let scrollJob = null;
function stopScroll(){
  if(!scrollJob) return;
  cancelAnimationFrame(scrollJob.raf); scrollJob = null; headerLock = null;
  travel = 0; travelDirection = 0;
}
for(const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(type, stopScroll, {passive:true, capture:true});
const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
function scrollToY(y, done){
  const from = window.scrollY, distance = y - from;
  if(calm() || Math.abs(distance) < 2){ window.scrollTo(0, y); done(); return; }
  const duration = Math.min(1150, Math.max(480, 320 + Math.abs(distance)*.22));
  const job = scrollJob = {raf:0, start:performance.now()};
  const step = now => {
    if(scrollJob !== job) return;
    const t = Math.min(1, Math.max(0, (now - job.start)/duration));
    window.scrollTo(0, from + distance*easeInOut(t));
    if(t < 1) job.raf = requestAnimationFrame(step);
    else{ scrollJob = null; done(); }
  };
  job.raf = requestAnimationFrame(step);
}
// A malformed hash (e.g. "#%") makes decodeURIComponent throw; treat it as "no target".
const byHash = hash => { try{ return document.getElementById(decodeURIComponent(hash.slice(1))); }catch{ return null; } };
function goTo(hash, {focus=false}={}){
  const target = byHash(hash);
  if(!target) return;
  stopScroll();
  const top = target === hero ? 0 : target.getBoundingClientRect().top + window.scrollY;
  const goingDown = top > window.scrollY + 1;
  // Reading down: the header steps aside and the section lands flush.
  // Going back up: the header stays and the section lands just below it.
  headerLock = top < 1 ? 'top' : (goingDown || target.dataset.land === 'flush') ? 'hidden' : 'shown';
  const offset = headerLock === 'shown' ? headerHeight() : 0;
  const maxY = root.scrollHeight - window.innerHeight;
  const y = Math.round(Math.max(0, Math.min(maxY, top - offset)));
  try{ history.replaceState(null, '', hash); }catch{} // file:// and sandboxed previews may refuse
  updateHeader();
  scrollToY(y, () => {
    // Forget the distance the programmatic scroll travelled, otherwise a long jump back up
    // counts as "scrolling up" and the header slides over the section that just landed flush.
    headerLock = null; lastY = window.scrollY; travel = 0; travelDirection = 0; onScroll();
    if(focus){
      if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({preventScroll:true});
    }
  });
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if(!link || link.classList.contains('skip') || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const hash = link.getAttribute('href');
  if(hash.length < 2 || !byHash(hash)) return;
  event.preventDefault();
  const options = {focus:event.detail === 0};
  if(menu.contains(link)) closeDialog(menu).then(() => goTo(hash, options));
  else goTo(hash, options);
});

/* ---------- Visibility-driven bits ---------- */
if('IntersectionObserver' in window){
  // Several entries can queue up between callbacks; the last one is the current state.
  new IntersectionObserver(entries => { heroVisible = entries.at(-1).isIntersecting; updateBar(); }, {threshold:0}).observe(hero);
  new IntersectionObserver(entries => { contactVisible = entries.at(-1).isIntersecting; updateBar(); }, {threshold:0.1}).observe($('.contact'));
}
// Content does not fade or slide in while scrolling: photos are simply there when they
// arrive. Every image is decoded ahead of time so none of them paints in late.
const decodeAll = () => { for(const image of $$('img')) if(image.decode) image.decode().catch(() => {}); };
if('requestIdleCallback' in window) requestIdleCallback(decodeAll, {timeout:1200}); else setTimeout(decodeAll, 300);

/* ---------- First screen ---------- */
// The headline's entrance lives in style.css (hero-in), so it starts with the first paint.

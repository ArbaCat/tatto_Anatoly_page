'use strict';
(() => {
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
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
function stagger(elements, start = 0, step = 50, distance = 16){
  if(calm()) return;
  elements.forEach((element, index) => track(element.animate(
    [{opacity:0, transform:`translateY(${distance}px)`}, {opacity:1, transform:'none'}],
    {duration:640, delay:start + index*step, easing:EASE_OUT, fill:'backwards'})));
}
reducedMotion.addEventListener('change', () => {
  if(reducedMotion.matches) for(const animation of [...runningMotion]) animation.finish();
});
const plainKey = event => !(event.altKey || event.metaKey || event.ctrlKey || event.shiftKey);
/* ---------- Works: the thumbnail list in index.html is the single source ---------- */
const thumbs = $$('#work-list .thumb');
const works = thumbs.map(link => {
  const full = link.getAttribute('href'), w = Number(link.dataset.w) || 0;
  return {
    full, w, mid:full.replace(/\.jpg$/, '-960.jpg'), midW:Math.min(960, w),
    title:link.dataset.title, category:link.dataset.category,
    description:link.dataset.description || '', alt:$('img', link).alt
  };
});
if(!works.length) return;
const pad = n => String(n).padStart(2, '0');
const counter = index => `${pad(index + 1)} / ${pad(works.length)}`;
const wrap = index => (index + works.length) % works.length;
// Responsive source for a work: the 960 px copy for phones, the original for larger screens.
function setSource(image, work){
  if(work.midW < work.w){ image.srcset = `${work.mid} ${work.midW}w, ${work.full} ${work.w}w`; image.src = work.mid; }
  else{ image.removeAttribute('srcset'); image.src = work.full; }
  image.alt = work.alt;
}
// WhatsApp: the number lives in the HTML links; only the prefilled text changes.
const whatsappBase = $('#viewer-cta').getAttribute('href').split('?')[0];
const similarMessage = work => `${whatsappBase}?text=${encodeURIComponent(`Ahoj Anatoly, páči sa mi tvoja práca „${work.title}“. Chcel/a by som sa poradiť o podobnom tetovaní.`)}`;

/* Switching. Every variant (photo, caption, counter) exists up front in the same place;
   switching moves .is-active and CSS transitions do the rest. Fast clicks turn a running
   transition around instead of snapping. */
function buildLayers(first){
  const layers = [first];
  works.forEach((work, index) => {
    if(index){
      const image = first.cloneNode(false);
      image.classList.remove('is-active');
      image.fetchPriority = 'low'; // hidden until switched to; never competes with the first screen
      layers.at(-1).after(image);
      layers.push(image);
    }
    setSource(layers[index], work);
  });
  for(const image of layers) if(image.decode) image.decode().catch(() => {});
  return layers;
}
function buildStack(container, fill){
  const first = container.firstElementChild, items = [first];
  works.forEach((work, index) => {
    if(!index) return;
    const item = first.cloneNode(true);
    item.classList.remove('is-active');
    fill(item, work, index);
    container.append(item);
    items.push(item);
  });
  return items;
}
function activate(items, index, direction = 0, {enter = 10, container = null} = {}){
  const next = items[index];
  for(const item of items) for(const animation of item.getAnimations()) if(!animation.transitionProperty) animation.cancel();
  if(container) container.style.setProperty('--out', `${-direction*8}px`);
  if(!direction || calm()){
    for(const item of items){ item.style.transition = 'none'; item.classList.toggle('is-active', item === next); }
    void next.offsetWidth;
    for(const item of items) item.style.transition = '';
    return;
  }
  if(next.classList.contains('is-active')) return;
  if(parseFloat(getComputedStyle(next).opacity) < .05){
    next.style.transition = 'none'; next.style.translate = `${direction*enter}px 0`;
    void next.offsetWidth;
    next.style.transition = ''; next.style.translate = '';
  }
  for(const item of items) item.classList.toggle('is-active', item === next);
}
function onSwipe(element, handler){
  let start = null;
  element.addEventListener('touchstart', event => { const t = event.changedTouches[0]; start = [t.clientX, t.clientY]; }, {passive:true});
  element.addEventListener('touchend', event => {
    const t = event.changedTouches[0], dx = start ? t.clientX - start[0] : 0, dy = start ? t.clientY - start[1] : 0;
    start = null;
    if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)*1.5) handler(dx < 0 ? 1 : -1);
  }, {passive:true});
}
/* ---------- Dialogs ---------- */
const menu = $('#menu-dialog'), viewer = $('#viewer');
const header = $('.header'), hero = $('.hero');
let heroVisible = true, contactVisible = false;
const mobileBar = $('.mobile-cta');
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
  if(!dialog.open) dialog._opener = document.activeElement;
  for(const current of $$('dialog[open]')) if(current !== dialog){ current._closing = null; current.close(); }
  dialog._openedAt = performance.now();
  if(!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open'); updateBar();
}
function closeDialog(dialog){
  if(!dialog.open) return Promise.resolve();
  if(dialog._closing) return dialog._closing;
  if(calm()){ dialog.close(); return Promise.resolve(); }
  dialog.classList.add('is-closing');
  const exit = track(dialog.animate([{opacity:1}, {opacity:0}], {duration:200, easing:EASE_EXIT, fill:'forwards'}));
  const closing = dialog._closing = exit.finished.catch(() => {}).then(() => {
    if(dialog._closing !== closing) return;
    dialog._closing = null;
    if(dialog.open) dialog.close();
    exit.cancel();
  });
  return closing;
}
function afterClose(dialog){
  dialog.classList.remove('is-closing');
  if(!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
  updateBar();
  // Focus goes back to whatever opened the dialog (the photo, a thumbnail, the menu button).
  const opener = dialog._opener; dialog._opener = null;
  if(opener && opener.isConnected && opener !== document.body) opener.focus({preventScroll:true});
}
for(const dialog of $$('dialog')){
  dialog.querySelector('.close').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('close', () => afterClose(dialog));
  // Backdrop closes only when the press started and ended there, and not right after opening.
  const onBackdrop = event => {
    if(event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = onBackdrop(event); });
  dialog.addEventListener('click', event => {
    const pressed = pressedBackdrop; pressedBackdrop = false;
    if(pressed && onBackdrop(event) && performance.now() - (dialog._openedAt || 0) > 350) closeDialog(dialog);
  });
}
$('.menu-button').addEventListener('click', () => {
  openDialog(menu);
  stagger($$('.menu-dialog nav a, .menu-dialog .cta, .menu-dialog .cta-note'), 80, 50, 16);
});
/* ---------- Featured work + thumbnails ---------- */
const stageButton = $('#open-featured');
const featuredLayers = buildLayers($('img', stageButton));
const workCaption = $('#work-caption'), workCounter = $('#work-counter');
const captionItems = buildStack(workCaption, (item, work) => {
  $('.caption', item).textContent = work.category;
  $('h3', item).textContent = work.title;
  $('.work-desc', item).textContent = work.description;
});
const counterItems = buildStack(workCounter, (item, work, index) => { item.textContent = counter(index); });
let featuredIndex = 0;
function showFeatured(index, direction = 0){
  featuredIndex = wrap(index); const work = works[featuredIndex];
  activate(featuredLayers, featuredIndex, direction, {enter:14});
  activate(captionItems, featuredIndex, direction, {container:workCaption});
  activate(counterItems, featuredIndex, direction, {enter:6, container:workCounter});
  for(const [i, thumb] of thumbs.entries()){ if(i === featuredIndex) thumb.setAttribute('aria-current', 'true'); else thumb.removeAttribute('aria-current'); }
  stageButton.setAttribute('aria-label', `Zobraziť detail: ${work.title}`);
  if(direction) $('#work-status').textContent = `${counter(featuredIndex)} — ${work.title}`;
}
$('#previous-work').addEventListener('click', () => showFeatured(featuredIndex - 1, -1));
$('#next-work').addEventListener('click', () => showFeatured(featuredIndex + 1, 1));
$('#prace').addEventListener('keydown', event => {
  if(!plainKey(event) || event.target.closest('#work-list')) return;
  if(event.key === 'ArrowRight'){ event.preventDefault(); showFeatured(featuredIndex + 1, 1); }
  if(event.key === 'ArrowLeft'){ event.preventDefault(); showFeatured(featuredIndex - 1, -1); }
});
onSwipe(stageButton, direction => showFeatured(featuredIndex + direction, direction));
// A thumbnail shows that work in the large view (without JS the link opens the photo itself).
thumbs.forEach((thumb, index) => thumb.addEventListener('click', event => {
  if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if(index !== featuredIndex) showFeatured(index, index > featuredIndex ? 1 : -1);
  const r = stageButton.getBoundingClientRect();
  if(r.top < 0 || r.bottom > window.innerHeight) stageButton.scrollIntoView({block:'nearest', behavior:calm() ? 'auto' : 'smooth'});
}));
// The opener is passed explicitly: Safari does not focus a button on click, so
// document.activeElement alone would not know where to return focus.
stageButton.addEventListener('click', () => openViewer(featuredIndex, stageButton));
$('#work-detail').addEventListener('click', event => openViewer(featuredIndex, event.currentTarget));
/* ---------- Detail view with zoom ---------- */
const stage = $('#viewer-stage'), viewImage = $('#viewer-img'), zoomButton = $('#viewer-zoom'), info = $('#viewer-info');
let viewerIndex = 0;
const zoom = (() => {
  let s = 1, tx = 0, ty = 0;
  // The photo's drawn rectangle inside the stage (object-fit: contain).
  function drawn(){
    const W = stage.clientWidth, H = stage.clientHeight;
    const nw = viewImage.naturalWidth || W, nh = viewImage.naturalHeight || H;
    const k = Math.min(W/nw, H/nh), dw = nw*k, dh = nh*k;
    return {W, H, dw, dh, ox:(W - dw)/2, oy:(H - dh)/2};
  }
  // Keep the enlarged photo covering the stage; a side smaller than the stage stays centred.
  function clamp(){
    const d = drawn();
    if(s*d.dw <= d.W) tx = (d.W - s*d.dw)/2 - s*d.ox; else tx = Math.min(-s*d.ox, Math.max(d.W - s*(d.ox + d.dw), tx));
    if(s*d.dh <= d.H) ty = (d.H - s*d.dh)/2 - s*d.oy; else ty = Math.min(-s*d.oy, Math.max(d.H - s*(d.oy + d.dh), ty));
  }
  function apply(){
    const zoomed = s > 1.001;
    viewImage.style.transform = zoomed ? `translate(${tx}px, ${ty}px) scale(${s})` : '';
    stage.classList.toggle('is-zoomed', zoomed);
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.setAttribute('aria-label', zoomed ? 'Oddialiť' : 'Priblížiť');
  }
  // Up to 1.5× the photo's own resolution, never less than 2.5× and never more than 5×.
  const maxScale = () => Math.min(5, Math.max(2.5, (viewImage.naturalWidth || 1) / (drawn().dw || 1) * 1.5));
  function to(scale, cx, cy){
    const next = Math.min(maxScale(), Math.max(1, scale));
    const px = (cx - tx)/s, py = (cy - ty)/s; // the photo point under (cx, cy) stays put
    s = next; tx = cx - s*px; ty = cy - s*py;
    if(s <= 1.001){ s = 1; tx = 0; ty = 0; } else clamp();
    apply();
  }
  const centre = () => [stage.clientWidth/2, stage.clientHeight/2];
  return {get scale(){ return s; }, to, centre,
    panBy(dx, dy){ if(s <= 1) return; tx += dx; ty += dy; clamp(); apply(); },
    toggle(cx, cy){ if(cx === undefined) [cx, cy] = centre(); to(s > 1.001 ? 1 : 2.5, cx, cy); },
    reset(){ s = 1; tx = 0; ty = 0; apply(); },
    refit(){ if(s > 1){ clamp(); apply(); } }};
})();

function showViewer(index, direction = 0){
  viewerIndex = wrap(index); const work = works[viewerIndex];
  stage.classList.add('is-gesturing'); zoom.reset();
  viewImage.src = work.full; viewImage.alt = work.alt; // the original, so zoom shows real detail
  requestAnimationFrame(() => stage.classList.remove('is-gesturing'));
  if(direction && !calm()) track(viewImage.animate([{opacity:0, translate:`${direction*24}px 0`}, {opacity:1, translate:'0 0'}], {duration:380, easing:EASE_OUT}));
  $('#viewer-count').textContent = counter(viewerIndex);
  $('#viewer-category').textContent = work.category;
  $('#viewer-title').textContent = work.title;
  $('#viewer-description').textContent = work.description;
  $('#viewer-cta').href = similarMessage(work);
  info.classList.remove('is-expanded'); $('#viewer-toggle').setAttribute('aria-expanded', 'false');
  if(direction) $('#viewer-status').textContent = `${counter(viewerIndex)} — ${work.title}`;
}
function openViewer(index, opener){
  showViewer(index);
  openDialog(viewer);
  if(opener) viewer._opener = opener;
  zoomButton.focus({preventScroll:true});
}
viewer.addEventListener('close', () => { if(viewerIndex !== featuredIndex) showFeatured(viewerIndex); zoom.reset(); });
viewImage.addEventListener('load', () => zoom.reset());
window.addEventListener('resize', () => zoom.refit());
$('#viewer-prev').addEventListener('click', () => showViewer(viewerIndex - 1, -1));
$('#viewer-next').addEventListener('click', () => showViewer(viewerIndex + 1, 1));
zoomButton.addEventListener('click', () => zoom.toggle());
$('#viewer-toggle').addEventListener('click', event => {
  const open = info.classList.toggle('is-expanded');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});
viewer.addEventListener('keydown', event => {
  if(event.altKey || event.metaKey || event.ctrlKey) return;
  const zoomed = zoom.scale > 1, [cx, cy] = zoom.centre(), step = 80;
  switch(event.key){
    case '+': case '=': zoom.to(zoom.scale*1.5, cx, cy); break;
    case '-': case '_': zoom.to(zoom.scale/1.5, cx, cy); break;
    case '0': zoom.reset(); break;
    case 'ArrowLeft': if(zoomed) zoom.panBy(step, 0); else showViewer(viewerIndex - 1, -1); break;
    case 'ArrowRight': if(zoomed) zoom.panBy(-step, 0); else showViewer(viewerIndex + 1, 1); break;
    case 'ArrowUp': if(!zoomed) return; zoom.panBy(0, step); break;
    case 'ArrowDown': if(!zoomed) return; zoom.panBy(0, -step); break;
    default: return;
  }
  event.preventDefault();
});
// Pointer gestures: mouse click toggles zoom; touch double-tap toggles it; pinch zooms;
// drag moves the enlarged photo; a horizontal swipe on the unzoomed photo switches works.
const pointers = new Map();
let gesture = null, lastTap = null;
const local = (x, y) => { const r = stage.getBoundingClientRect(); return [x - r.left, y - r.top]; };
stage.addEventListener('pointerdown', event => {
  if(event.target.closest('button')) return;
  try{ stage.setPointerCapture(event.pointerId); }catch{} // capture is a nicety, never a blocker
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  stage.classList.add('is-gesturing');
  if(pointers.size === 1){
    gesture = {type:'pan', start:[event.clientX, event.clientY], last:[event.clientX, event.clientY], moved:0, kind:event.pointerType};
  }else if(pointers.size === 2){
    const [a, b] = [...pointers.values()];
    gesture = {type:'pinch', dist:Math.hypot(a[0] - b[0], a[1] - b[1]), scale:zoom.scale, mid:local((a[0] + b[0])/2, (a[1] + b[1])/2)};
  }
});
stage.addEventListener('pointermove', event => {
  if(!gesture || !pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if(gesture.type === 'pinch' && pointers.size > 1){
    const [a, b] = [...pointers.values()], mid = local((a[0] + b[0])/2, (a[1] + b[1])/2);
    zoom.to(gesture.scale * Math.hypot(a[0] - b[0], a[1] - b[1]) / gesture.dist, mid[0], mid[1]);
    zoom.panBy(mid[0] - gesture.mid[0], mid[1] - gesture.mid[1]);
    gesture.mid = mid;
  }else if(gesture.type === 'pan'){
    const dx = event.clientX - gesture.last[0], dy = event.clientY - gesture.last[1];
    gesture.last = [event.clientX, event.clientY]; gesture.moved += Math.abs(dx) + Math.abs(dy);
    if(zoom.scale > 1){ zoom.panBy(dx, dy); if(gesture.moved > 4) stage.classList.add('is-dragging'); }
  }
});
function endPointer(event){
  if(!pointers.delete(event.pointerId) || !gesture) return;
  if(gesture.type === 'pinch'){
    // One finger left: carry on as a drag, but it can no longer count as a tap.
    if(pointers.size === 1){ const [p] = pointers.values(); gesture = {type:'pan', start:p, last:p, moved:99, kind:'touch'}; }
  }else if(!pointers.size){
    const [x, y] = local(event.clientX, event.clientY);
    const dx = event.clientX - gesture.start[0], dy = event.clientY - gesture.start[1];
    if(event.type === 'pointerup' && gesture.moved < 10){
      if(gesture.kind === 'mouse') zoom.toggle(x, y);
      else if(lastTap && performance.now() - lastTap.time < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40){ zoom.toggle(x, y); lastTap = null; }
      else lastTap = {time:performance.now(), x, y};
    }else if(zoom.scale <= 1 && gesture.kind !== 'mouse' && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)*1.5){
      showViewer(viewerIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
  }
  if(!pointers.size){ gesture = null; stage.classList.remove('is-gesturing', 'is-dragging'); }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
let wheelEnd = 0;
stage.addEventListener('wheel', event => {
  event.preventDefault();
  const [x, y] = local(event.clientX, event.clientY);
  stage.classList.add('is-gesturing');
  zoom.to(zoom.scale * Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .002)), x, y);
  clearTimeout(wheelEnd); wheelEnd = setTimeout(() => stage.classList.remove('is-gesturing'), 160);
}, {passive:false});
/* ---------- FAQ: answers open and close with their height ---------- */
for(const details of $$('.questions details')){
  const summary = $('summary', details);
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
      track($('p', details).animate([{opacity:0, transform:'translateY(-6px)'}, {opacity:1, transform:'none'}], {duration:520, delay:60, easing:EASE_OUT, fill:'backwards'}));
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
const zones = ['#prace', '#o-mne', '#otazky', '#kontakt'].map(hash => [hash, $(hash)]);
// Layout is measured once (and on resize), never inside the scroll handler.
const layout = {zoneTops:[], docHeight:0, viewport:0, headerHeight:80};
function measure(){
  layout.zoneTops = zones.map(([, element]) => element.getBoundingClientRect().top + window.scrollY);
  layout.docHeight = root.scrollHeight;
  layout.viewport = window.innerHeight;
  layout.headerHeight = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 80;
}
let lastY = window.scrollY, travel = 0, travelDirection = 0, headerLock = null, activeHash = null;
function updateHeader(){
  const y = Math.max(0, window.scrollY), dy = y - lastY; lastY = y;
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
const byHash = hash => { try{ return document.getElementById(decodeURIComponent(hash.slice(1))); }catch{ return null; } };
function goTo(hash, {focus = false} = {}){
  const target = byHash(hash);
  if(!target) return;
  stopScroll();
  const top = target === hero ? 0 : target.getBoundingClientRect().top + window.scrollY;
  const goingDown = top > window.scrollY + 1;
  // Reading down: the header steps aside and the section lands flush. Going back up: it stays.
  headerLock = top < 1 ? 'top' : (goingDown || target.dataset.land === 'flush') ? 'hidden' : 'shown';
  const offset = headerLock === 'shown' ? layout.headerHeight : 0;
  const y = Math.round(Math.max(0, Math.min(root.scrollHeight - window.innerHeight, top - offset)));
  try{ history.replaceState(null, '', hash); }catch{}
  updateHeader();
  scrollToY(y, () => {
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
  if(menu.contains(link)){ menu._opener = null; closeDialog(menu).then(() => goTo(hash, options)); }
  else goTo(hash, options);
});
/* ---------- Visibility-driven bits ---------- */
if('IntersectionObserver' in window){
  new IntersectionObserver(entries => { heroVisible = entries.at(-1).isIntersecting; updateBar(); }, {threshold:0}).observe(hero);
  new IntersectionObserver(entries => { contactVisible = entries.at(-1).isIntersecting; updateBar(); }, {threshold:0.1}).observe($('.contact'));
}
})();

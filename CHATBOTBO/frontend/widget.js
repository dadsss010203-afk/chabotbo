/* ═══════════════════════════════════════════════════════════════
   WIDGET JS - Correos de Bolivia Chat Bubble
   ═══════════════════════════════════════════════════════════════ */

// ─── CONFIGURACIÓN ─────────────────────────────────
// Base URL de la API; el widget añade los endpoints concretos automáticamente.
// Si tu servidor no sirve en la raíz, cámbialo a algo como
//   const API_URL = 'https://miservidor.com/miapp/api';
// Mantener "/api" hace que el widget funcione con el backend incluido aquí.
let API_URL = '/api';

// ─── AUTO-INICIALIZACIÓN EN MODO WIDGET ───────────────────
// Cuando se inserta el script en una página externa (pruebaapi.html),
// esperamos atributos `data-` en la etiqueta <script> e inyectamos el
// HTML/CSS necesario. Esto permite usar el asistente sin copiar manualmente
// el markup.
(function(){
  // localizar la etiqueta <script> que nos cargó; si currentScript es null,
  // buscamos manualmente por el atributo src.
  let s = document.currentScript;
  if (!s) {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; --i) {
      const src = scripts[i].src || '';
      if (src.endsWith('/widget.js') || src.endsWith('/widget.js/')) {
        s = scripts[i];
        break;
      }
    }
  }
  if (!s) {
    // no se encontró el script; no continuamos
    return;
  }

  // configuración mediante atributos data-*
  if (s.dataset.api) API_URL = s.dataset.api.replace(/\/+$/, '');
  if (s.dataset.lang) lang = s.dataset.lang;

  // cargar CSS
  const href = s.src.replace(/\/widget\.js$/, '/widget.css');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);

  // cargar HTML del widget
  const htmlUrl = s.src.replace(/\/widget\.js$/, '/widget.html');
  fetch(htmlUrl)
    .then(res => res.text())
    .then(html => {
      document.body.insertAdjacentHTML('beforeend', html);
      if (lang) setLang(lang);
      if (s.dataset.pos && s.dataset.pos === 'left') {
        const bubble = document.getElementById('chat-bubble');
        const win = document.getElementById('chat-window');
        if (bubble) {
          bubble.style.left = bubble.style.right;
          bubble.style.right = '';
        }
        if (win) {
          win.style.left = win.style.right;
          win.style.right = '';
        }
      }
    })
    .catch(e => console.warn('No se pudo cargar widget.html:', e));
})();


// ─── ESTADO ────────────────────────────────────────
let chatOpen = false;
let busy = false;
let translating = false;
let lang = 'es';
let ctrl = null;
let mapInst = null;

// ─── TEXTOS POR IDIOMA ─────────────────────────────
const TX = {
  es: {
    ph: 'Escriba su consulta aquí…',
    lbl: 'Analizando consulta…',
    bye: 'Conversación finalizada',
    translating: 'Traduciendo conversación…',
    welcome: 'Consulte sobre envíos, tarifas, rastreo de paquetes, sucursales y servicios postales de la AGBC.',
    chips: ['Rastrear envío', 'Tarifas de envío', 'Sucursales cercanas', 'Horarios de atención']
  },
  en: {
    ph: 'Type your question here…',
    lbl: 'Processing request…',
    bye: 'Conversation ended',
    translating: 'Translating conversation…',
    welcome: 'Ask about shipping, rates, package tracking, branches and postal services of AGBC.',
    chips: ['Track shipment', 'Shipping rates', 'Nearby branches', 'Business hours']
  },
  fr: {
    ph: 'Saisissez votre question…',
    lbl: 'Traitement en cours…',
    bye: 'Conversation terminée',
    translating: 'Traduction en cours…',
    welcome: 'Renseignez-vous sur les envois, tarifs, suivi de colis, succursales et services postaux de l\'AGBC.',
    chips: ['Suivre colis', 'Tarifs d\'envoi', 'Succursales proches', 'Heures d\'ouverture']
  },
  pt: {
    ph: 'Digite sua consulta aqui…',
    lbl: 'Processando sua consulta…',
    bye: 'Conversa encerrada',
    translating: 'Traduzindo conversa…',
    welcome: 'Consulte sobre envios, tarifas, rastreamento de pacotes, agências e serviços postais da AGBC.',
    chips: ['Rastrear envio', 'Tarifas de envio', 'Agências próximas', 'Horários de atendimento']
  },
  zh: {
    ph: '请在此输入您的问题…',
    lbl: '正在处理您的请求…',
    bye: '对话已结束',
    translating: '正在翻译对话…',
    welcome: '咨询AGBC的邮件、费率、包裹追踪、分支机构及邮政服务。',
    chips: ['追踪包裹', '邮寄费率', '附近网点', '营业时间']
  },
  ru: {
    ph: 'Введите ваш вопрос…',
    lbl: 'Обработка запроса…',
    bye: 'Разговор завершён',
    translating: 'Перевод разговора…',
    welcome: 'Спрашивайте о доставке, тарифах, отслеживании посылок, отделениях и почтовых услугах AGBC.',
    chips: ['Отследить посылку', 'Тарифы доставки', 'Ближайшие отделения', 'Часы работы']
  }
};

// ─── UI HELPERS ────────────────────────────────────
function setStop(v) {
  document.getElementById('stop').classList.toggle('vis', v);
  document.getElementById('send').style.display = v ? 'none' : 'flex';
}

function now() {
  return new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

// ─── TOGGLE CHAT ───────────────────────────────────
function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-window').classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('badge').style.display = 'none';
    setTimeout(() => document.getElementById('input').focus(), 420);
  }
}

function minimize() {
  document.getElementById('chat-window').classList.remove('open');
  chatOpen = false;
}

// ─── IDIOMA ─────────────────────────────────────────
async function setLang(l) {
  if (translating || busy || l === lang) return;
  lang = l;
  
  // Actualizar pills
  document.querySelectorAll('.lpill').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
  
  const t = TX[l] || TX.es;
  document.getElementById('input').placeholder = t.ph;
  
  // Actualizar welcome subtitle
  const subEl = document.getElementById('welcome-subtitle');
  if (subEl) subEl.textContent = t.welcome;
  
  // Actualizar chips
  const cc = document.getElementById('chips-container');
  if (cc) {
    cc.innerHTML = t.chips.map(c => `<button class="chip" onclick="suggest(this)">${c}</button>`).join('');
  }
  
  // Traducir conversación
  await translateConversation();
}

// ─── TRADUCIR CONVERSACIÓN ─────────────────────────
async function translateConversation() {
  const bubbles = Array.from(document.querySelectorAll('.msg.b .bub:not(.farewell)'));
  if (bubbles.length === 0) return;
  
  translating = true;
  const t = TX[lang] || TX.es;
  const inp = document.getElementById('input');
  const banner = document.getElementById('translate-banner');
  const pills = document.querySelectorAll('.lpill');
  
  inp.disabled = true;
  pills.forEach(p => p.disabled = true);
  banner.textContent = t.translating;
  banner.classList.add('vis');
  
  bubbles.forEach(b => b.classList.add('translating-anim'));
  
  const originals = bubbles.map(b => b.dataset.original || b.textContent || '');
  originals.forEach((orig, idx) => {
    if (!bubbles[idx].dataset.original) {
      bubbles[idx].dataset.original = orig;
    }
  });
  
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: originals, lang })
    });
    const data = await res.json();
    
    if (Array.isArray(data.translations)) {
      data.translations.forEach((tr, idx) => {
        if (bubbles[idx]) {
          const out = (typeof tr === 'string' && tr.trim() !== '') ? tr : originals[idx];
          bubbles[idx].textContent = out;
        }
      });
    }
  } catch (e) {
    console.warn('Error traduciendo:', e);
  }
  
  setTimeout(() => {
    bubbles.forEach(b => b.classList.remove('translating-anim'));
    banner.classList.remove('vis');
    inp.disabled = false;
    pills.forEach(p => p.disabled = false);
    translating = false;
    if (!busy) inp.focus();
  }, 300);
}

// ─── AVATARES ───────────────────────────────────────
function mkAv(t) {
  const a = document.createElement('div');
  a.className = 'av';
  a.innerHTML = t === 'u'
    ? '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>';
  return a;
}

// ─── AÑADIR MENSAJE ────────────────────────────────
function addMsg(text, type, bye = false) {
  document.getElementById('welcomeCard')?.remove();
  const chat = document.getElementById('chat');
  const wrap = document.createElement('div');
  wrap.className = `msg ${type}`;
  
  const b = document.createElement('div');
  b.className = 'bub' + (bye ? ' farewell' : '');
  b.textContent = text;
  b.dataset.original = text;
  
  const tm = document.createElement('span');
  tm.className = 'msg-time';
  tm.textContent = now();
  
  const body = document.createElement('div');
  body.style.cssText = `display:flex;flex-direction:column;align-items:${type === 'u' ? 'flex-end' : 'flex-start'}`;
  body.appendChild(b);
  body.appendChild(tm);
  
  // Botón de traducción para mensajes del bot
  if (!bye && type === 'b') {
    const acts = document.createElement('div');
    acts.className = 'msg-actions';
    const btn = document.createElement('button');
    btn.className = 'btn-translate';
    btn.innerHTML = '🌐 Traducir';
    btn.onclick = () => translateMsg(b, btn, text);
    acts.appendChild(btn);
    body.appendChild(acts);
  }
  
  wrap.appendChild(mkAv(type));
  wrap.appendChild(body);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}

// ─── TRADUCIR MENSAJE INDIVIDUAL ───────────────────
async function translateMsg(bubble, btn, originalText) {
  btn.classList.add('loading');
  btn.textContent = ' ';
  
  try {
    const res = await fetch(`${API_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [originalText], lang })
    });
    const data = await res.json();
    
    if (Array.isArray(data.translations)) {
      const tr = data.translations[0];
      bubble.textContent = (typeof tr === 'string' && tr.trim() !== '') ? tr : originalText;
      btn.textContent = '↩ Original';
      btn.style.color = 'var(--y700)';
      btn.onclick = () => {
        bubble.textContent = originalText;
        btn.textContent = '🌐 Traducir';
        btn.style.color = '';
        btn.onclick = () => translateMsg(bubble, btn, originalText);
      };
    }
  } catch (e) {
    btn.textContent = '🌐 Traducir';
  }
  
  btn.classList.remove('loading');
}

// ─── TYPING INDICATOR ──────────────────────────────
function showTyping() {
  document.getElementById('welcomeCard')?.remove();
  const chat = document.getElementById('chat');
  const t = TX[lang] || TX.es;
  
  const wrap = document.createElement('div');
  wrap.className = 'msg b typing';
  wrap.id = 'tyEl';
  
  const b = document.createElement('div');
  b.className = 'bub';
  b.innerHTML = `<span class="t-lbl">${t.lbl}</span><div class="dots"><div class="td"></div><div class="td"></div><div class="td"></div></div>`;
  
  wrap.appendChild(mkAv('b'));
  wrap.appendChild(b);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}

function removeTyping() {
  document.getElementById('tyEl')?.remove();
}

// ─── ENVIAR MENSAJE ────────────────────────────────
async function sendMsg(msg) {
  if (busy || translating || !msg.trim()) return;
  
  busy = true;
  const inp = document.getElementById('input');
  inp.disabled = true;
  setStop(true);
  
  addMsg(msg, 'u');
  showTyping();
  
  ctrl = new AbortController();
  
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, lang }),
      signal: ctrl.signal
    });
    
    const data = await res.json();
    removeTyping();
    
    const bye = data.despedida === true;
    addMsg(data.response || data.error || 'Sin respuesta disponible', 'b', bye);
    
    if (bye) {
      inp.disabled = true;
      inp.placeholder = (TX[lang] || TX.es).bye;
      setStop(false);
      document.getElementById('send').disabled = true;
      return;
    }
  } catch (e) {
    removeTyping();
    addMsg(e.name === 'AbortError' ? 'Consulta cancelada.' : 'Error de conexión. Verifique que el servidor esté activo.', 'b');
  }
  
  ctrl = null;
  busy = false;
  setStop(false);
  inp.disabled = false;
  inp.focus();
}

function suggest(btn) {
  sendMsg(btn.textContent);
}

function stopResp() {
  if (ctrl) {
    ctrl.abort();
    ctrl = null;
  }
}

// ─── LIMPIAR CONVERSACIÓN ──────────────────────────
function clearConv() {
  document.getElementById('confirm-bar').classList.add('open');
}

function closeConf() {
  document.getElementById('confirm-bar').classList.remove('open');
}

async function doClear() {
  closeConf();
  
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
  } catch (e) {}
  
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  
  const t = TX[lang] || TX.es;
  const wc = document.createElement('div');
  wc.className = 'welcome';
  wc.id = 'welcomeCard';
  wc.innerHTML = `
    <div class="wc-icon"><svg viewBox="0 0 24 24"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></div>
    <div class="wc-title">Bienvenido</div>
    <div class="wc-sub">${t.welcome}</div>
    <div class="wc-sep"><div class="wc-sep-l"></div><div class="wc-sep-d"></div><div class="wc-sep-l"></div></div>
    <div class="chips" id="chips-container">
      ${t.chips.map(c => `<button class="chip" onclick="suggest(this)">${c}</button>`).join('')}
    </div>`;
  chat.appendChild(wc);
  
  const inp = document.getElementById('input');
  inp.disabled = false;
  inp.placeholder = t.ph;
  document.getElementById('send').disabled = false;
  
  busy = false;
  setStop(false);
}

// ─── FORM SUBMIT ───────────────────────────────────
document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  const inp = document.getElementById('input');
  const t = inp.value.trim();
  if (!t) return;
  inp.value = '';
  sendMsg(t);
});

// ─── MAPA ──────────────────────────────────────────
async function openMap() {
  document.getElementById('mapa-modal').classList.add('open');
  
  if (mapInst) {
    setTimeout(() => mapInst.invalidateSize(), 100);
    return;
  }
  
  let branches = [];
  try {
    const res = await fetch(`${API_URL}/sucursales`);
    branches = (await res.json()).sucursales || [];
  } catch (e) {}
  
  const center = branches.find(s => s.lat) || { lat: -16.5, lng: -68.15 };
  mapInst = L.map('mapa').setView([center.lat, center.lng], 6);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mapInst);
  
  const ico = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#F5A623;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(122,79,0,0.5);border:2px solid rgba(255,255,255,0.5)"><span style="transform:rotate(45deg);font-size:13px;line-height:1;color:#0B1F4E">✉</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -36]
  });
  
  const list = document.getElementById('suc-list');
  list.innerHTML = '';
  
  branches.forEach(s => {
    if (!s.lat || !s.lng) return;
    
    const m = L.marker([s.lat, s.lng], { icon: ico }).addTo(mapInst)
      .bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.5;color:#1A0E00"><strong>${s.nombre}</strong><br>📍 ${s.direccion || ''}<br>🕐 ${s.horario || ''}</div>`);
    
    const item = document.createElement('div');
    item.className = 'suc-item';
    item.innerHTML = `<div class="suc-ico"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div><div class="suc-nfo"><h4>${s.nombre}</h4><p>${s.direccion || 'No disponible'}<br>${s.horario || 'No disponible'}</p></div>`;
    
    item.onclick = () => {
      mapInst.setView([s.lat, s.lng], 16);
      m.openPopup();
    };
    
    list.appendChild(item);
  });
  
  setTimeout(() => mapInst.invalidateSize(), 100);
}

function closeMap() {
  document.getElementById('mapa-modal').classList.remove('open');
}

// Cerrar modal al hacer clic fuera
document.getElementById('mapa-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeMap();
});

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMap();
    if (chatOpen) minimize();
  }
});

// ─── INICIALIZACIÓN ────────────────────────────────
console.log('🇧🇴 Chat Bubble Widget - Correos de Bolivia cargado');

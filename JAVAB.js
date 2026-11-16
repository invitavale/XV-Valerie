// Variables globales
let isPlaying = false;
let currentSlide = 0;
let totalSlides = 0;

// ---------- Música de fondo (archivo propio: musica.mp3) ----------
// Plan A: elemento <audio>. Plan B (si el navegador o el visor lo bloquea):
// Web Audio API decodificando el archivo directamente. Ambos se arrancan dentro
// del mismo toque del botón, que es lo que exigen iPhone y Android.
const MUSIC_FILE = 'musica.mp3';
let musicMode = null;          // 'element' | 'webaudio'
let audioCtx = null, webSource = null, webBuffer = null, webGain = null;
let webStartedAt = 0, webOffset = 0, webPlaying = false;
let fallbackTimer = null;

function getAudio() { return document.getElementById('bgMusic'); }

function b64ToBytes(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function prepareAudioElement() {
    const a = getAudio();
    if (!a) return;
    if (window.__MUSIC_B64 && !a.src) {
        try {
            const blob = new Blob([b64ToBytes(window.__MUSIC_B64)], { type: 'audio/mpeg' });
            a.src = URL.createObjectURL(blob);
        } catch (e) {}
    } else if (!a.getAttribute('src')) {
        a.src = MUSIC_FILE;
    }
}
function getMusicBytes() {
    if (window.__MUSIC_B64) return Promise.resolve(b64ToBytes(window.__MUSIC_B64).buffer);
    return fetch(MUSIC_FILE).then(r => r.arrayBuffer());
}

function startWebAudio() {
    // Se crea/reanuda el contexto dentro del toque (desbloquea el audio);
    // la decodificación puede terminar después sin problema.
    try {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = new AC();
            webGain = audioCtx.createGain();
            webGain.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        // sonido silencioso inmediato para "despertar" el audio en iOS
        const s = audioCtx.createBufferSource();
        s.buffer = audioCtx.createBuffer(1, 1, 22050);
        s.connect(audioCtx.destination); s.start(0);
    } catch (e) { return; }
    const go = () => {
        if (musicMode === 'element') return;
        musicMode = 'webaudio';
        playWebAudio();
    };
    if (webBuffer) { go(); return; }
    getMusicBytes()
        .then(buf => new Promise((res, rej) => audioCtx.decodeAudioData(buf, res, rej)))
        .then(b => { webBuffer = b; go(); })
        .catch(() => {});
}
function playWebAudio() {
    if (!audioCtx || !webBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    webSource = audioCtx.createBufferSource();
    webSource.buffer = webBuffer;
    webSource.loop = true;
    webSource.connect(webGain);
    webSource.start(0, webOffset % webBuffer.duration);
    webStartedAt = audioCtx.currentTime - webOffset;
    webPlaying = true; isPlaying = true; updateMusicIcon();
}
function pauseWebAudio() {
    if (!webSource) return;
    webOffset = audioCtx.currentTime - webStartedAt;
    try { webSource.stop(); } catch (e) {}
    webSource = null; webPlaying = false; isPlaying = false; updateMusicIcon();
}

function startMusic() {
    const audio = getAudio();
    const musicPlayer = document.getElementById('musicPlayer');
    if (musicPlayer) musicPlayer.style.display = 'block';

    // Plan B se prepara en el mismo toque, por si el Plan A falla
    startWebAudio();

    if (!audio) return;
    audio.muted = false;
    audio.volume = 1;
    let p;
    try { p = audio.play(); } catch (e) { p = Promise.reject(e); }
    const failA = () => { if (musicMode !== 'webaudio') { musicMode = null; } };
    if (p && typeof p.then === 'function') {
        p.then(() => {
            // Plan A sonando: apagar el Plan B si llegó a arrancar
            musicMode = 'element';
            if (webPlaying) { pauseWebAudio(); webOffset = 0; }
            isPlaying = true; updateMusicIcon();
        }).catch(failA);
    }
    // si en 2.5 s el <audio> no avanza, nos quedamos con Web Audio
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
        if (musicMode === 'element' && (audio.paused || audio.currentTime < 0.2)) {
            try { audio.pause(); } catch (e) {}
            musicMode = 'webaudio';
            if (webBuffer && !webPlaying) playWebAudio();
        }
    }, 2500);
}

function closeWelcome() {
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

// ---------- Sobre de inicio ----------
// El primer toque abre el sobre y, en ese mismo toque, arranca la música
// (así lo permiten iPhone y Android). Sale la carta con la foto y se abre
// la invitación con un destello.
let introStarted = false, introDone = false;

function startIntro() {
    if (introStarted) return;
    introStarted = true;
    const modal = document.getElementById('welcomeModal');
    startMusic();
    if (!modal) return;
    modal.classList.add('is-open');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(finishIntro, reduce ? 300 : 2600);
}
function finishIntro() {
    if (introDone) return;
    introDone = true;
    if (!introStarted) { introStarted = true; startMusic(); }
    const modal = document.getElementById('welcomeModal');
    if (!modal) return;
    modal.classList.add('is-leaving');
    setTimeout(closeWelcome, 1300);
}
// nombres anteriores, por compatibilidad
function enterWithMusicClick() { startIntro(); }
function enterInvitation() { startIntro(); }

function toggleMusic() {
    const audio = getAudio();
    if (musicMode === 'webaudio') {
        if (webPlaying) pauseWebAudio(); else playWebAudio();
        return;
    }
    if (musicMode === 'element' && audio) {
        if (audio.paused) audio.play().catch(() => {}); else audio.pause();
        return;
    }
    // aún no ha sonado nada (entró sin música): arrancar ahora
    startMusic();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    initializeCountdown();
    initializeCarousel();

    const modal = document.getElementById('welcomeModal');
    if (modal) modal.style.display = 'flex';

    const toggle = document.getElementById('musicToggle');
    if (toggle) toggle.addEventListener('click', toggleMusic);

    prepareAudioElement();
    if (modal) modal.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startIntro(); } });
    const audio = getAudio();
    if (audio) {
        audio.addEventListener('playing', () => { if (musicMode !== 'webaudio') { musicMode = 'element'; isPlaying = true; updateMusicIcon(); } });
        audio.addEventListener('pause', () => { if (musicMode === 'element') { isPlaying = false; updateMusicIcon(); } });
        audio.addEventListener('error', () => {
            if (musicMode !== 'webaudio') { musicMode = 'webaudio'; if (webBuffer && !webPlaying) playWebAudio(); }
        });
    }
    // Si el usuario cambia de pestaña o bloquea el teléfono, pausar; al volver, continuar
    let resumeOnReturn = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeOnReturn = isPlaying;
            if (musicMode === 'webaudio') pauseWebAudio(); else { const a = getAudio(); if (a) a.pause(); }
        } else if (resumeOnReturn) {
            if (musicMode === 'webaudio') playWebAudio(); else { const a = getAudio(); if (a) a.play().catch(() => {}); }
        }
    });
});

function updateMusicIcon() {
    const volumeIcon = document.getElementById('volumeIcon');
    
    if (volumeIcon) {
        if (isPlaying) {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#fff" stroke="#fff" stroke-width="1"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" stroke="#fff" stroke-width="2"></path>
                <circle cx="6.5" cy="12" r="1" fill="#BFD7F2"/>
            `;
        } else {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#fff" stroke="#fff" stroke-width="1"></polygon>
                <line x1="19" y1="9" x2="17" y2="11" stroke="#ff6b6b" stroke-width="2"></line>
                <line x1="17" y1="9" x2="19" y2="11" stroke="#ff6b6b" stroke-width="2"></line>
                <circle cx="6.5" cy="12" r="1" fill="#ff6b6b"/>
            `;
        }
    }
}

// Countdown
function initializeCountdown() {
    const targetDate = new Date('2027-01-24T18:00:00-04:00').getTime();
    
    function updateCountdown() {
        const now = new Date().getTime();
        const difference = targetDate - now;
        
        if (difference > 0) {
            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days.toString().padStart(2, '0');
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        } else {
            document.getElementById('days').textContent = '00';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Carrusel
function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');

    if (!track) return;

    // calcular total dinámicamente
    const items = track.querySelectorAll('.carousel-item');
    totalSlides = items.length;
    const totalSlidesElement = document.getElementById('totalSlides');
    if (totalSlidesElement) totalSlidesElement.textContent = totalSlides;

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentSlide = (currentSlide + 1) % totalSlides;
            updateCarousel();
        });
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
            updateCarousel();
        });
    }

    // Ajuste inicial para asegurar cálculo correcto tras el render
    updateCarousel();
    requestAnimationFrame(updateCarousel);
    setTimeout(updateCarousel, 200);

    // Auto-play del carrusel
    setInterval(() => {
        nextSlide();
    }, 2500);
}

function updateCarousel() {
    const track = document.getElementById('carouselTrack');
    if (track) {
        const items = track.querySelectorAll('.carousel-item');
        if (!items.length) return;
        const container = track.parentElement;

        // Temporarily reset transform to measure actual positions
        const previousTransform = track.style.transform;
        track.style.transform = 'none';

        const firstRect = items[0].getBoundingClientRect();
        const secondRect = items[1] ? items[1].getBoundingClientRect() : null;
        const stepWidth = Math.max(1, secondRect ? Math.round(secondRect.left - firstRect.left) : Math.round(firstRect.width));

        const containerWidth = Math.round(container.getBoundingClientRect().width);
        const visibleCount = Math.max(1, Math.floor((containerWidth + 1) / stepWidth));
        const maxIndex = Math.max(0, totalSlides - visibleCount);

        // Detecta si hay que dar la vuelta (de la última foto a la 1, o viceversa)
        let wrapped = false;
        if (currentSlide > maxIndex) { currentSlide = 0; wrapped = true; }
        if (currentSlide < 0) { currentSlide = maxIndex; wrapped = true; }

        const trackRect = track.getBoundingClientRect();
        const baseLeft = Math.round(firstRect.left - trackRect.left);
        const translateXpx = -Math.round(baseLeft + (currentSlide * stepWidth));

        if (wrapped) {
            // Al dar la vuelta, salta directo a la foto 1 sin animar el regreso
            // (evita el efecto de "devolverse" deslizando hacia atrás por todas las fotos)
            const prevTransition = track.style.transition;
            track.style.transition = 'none';
            track.style.transform = `translateX(${translateXpx}px)`;
            void track.offsetWidth; // fuerza reflow para aplicar el salto sin animación
            track.style.transition = prevTransition || '';
        } else {
            // Apply transform
            track.style.transform = `translateX(${translateXpx}px)`;
        }
        // console.log('Carousel moved to slide:', { currentSlide, visibleCount, maxIndex, translateXpx, stepWidth, baseLeft });
    }
    updateSlideCounter();
    markCenterCarouselItem();
}

function nextSlide() {
    currentSlide++;
    updateCarousel();
}

function previousSlide() {
    currentSlide--;
    updateCarousel();
}

function updateSlideCounter() {
    const currentSlideElement = document.getElementById('currentSlide');
    const totalSlidesElement = document.getElementById('totalSlides');
    if (currentSlideElement) currentSlideElement.textContent = (currentSlide + 1);
    if (totalSlidesElement) totalSlidesElement.textContent = totalSlides;
}

// Mark center carousel item on desktop
function markCenterCarouselItem() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const items = Array.from(track.querySelectorAll('.carousel-item'));
    if (!items.length) return;
    items.forEach(it => it.classList.remove('is-center'));

    const firstItem = items[0];
    const container = track.parentElement;
    const itemWidth = firstItem.getBoundingClientRect().width;
    const containerWidth = container.getBoundingClientRect().width;
    const visibleCount = Math.max(1, Math.floor(containerWidth / itemWidth));

    const centerIndex = (currentSlide + Math.floor(visibleCount / 2)) % items.length;
    items[centerIndex].classList.add('is-center');
}

// Hook into carousel updates
const _origUpdateCarousel = typeof updateCarousel === 'function' ? updateCarousel : null;
if (_origUpdateCarousel) {
    window.updateCarousel = function() {
        _origUpdateCarousel();
        markCenterCarouselItem();
    };
}

window.addEventListener('resize', markCenterCarouselItem);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(markCenterCarouselItem, 200);
});

// Funciones de los botones
function openLocation(location) {
    // Salón de eventos Club de Obras Públicas
    const club = 'https://www.google.com/maps/dir//Club+de+Obras+P%C3%BAblicas/data=!4m6!4m5!1m0!1m2!1m1!1s0x8eaf89bec042da87:0x7da3589d8d23d93b!3e0';
    window.open(club, '_blank');
}

// NOTA: esta es una plantilla de ejemplo. Reemplaza el contenido de estas
// funciones con tu propio enlace (Google Drive, Google Form, lista de
// regalos, etc.) cuando personalices la invitación.

function sharePhotos() {
    window.open('https://photos.app.goo.gl/CD3JMfxcuTyoF6ZR8', '_blank');
}

function showDressCode() {
    const modal = document.getElementById('dresscodeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeDressCodeModal() {
    // El click dentro de la tarjeta del modal usa stopPropagation(), así que
    // esta función solo se dispara al hacer click en el fondo oscuro o en la X.
    const modal = document.getElementById('dresscodeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ---------- Regalos ----------
// CAMBIAR: enlace de la lista de Amazon y dirección de envío
const AMAZON_URL = '';
function openAmazon() {
    if (AMAZON_URL) window.open(AMAZON_URL, '_blank');
    else showToast('Muy pronto', 'La lista de Amazon estará disponible en breve.');
}
function copyAddress() {
    const el = document.getElementById('amazonAddr');
    const txt = el ? el.textContent.trim() : '';
    const done = () => showToast('Dirección copiada', 'Pégala como dirección de envío en Amazon.');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.remove();
}

// ---------- Regalos: botón que despliega las opciones ----------
function toggleGifts() {
    const panel = document.getElementById('giftsPanel'), btn = document.getElementById('giftsToggle');
    if (!panel || !btn) return;
    const open = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.firstChild.textContent = open ? 'Ocultar opciones' : 'Ver opciones de regalo';
}

// ---------- Elegir número de WhatsApp ----------
function openWaChooser() {
    const m = document.getElementById('waModal');
    if (m) m.style.display = 'flex';
}
function closeWaChooser() {
    const m = document.getElementById('waModal');
    if (m) m.style.display = 'none';
}

// ---------- Confirmar por WhatsApp ----------
function confirmWhatsApp(e, phone) {
    if (e) e.preventDefault();
    const msg = '¡Hola! Confirmo mi asistencia a los XV años de Valerie el domingo 24 de enero de 2027. 💙\nNombre: \nCantidad de personas: ';
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
}

// ---------- Canción que no puede faltar ----------
// CAMBIAR: número que recibe las recomendaciones
const SONG_PHONE = '18093532299';
function recommendSong(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('songInput');
    const song = input ? input.value.trim() : '';
    if (!song) { showToast('Escribe una canción', 'Pon el nombre de la canción y el artista.'); if (input) input.focus(); return; }
    const msg = '¡Hola! Para los XV de Valerie, la canción que no puede faltar es: ' + song + ' 🎶';
    window.open('https://wa.me/' + SONG_PHONE + '?text=' + encodeURIComponent(msg), '_blank');
    input.value = '';
}

// ---------- Fotos de pequeña: cinta infinita de derecha a izquierda ----------
document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('vStrip');
    if (!track || track.dataset.ready) return;
    track.dataset.ready = '1';
    Array.from(track.children).forEach(n => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); });
});

// Sistema de Toast
function showToast(title, message) {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toastContent');
    
    toastContent.innerHTML = `
        <h4 style="font-weight: 700; color: #fff; margin-bottom: 0.35rem; letter-spacing: 0.2px;">${title}</h4>
        <p style="color: #ddd;">${message}</p>
    `;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Nota: el efecto de portada ahora se logra 100% con CSS (hero fijo detrás
// del contenido, ver .hero-section y .content en CCSB.css), igual que en
// boda100L. Ya no hace falta mover nada por JS en el scroll.


// Forzar limpieza de caches en clientes antiguos
(function() {
  function clearCaches() {
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(() => {});
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearCaches);
  } else {
    clearCaches();
  }
})();

// ---------- v45: todo va apareciendo mientras se desliza ----------
(function () {
    'use strict';
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // [selector, tipo de efecto, retraso escalonado entre hermanos (s)]
    var groups = [
        ['.content .section-divider', 'rv-zoom', 0],
        ['.content .section-title, .content .section-subtitle, .content .event-title', 'rv-up', 0],
        ['.content .card', 'rv-up', 0],
        ['.party-grid .party-card', 'rv-up', 0.15],
        ['.countdown-item', 'rv-pop', 0.12],
        ['.content .modern-icon, .content .icon-img', 'rv-pop', 0],
        ['.event-details > *, .event-punctuality, .dress-note', 'rv-up', 0.1],
        ['.content .btn-wedding', 'rv-up', 0.08],
        ['.r-card', 'rv-up', 0.12],
        ['.r-tl-item', 'rv-up', 0.12],
        ['.r-crown, .r-sunrow img, .r-sun-sm, .r-medallion, .v-carta-tiara, .v-reloj-sm', 'rv-pop', 0.1],
        ['.v-strip, .v-lugar, .v-wa', 'rv-up', 0.1],
        ['.r-title, .r-name, .r-date, .r-cal, .r-cd-item, .r-btn, .r-photo-band, .r-arch', 'rv-up', 0.08],
        ['.r-flourish, .v-carroza, .v-reloj-sm, .r-cal-kicker, .r-cal-month', 'rv-zoom', 0.06],
        ['.content .r-text, .r-sub-light, .r-note, .v-label, .v-place, .v-time, .r-caps, .v-song-form, .v-rsvp-btns, .r-footer-with, .r-footer-name', 'rv-up', 0.08],
        ['.r-farol, .v-rsvp-tiara', 'rv-left', 0]
    ];

    function init() {
        var seen = new Set(), items = [];
        groups.forEach(function (g) {
            var list = document.querySelectorAll(g[0]), byParent = new Map();
            list.forEach(function (el) {
                if (seen.has(el) || el.closest('.hero-section, #welcomeModal')) return;
                seen.add(el);
                var k = byParent.get(el.parentElement) || 0;
                byParent.set(el.parentElement, k + 1);
                el.classList.add('rv', g[1]);
                if (g[2]) el.style.setProperty('--rd', (k * g[2]).toFixed(2) + 's');
                items.push(el);
            });
        });

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                var el = en.target;
                io.unobserve(el);
                el.classList.add('rv-in');
                // al terminar quita las clases para no chocar con los efectos hover
                var d = parseFloat(getComputedStyle(el).getPropertyValue('--rd')) || 0;
                setTimeout(function () {
                    el.classList.remove('rv', 'rv-in', 'rv-up', 'rv-zoom', 'rv-pop', 'rv-left');
                    el.style.removeProperty('--rd');
                }, (d + 1.3) * 1000);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

        items.forEach(function (el) { io.observe(el); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

// ---------- La carta sube cuando aparece en pantalla ----------
(function () {
    function init() {
        var c = document.getElementById('vCarta');
        if (!c) return;
        if (!('IntersectionObserver' in window)) { c.classList.add('is-in'); return; }
        var io = new IntersectionObserver(function (en) {
            if (en[0].isIntersecting) { c.classList.add('is-in'); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(c);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// ---------- Portada fija: zoom suave y desvanecido al bajar; foto horizontal con movimiento ----------
(function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var hero, band, ticking = false;
    function update() {
        ticking = false;
        var vh = window.innerHeight || 1;
        if (band) {
            var r = band.getBoundingClientRect();
            if (r.bottom > 0 && r.top < vh) {
                var k = (r.top + r.height / 2 - vh / 2) / vh;   // -1..1 aprox.
                band.style.setProperty('--par', (k * -28).toFixed(1) + 'px');
            }
        }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    function init() {
        hero = document.querySelector('.hero-section');
        band = document.querySelector('.v-band');
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        update();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeWaChooser(); closeDressCodeModal(); } });

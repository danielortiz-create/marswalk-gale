// tars.js — TARS en el navegador: respuestas locales (simuladas, sin IA ni conexion) y voz.
//
// TARS es un concepto: un agente de IA que iria en el traje. En esta demo no hay IA:
// cada orden ejecuta una herramienta de main.js y la respuesta se arma con su resultado.

import { t, voiceLang, dec } from './i18n.js';

// Respuesta local: una frase armada con el resultado de la herramienta.
export function localReply(name, r) {
  if (r.error) return r.error;
  if (r.hay_ruta === false) return t('lr.noRoute');
  switch (name) {
    case 'estado_mision': {
      if (r.casco) return t('lr.statusHud', { min: r.casco.tiempo_min, km: r.casco.distancia_recorrida_km, o2: r.casco.o2_restante_pct, next: r.casco.siguiente, m: r.casco.distancia_siguiente_m, back: r.casco.regreso_a_pie_min });
      return t('lr.statusPlan', { verdict: r.veredicto, a: r.paradas_activas, b: r.paradas_totales, km: r.distancia_km, min: r.duracion_min, o2: r.o2_al_llegar_pct });
    }
    case 'fijar_reserva_o2':
      return (r.omitidas.length ? t('lr.skip', { list: r.omitidas.join(', ') }) : t('lr.noSkip')) +
        t('lr.reserve', { pct: r.o2_al_llegar_pct }) + (r.cumple ? t('lr.reserveOk') : t('lr.reserveLow', { min: r.reserva_minima_pct }));
    case 'simular_evento_solar':
    case 'regresar_al_habitat':
      return t('lr.back', { from: r.desde, min: r.regreso_min, o2: r.o2_al_llegar_pct }) + (r.dosis_duplicada ? t('lr.backDouble') : '');
    case 'activar_parada':
      return t('lr.stop', { p: r.parada, estado: r.activa ? t('lr.included') : t('lr.excluded'), a: r.paradas_activas, b: r.paradas_totales, km: r.distancia_km });
    case 'entorno':
      return t('lr.env', { min: r.clima.aire_min_C, max: r.clima.aire_max_C, p: r.clima.presion_Pa, sol: r.clima.sol, r: r.radiacion.mSv_por_dia, n: r.clima_espacial.avisos });
    case 'info_parada':
      return t('lr.stopInfo', { nombre: r.nombre, situacion: r.ciencia.situacion, tarea: r.ciencia.tarea, e: r.elevacion_m, s: r.pendiente_grados }) +
        (r.regreso_a_pie_min === null ? t('lr.noWayBack') : t('lr.walkBack', { m: r.regreso_a_pie_min }));
    case 'salud_astronauta':
      return (r.momento === 'ahora'
        ? t('lr.healthNow', { fc: r.fc_lpm, rr: r.respiracion_rpm, temp: dec(r.temperatura_corporal_C), estado: r.estado })
        : t('lr.healthPlan', { fc: r.fc_maxima_lpm, min: r.en_el_minuto })) + t('lr.simulated');
    case 'mostrar_capa':
      return t(r.visible ? 'lr.layerOn' : 'lr.layerOff', { capa: r.capa });
    default: return t('lr.default');
  }
}

// ---------------- Voz ----------------
// Reconocimiento (hablar -> texto) y sintesis (texto -> voz) del propio navegador.
export function createVoice({ onText, onState }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(SR);
  let rec = null, listening = false, finalText = '';

  function start() {
    if (!supported || listening) return;
    window.speechSynthesis?.cancel();
    rec = new SR();
    rec.lang = voiceLang; rec.interimResults = true; rec.continuous = true;
    finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
      }
      onState?.('escuchando', (finalText + interim).trim());
    };
    rec.onerror = (e) => { listening = false; onState?.('error', e.error === 'not-allowed' ? t('voice.denied') : t('voice.nohear')); };
    rec.onend = () => {
      const was = listening; listening = false;
      const text = finalText.trim();
      if (text) onText(text); else if (was) onState?.('vacio', '');
    };
    listening = true; onState?.('escuchando', '');
    try { rec.start(); } catch { listening = false; }
  }
  function stop() { if (rec && listening) rec.stop(); }

  // vlang: idioma de la voz (por defecto el de la app). onEnd (opcional) se llama cuando termina de hablar.
  // opts: { pitch, voz } — voz = posicion entre las voces de ese idioma (para distinguir a dos personas).
  // Devuelve false si el navegador no puede hablar.
  function speak(text, vlang = voiceLang, onEnd = null, opts = {}) {
    const s = window.speechSynthesis; if (!s || !text) return false;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = vlang; u.rate = 1.05; u.pitch = opts.pitch || 1;
    const vs = s.getVoices().filter((k) => k.lang && k.lang.toLowerCase().startsWith(vlang.slice(0, 2).toLowerCase()));
    if (vs.length) u.voice = vs[(opts.voz || 0) % vs.length];
    if (onEnd) u.onend = u.onerror = onEnd;
    s.speak(u);
    return true;
  }

  return { supported, start, stop, speak, isListening: () => listening };
}

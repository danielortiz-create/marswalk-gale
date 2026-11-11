// tars.js — cliente de TARS en el navegador: conversacion, ejecucion de herramientas y voz.
//
// El navegador NO conoce la clave de la API. Habla con /api/tars (server/tars-proxy.js),
// que es quien llama a Claude. Si ese servidor no existe (por ejemplo en GitHub Pages)
// o no tiene clave, TARS funciona "sin IA": solo las ordenes rapidas, con respuestas
// armadas a partir de los mismos datos.

const MAX_PASOS = 8;        // maximo de idas y vueltas de herramientas por pregunta
const MAX_MENSAJES = 60;    // al pasar de aqui se empieza una conversacion nueva

// runTool(nombre, entrada) -> objeto con el resultado (lo implementa main.js)
export function createTars(runTool) {
  let messages = [];
  let online = false, model = '';

  // ¿Hay servidor con clave?
  const ready = fetch('api/tars').then((r) => (r.ok ? r.json() : { ok: false }))
    .then((j) => { online = Boolean(j.ok); model = j.model || ''; return online; })
    .catch(() => { online = false; return false; });

  // Envia una pregunta y devuelve el texto de la respuesta final.
  async function ask(text) {
    if (!online) throw new Error('TARS no tiene conexión con la IA en este sitio.');
    if (messages.length > MAX_MENSAJES) messages = [];
    messages.push({ role: 'user', content: text });
    for (let paso = 0; paso < MAX_PASOS; paso++) {
      const r = await fetch('api/tars', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }) });
      const data = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor.' }));
      if (!r.ok) { messages.pop(); throw new Error(data.error || `Error ${r.status}`); }

      // El contenido del asistente se guarda tal cual llega (incluye bloques internos del modelo)
      messages.push({ role: 'assistant', content: data.content });
      const say = data.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();

      if (data.stop_reason === 'refusal') return 'No puedo ayudar con esa petición.';
      if (data.stop_reason === 'pause_turn') continue;
      if (data.stop_reason !== 'tool_use') return say || 'Hecho.';

      // Ejecutar todas las herramientas pedidas y devolver los resultados en UN solo mensaje
      const results = [];
      for (const b of data.content) {
        if (b.type !== 'tool_use') continue;
        try {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input || {})) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: String(e.message || e) });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return 'No pude completar la petición en los pasos permitidos.';
  }

  return { ready, ask, isOnline: () => online, model: () => model, reset: () => { messages = []; } };
}

// Respuestas "sin IA": una frase armada con el resultado de la herramienta.
export function localReply(name, r) {
  if (r.error) return r.error;
  switch (name) {
    case 'estado_mision': {
      if (r.casco) return `Llevas ${r.casco.tiempo_min} min y ${r.casco.distancia_recorrida_km} km. Oxígeno ${r.casco.o2_restante_pct} %. Siguiente: ${r.casco.siguiente}, a ${r.casco.distancia_siguiente_m} m. Regreso a pie: ${r.casco.regreso_a_pie_min} min.`;
      if (!r.hay_ruta) return 'No hay ruta transitable con los límites actuales.';
      return `${r.veredicto}. ${r.paradas_activas} de ${r.paradas_totales} paradas, ${r.distancia_km} km en ${r.duracion_min} min. Oxígeno al llegar: ${r.o2_al_llegar_pct} % (estimado).`;
    }
    case 'fijar_reserva_o2':
      return (r.omitidas.length ? `Omito ${r.omitidas.join(', ')}. ` : 'No hace falta omitir paradas. ') +
        `Reserva estimada al llegar: ${r.o2_al_llegar_pct} %` + (r.cumple ? '.' : `, por debajo del ${r.reserva_minima_pct} % pedido.`);
    case 'simular_evento_solar':
    case 'regresar_al_habitat':
      return `Regreso al hábitat desde ${r.desde}: ${r.regreso_min} min. Oxígeno estimado al llegar: ${r.o2_al_llegar_pct} %.` +
        (r.dosis_duplicada ? ' Dosis de radiación duplicada durante el regreso.' : '');
    case 'activar_parada':
      return `${r.parada} ${r.activa ? 'incluida' : 'excluida'}. Ahora ${r.paradas_activas} de ${r.paradas_totales} paradas y ${r.distancia_km} km.`;
    case 'entorno':
      return `Aire de ${r.clima.aire_min_C} a ${r.clima.aire_max_C} °C, presión ${r.clima.presion_Pa} Pa (REMS, sol ${r.clima.sol}). Radiación ${r.radiacion.mSv_por_dia} mSv al día (RAD). ${r.clima_espacial.avisos} avisos solares recientes.`;
    case 'info_parada':
      return `${r.nombre}: elevación ${r.elevacion_m} m, pendiente ${r.pendiente_grados}°, regreso a pie ${r.regreso_a_pie_min} min.`;
    case 'mostrar_capa':
      return `Capa ${r.capa} ${r.visible ? 'encendida' : 'apagada'}.`;
    default: return 'Hecho.';
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
    rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
    finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
      }
      onState?.('escuchando', (finalText + interim).trim());
    };
    rec.onerror = (e) => { listening = false; onState?.('error', e.error === 'not-allowed' ? 'Permite el micrófono para hablar con TARS.' : 'No te oí. Inténtalo de nuevo.'); };
    rec.onend = () => {
      const was = listening; listening = false;
      const text = finalText.trim();
      if (text) onText(text); else if (was) onState?.('vacio', '');
    };
    listening = true; onState?.('escuchando', '');
    try { rec.start(); } catch { listening = false; }
  }
  function stop() { if (rec && listening) rec.stop(); }

  function speak(text) {
    const s = window.speechSynthesis; if (!s || !text) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 1.05;
    const v = s.getVoices().find((k) => k.lang && k.lang.toLowerCase().startsWith('es'));
    if (v) u.voice = v;
    s.speak(u);
  }

  return { supported, start, stop, speak, isListening: () => listening };
}

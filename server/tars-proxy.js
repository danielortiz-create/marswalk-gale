// tars-proxy.js — puente entre la app y Claude (el agente TARS).
//
// Se ejecuta dentro del servidor de Vite (npm run dev / npm run preview), NO en el navegador.
// Asi la clave ANTHROPIC_API_KEY de .env.local nunca llega a la pagina.
//
//   GET  /api/tars  -> { ok: true|false }   (¿hay clave configurada?)
//   POST /api/tars  -> { messages }  =>  { content, stop_reason, model }
//
// Las herramientas se DEFINEN aqui pero se EJECUTAN en el navegador (src/tars.js),
// porque son las que leen y cambian el estado real de la app.
import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from 'vite';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `Eres TARS, el agente de misión de una caminata de astronautas en las crestas boxwork de Monte Sharp, cráter Gale, Marte. Trabajas dentro de la app Marswalk Gale: un mapa 3D con la ruta, el presupuesto de oxígeno y los datos de entorno. Hablas con la tripulación, a veces por voz mientras caminan.

Cómo responder:
- En español, directo y breve: una o dos frases. La tripulación te escucha por el casco y no puede leer párrafos. Da el número con su unidad y para.
- Usa solo datos que devuelvan las herramientas; no cites cifras de memoria. Si una herramienta no tiene el dato, dilo.
- Distingue lo medido de lo estimado cuando importe para una decisión: el terreno, el clima (REMS), la radiación (RAD) y los avisos solares (DONKI) son mediciones; la velocidad de marcha, el oxígeno, los tiempos y el veredicto GO/NO-GO son estimaciones del modelo de planificación.
- Cuando te pidan cambiar el plan (reserva de oxígeno, quitar o añadir una parada, evento solar, volver al hábitat), hazlo con la herramienta correspondiente y luego di qué cambió: paradas omitidas, distancia y oxígeno al llegar.
- Si la seguridad está en juego (oxígeno insuficiente para volver, alerta solar), dilo primero.
- Sin formato: nada de listas, negritas ni emojis, porque la respuesta se lee en voz alta.`;

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const TOOLS = [
  { name: 'estado_mision',
    description: 'Estado actual del plan y de la caminata: modo (planificador o casco), paradas activas y su orden, distancia, duración, oxígeno usado y restante al llegar, margen de regreso, dosis de radiación, veredicto, y en la vista de casco la posición y lecturas del momento. Llámala antes de responder cualquier pregunta sobre la misión.',
    input_schema: obj({}) },
  { name: 'entorno',
    description: 'Condiciones del entorno: clima medido por REMS (temperaturas, presión, UV, amanecer y atardecer), radiación en superficie medida por RAD y resumen de avisos de clima espacial de DONKI.',
    input_schema: obj({}) },
  { name: 'info_parada',
    description: 'Datos de una parada científica: posición, elevación, pendiente del terreno, minutos de regreso a pie al hábitat y si tiene fotos de Curiosity.',
    input_schema: obj({ parada: { type: 'string', description: 'Identificador (S1…S5, C1…) o nombre, por ejemplo "Boxwork 3".' } }) },
  { name: 'fijar_reserva_o2',
    description: 'Fija el porcentaje mínimo de oxígeno que debe quedar al volver al hábitat y replanifica. Si el plan no lo cumple, omite paradas hasta cumplirlo. Devuelve el plan nuevo y las paradas omitidas.',
    input_schema: obj({ porcentaje: { type: 'number', description: 'De 0 a 95.' } }) },
  { name: 'activar_parada',
    description: 'Incluye o excluye una parada del plan y replanifica.',
    input_schema: obj({ parada: { type: 'string' }, activa: { type: 'boolean' } }) },
  { name: 'simular_evento_solar',
    description: 'Simula una alerta por evento solar. En el planificador ocurre en la parada indicada; en la vista de casco, en la posición actual (el campo parada se ignora). Calcula la ruta más rápida de regreso al hábitat con la dosis duplicada.',
    input_schema: obj({ parada: { type: 'string', description: 'Parada donde ocurre, o cadena vacía para la parada seleccionada o la posición actual.' } }) },
  { name: 'mostrar_capa',
    description: 'Enciende o apaga una capa del mapa.',
    input_schema: obj({ capa: { type: 'string', enum: ['ortofoto', 'elevacion', 'pendiente', 'termica', 'rugosidad', 'regreso', 'curvas', 'recorrido_curiosity'] }, visible: { type: 'boolean' } }) },
  { name: 'regresar_al_habitat',
    description: 'Ordena volver al hábitat por la ruta más rápida, sin evento solar. En la vista de casco cambia la ruta desde la posición actual; en el planificador muestra la ruta de regreso desde la parada seleccionada.',
    input_schema: obj({}) },
].map((t) => ({ ...t, strict: true }));

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) { reject(new Error('demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function makeHandler(mode, root) {
  // Lee .env.local sin exponer nada al navegador (prefijo '' = todas las variables, solo aqui)
  const env = loadEnv(mode, root, '');
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  let client = null;

  return async (req, res, next) => {
    if (!req.url || req.url.split('?')[0] !== '/api/tars') return next();
    if (req.method === 'GET') return send(res, 200, { ok: hasKey(), model: MODEL });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
    if (!hasKey()) return send(res, 503, { error: 'Falta ANTHROPIC_API_KEY en .env.local.' });

    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'Petición no válida.' }); }
    if (!Array.isArray(body.messages) || !body.messages.length) return send(res, 400, { error: 'Faltan los mensajes.' });

    try {
      client ??= new Anthropic();
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },          // respuestas rapidas: se usa por voz
        cache_control: { type: 'ephemeral' },      // cachea instrucciones, herramientas e historial
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',                      // si el modelo declina, la API reintenta con otro
        system: SYSTEM,
        tools: TOOLS,
        messages: body.messages,
      });
      return send(res, 200, { content: response.content, stop_reason: response.stop_reason, model: response.model });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'La clave de API no es válida.' });
      if (e instanceof Anthropic.PermissionDeniedError) return send(res, 403, { error: 'La clave no tiene permiso para este modelo.' });
      if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Límite de uso alcanzado. Espera un momento.' });
      if (e instanceof Anthropic.APIConnectionError) return send(res, 502, { error: 'No hay conexión con la API de Claude.' });
      if (e instanceof Anthropic.APIError) return send(res, e.status || 500, { error: `Error de la API (${e.status}): ${e.message}` });
      console.error('[tars]', e);
      return send(res, 500, { error: 'Error interno del servidor de TARS.' });
    }
  };
}

// Complemento de Vite: añade /api/tars a "npm run dev" y a "npm run preview"
export function tarsProxy() {
  let handler;
  return {
    name: 'tars-proxy',
    configResolved(config) { handler = makeHandler(config.mode, config.root); },
    configureServer(server) { server.middlewares.use((req, res, next) => handler(req, res, next)); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => handler(req, res, next)); },
  };
}

// tars-dialog.js — conversacion SIMULADA entre TARS (el agente del traje) y el astronauta EV1
// durante la vista de casco. Es un guion fijo, en ingles, para la demo: no hay IA ni sensores.
// Las cifras (pulso, distancia, tiempo...) salen del modelo de la app en ese momento.
//
// Uso:  const d = createDialog(voice, (who, text) => ...);  d.update(dt, estado);  d.talking()

const VOZ = 'en-US';
const PERSONAS = {
  TARS: { pitch: 0.75, voz: 0 },          // voz grave
  EV1: { pitch: 1.15, voz: 1 },           // otra voz (si el navegador tiene varias en ingles)
};
const UMBRALES = [99, 95, 80, 70, 60];    // % de oxigeno (de la demo) en los que habla TARS
const PAUSA = 0.5;                        // segundos de silencio entre frases
const ENTRE_PENDIENTES = 120;             // segundos simulados minimos entre dos avisos de pendiente

// minutos dichos en voz alta: «12 minutes» o «6 hours and 54 minutes»
const minEn = (n) => (n < 60 ? `${n} minutes` : `${Math.floor(n / 60)} hours and ${n % 60} minutes`);

// Frases de cada momento. d = datos del momento (ver main.js, updateHud)
const GUION = {
  99: () => [['TARS', "EV1, this is TARS, your suit assistant. All readings today are simulated. I'm tracking your oxygen, your vitals and the terrain ahead."]],
  95: (d) => [
    ['TARS', `Your heart rate is up to ${d.hr} beats per minute. How are you feeling?`],
    ['EV1', 'A little winded on this climb.'],
    ['TARS', `Understood. Breathing ${d.resp} per minute, body temperature ${d.temp} degrees. Shorten your stride and keep a steady pace.`],
  ],
  80: (d) => [
    ['TARS', `Oxygen at 80 percent. ${d.km} kilometers and about ${d.min} minutes left to the habitat. You'll get back with about ${d.o2Fin} percent.`],
    ['EV1', 'Good to know. Continuing.'],
  ],
  70: (d) => [
    ['TARS', `Vitals check. Heart rate ${d.hr}, breathing ${d.resp}. How do you feel?`],
    ['EV1', 'Tired, but okay.'],
    ['TARS', 'Your numbers are within limits. Rest for a minute at the next stop.'],
  ],
  60: (d) => [
    ['TARS', `Oxygen at 60 percent. Your return margin is still positive: ${d.back} minutes back to the habitat.`],
    ['EV1', 'Copy. Heading home after the next stop.'],
  ],
  pendiente: (d) => [
    ['TARS', `Heads up: ${d.slope} degree slope in ${d.slopeM} meters. Short, firm steps.`],
    ['EV1', 'Copy, slowing down.'],
  ],
  parada: (d) => [
    ['TARS', `You've reached ${d.stop}. Take your samples; I'll keep watching your vitals.`],
    ['EV1', 'Starting samples now.'],
  ],
  // Decision ante la alerta solar simulada (ver main.js, openDecision)
  alerta: (d) => [
    ['TARS', `Solar alert, EV1. Radiation is rising. Going back now takes ${d.back} minutes and leaves ${minEn(d.margin)} of oxygen margin.`],
    ['TARS', `Reaching ${d.stop} first adds ${d.extra} minutes. I recommend returning. Your call.`],
  ],
  regreso: (d) => [
    ['EV1', 'Returning to the habitat.'],
    ['TARS', `Copy. Follow the return line. The ${d.stop} observation stays pending.`],
  ],
  sigue: (d) => [
    ['EV1', `I'll take the sample at ${d.stop} and come straight back.`],
    ['TARS', "Copy. Keep it short. I'll watch your dose and your margin."],
  ],
  fin: () => [
    ['TARS', 'Welcome back to the habitat. Walk complete, great job.'],
    ['EV1', 'Thanks, TARS.'],
  ],
};

// voice: el objeto de createVoice (tars.js). mostrar(who, text): pinta el subtitulo (who = null: ocultarlo).
export function createDialog(voice, mostrar) {
  let hecho, cola, actual, espera, ultimaPendiente;

  function reset() {
    hecho = new Set(); cola = []; actual = null; espera = 0; ultimaPendiente = -1e9;
    window.speechSynthesis?.cancel();
  }
  reset();

  function decir(clave, d) {
    if (hecho.has(clave)) return;
    hecho.add(clave);
    const tipo = String(clave).split(':')[0];
    cola.push(...GUION[tipo](d));
  }

  // Siguiente frase de la cola: subtitulo + voz. Sin voz, dura segun su largo.
  function hablar() {
    const [who, text] = cola.shift();
    actual = { t: 0, terminada: false };
    const yo = actual;
    mostrar(who, text);
    const hayVoz = voice.speak(text, VOZ, () => { yo.terminada = true; }, PERSONAS[who]);
    actual.minimo = hayVoz ? 1 : 1.5 + text.length * 0.06;
    actual.maximo = 4 + text.length * 0.1;          // por si la voz no avisa de que termino
    if (!hayVoz) actual.terminada = true;
  }

  // dt: segundos reales. d: datos del momento (o2 de la demo, vitales, pendiente por delante...)
  function update(dt, d) {
    for (const u of UMBRALES) if (d.o2 <= u) decir(u, d);
    if (d.slope && d.simT - ultimaPendiente > ENTRE_PENDIENTES && !hecho.has('fin')) {
      ultimaPendiente = d.simT; hecho.delete('pendiente'); decir('pendiente', d);
    }
    if (d.stop) decir('parada:' + d.stop, d);
    if (d.fin) decir('fin', d);

    if (actual) {
      actual.t += dt;
      if ((actual.terminada && actual.t > actual.minimo) || actual.t > actual.maximo) {
        actual = null; espera = PAUSA;
        if (!cola.length) mostrar(null);          // nadie mas habla: se oculta el subtitulo
      }
    } else if (cola.length) {
      espera -= dt;
      if (espera <= 0) hablar();
    }
  }

  // Frases urgentes (alerta y decision): cortan lo que se estuviera diciendo y hablan ya
  function urgente(tipo, d) {
    cola = [...GUION[tipo](d)]; actual = null; espera = 0;
    window.speechSynthesis?.cancel();
  }

  return { reset, update, urgente, talking: () => Boolean(actual || cola.length) };
}

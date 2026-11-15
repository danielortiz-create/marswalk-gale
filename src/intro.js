// intro.js — introduccion animada: la nave aterriza junto al habitat, la nave situa al
// espectador y un astronauta explica de que va el proyecto. Textos en intro-text.js.
//
// Fases:  portada -> descenso -> nave (habla) -> astronauta (habla) -> planificador
import * as THREE from 'three';
import { makeLander, makeAstronaut } from './models.js';
import { TEXT } from './intro-text.js';
import { lang as paginaLang, setLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const ALTURA = 160;        // metros desde los que baja la nave
const T_DESCENSO = 9;      // segundos que dura el descenso

// layout: recoloca el lienzo 3D.  recall / store: preferencias guardadas en el navegador.
export function createIntro(A, { layout, recall, store }) {
  const S = { fase: 'off', t: 0, lang: paginaLang, linea: 0, tLinea: 0, dicha: false, turno: 0 };
  const hablar = (texto, voz, fin) => (A.voice ? A.voice.speak(texto, voz, fin) : false);
  const callar = () => window.speechSynthesis?.cancel();

  // Punto de aterrizaje: zona llana a unos 55 m del habitat
  const sitio = { x: A.habitat.x - 45, z: A.habitat.z + 32 };
  sitio.y = A.terrain.heightAt(sitio.x, sitio.z);

  // Objetos 3D propios de la introduccion (ocultos el resto del tiempo)
  const nave = makeLander();
  const astro = makeAstronaut(0xff8a3d);
  const polvo = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0xd2a679, transparent: true, opacity: 0, depthWrite: false }));
  polvo.rotation.x = -Math.PI / 2; polvo.position.set(sitio.x, sitio.y + 0.6, sitio.z);
  astro.position.set(sitio.x + 8, A.terrain.heightAt(sitio.x + 8, sitio.z + 5), sitio.z + 5);
  for (const o of [nave, astro, polvo]) { o.visible = false; A.scene.add(o); }
  const mira = new THREE.Vector3();          // punto al que mira la camara

  // ---------- textos ----------
  function pintarTextos() {
    const T = TEXT[S.lang];
    $('iKicker').textContent = T.rotulo; $('iTag').textContent = T.lema;
    $('iStart').textContent = T.iniciar; $('iSkip').textContent = T.saltar; $('iNext').textContent = T.siguiente;
    for (const b of document.querySelectorAll('#intro .ilang button')) b.classList.toggle('on', b.dataset.lang === S.lang);
  }
  // Muestra la frase actual de la fase y la lee en voz alta
  function decir() {
    const T = TEXT[S.lang], nave_ = S.fase === 'nave';
    const texto = (nave_ ? T.nave : T.astronauta)[S.linea];
    $('iWho').textContent = nave_ ? T.nombreNave : T.nombreAstronauta;
    $('iLine').textContent = texto;
    S.tLinea = 0; S.dicha = false;
    const turno = ++S.turno;                 // evita que el final de una frase anterior cuente para esta
    const hayVoz = hablar(texto, T.voz, () => { if (turno === S.turno) S.dicha = true; });
    // tiempo de lectura: minimo si hay voz (se espera a que termine), completo si no la hay
    S.minimo = hayVoz ? 2.5 : 2.5 + texto.length * 0.06;
    S.maximo = 4 + texto.length * 0.09;          // por si la voz no avisa de que termino
    if (!hayVoz) S.dicha = true;
  }
  function siguiente() {
    const total = TEXT[S.lang][S.fase === 'nave' ? 'nave' : 'astronauta'].length;
    if (S.linea + 1 < total) { S.linea++; decir(); return; }
    if (S.fase === 'nave') { fase('astronauta'); astro.visible = true; decir(); } else terminar();
  }
  function fase(nombre) { S.fase = nombre; S.t = 0; S.linea = 0; }

  // ---------- entrada y salida ----------
  function start() {
    if (S.fase !== 'off') return;
    const hud = document.body.dataset.mode === 'hud';
    if (hud) $('hExit').click();             // si estaba en el casco, volver antes al planificador
    S.cam = { p: A.camera.position.clone(), t: A.controls.target.clone() };
    document.body.dataset.mode = 'intro';
    A.controls.enabled = false;
    A.scene.background = new THREE.Color(0xd9b48a);
    A.terrain.uniforms.uFogDensity.value = 0.00012;
    A.camera.fov = 50; A.camera.near = 0.5;
    $('labels').innerHTML = ''; $('introCard').hidden = false; $('introSub').hidden = true; $('introFade').classList.remove('on');
    nave.visible = astro.visible = polvo.visible = false;
    fase('portada'); pintarTextos(); layout();
  }
  function empezar() {                       // boton "Iniciar": empieza el descenso
    $('introCard').hidden = true;
    nave.visible = polvo.visible = true; polvo.material.opacity = 0;
    A.terrain.uniforms.uFogDensity.value = 0.0003;
    fase('descenso');
  }
  function terminar() {                      // fundido y vuelta al planificador
    if (S.fase === 'off' || S.fase === 'fin') return;
    S.fase = 'fin'; S.turno++; callar();
    $('introFade').classList.add('on');
    setTimeout(() => {
      S.fase = 'off';
      nave.visible = astro.visible = polvo.visible = false;
      document.body.dataset.mode = 'plan';
      A.controls.enabled = true;
      A.scene.background = null; A.terrain.uniforms.uFogDensity.value = 0;
      A.camera.fov = 45; A.camera.near = 2;
      A.camera.position.copy(S.cam.p); A.controls.target.copy(S.cam.t);
      store('mw_intro', '1'); layout();
      if (S.lang !== paginaLang) setLang(S.lang);      // el resto de la app queda en el idioma elegido aqui (recarga sin repetir la introduccion)
    }, 450);
  }

  // ---------- un fotograma ----------
  function update(dt) {
    S.t += dt;
    const cam = A.camera, h = A.terrain.heightAt;
    if (S.fase === 'portada') {              // el terreno gira despacio detras de la portada
      const a = -0.15 + S.t * 0.04;
      cam.position.set(Math.sin(a) * 1750, 1150, 120 + Math.cos(a) * 1750); cam.lookAt(0, 0, 120);
      return;
    }
    if (S.fase === 'descenso') {
      const u = Math.min(1, S.t / T_DESCENSO), alto = ALTURA * (1 - u) ** 2;      // frena al acercarse al suelo
      nave.position.set(sitio.x + 30 * (1 - u) ** 2, sitio.y + alto, sitio.z);
      const f = nave.userData.flame;
      f.visible = alto > 0.15; f.scale.set(1, (0.5 + 0.5 * Math.min(1, alto / 40)) * (0.85 + Math.random() * 0.3), 1);
      // polvo levantado por el motor en los ultimos metros
      const cerca = Math.max(0, 1 - alto / 60);
      polvo.scale.setScalar(4 + 18 * cerca); polvo.material.opacity = 0.45 * cerca;
      const a = 0.6 + S.t * 0.03, r = 45 + alto * 0.45;       // la camara baja con la nave y se acerca
      const cx = sitio.x + Math.sin(a) * r, cz = sitio.z + Math.cos(a) * r;
      cam.position.set(cx, Math.max(h(cx, cz) + 2.5, sitio.y + 8 + alto * 0.75), cz);
      mira.set(nave.position.x, nave.position.y + 3, nave.position.z); cam.lookAt(mira);
      if (S.t > T_DESCENSO + 0.8) { fase('nave'); $('introSub').hidden = false; decir(); }
      return;
    }
    if (S.fase === 'nave' || S.fase === 'astronauta') {
      polvo.material.opacity = Math.max(0, polvo.material.opacity - dt * 0.12);    // el polvo se asienta
      let px, pz, py, mx, my, mz;
      if (S.fase === 'nave') {               // la camara rodea la nave posada
        const a = 0.9 + S.t * 0.05;
        px = sitio.x + Math.sin(a) * 30; pz = sitio.z + Math.cos(a) * 30; py = Math.max(h(px, pz) + 2, sitio.y + 7);
        mx = sitio.x; my = sitio.y + 4; mz = sitio.z;
      } else {                               // plano cercano del astronauta, con la nave detras
        const p = astro.position, a = Math.sin(S.t * 0.2) * 0.25;
        px = p.x + 4.4 * Math.cos(a) - 2.9 * Math.sin(a); pz = p.z + 2.9 * Math.cos(a) + 4.4 * Math.sin(a);
        py = Math.max(h(px, pz) + 1.2, p.y + 1.7);
        mx = p.x; my = p.y + 1.45; mz = p.z;
        astro.rotation.y = Math.atan2(-(px - p.x), -(pz - p.z));               // mira a la camara
        astro.getObjectByName('armR').rotation.x = -0.7 + Math.sin(S.t * 2.6) * 0.25;   // gesto al hablar
      }
      const k = 1 - Math.exp(-dt * 2.2);     // movimiento suave hacia la posicion deseada
      cam.position.x += (px - cam.position.x) * k; cam.position.y += (py - cam.position.y) * k; cam.position.z += (pz - cam.position.z) * k;
      mira.x += (mx - mira.x) * k; mira.y += (my - mira.y) * k; mira.z += (mz - mira.z) * k;
      cam.lookAt(mira);
      S.tLinea += dt;
      if ((S.dicha && S.tLinea > S.minimo) || S.tLinea > S.maximo) siguiente();
    }
  }

  // ---------- controles ----------
  $('iStart').onclick = empezar;
  $('iSkip').onclick = terminar;
  $('iNext').onclick = siguiente;
  for (const b of document.querySelectorAll('#intro .ilang button')) b.onclick = () => {
    S.lang = b.dataset.lang; store('mw_lang', S.lang); pintarTextos();
    if (S.fase === 'nave' || S.fase === 'astronauta') decir();      // repite la frase en el otro idioma
  };
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.fase !== 'off') terminar(); });

  return { start, update, skip: terminar, state: S };
}

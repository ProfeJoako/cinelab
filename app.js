"use strict";
const $ = (id) => document.getElementById(id);
const tell = (id, msg) => { $(id).textContent = msg; };
let cameraStream = null, micStream = null, recorder = null, chunks = [], voiceUrl = null;
let audioCtx = null, synthNodes = [], cgiFrame = null, keyActive = false;
let soundTimer = null, soundMaster = null, speechRecognizer = null, originalRecordingText = "";

// Navegación
function stopCamera() {
  keyActive = false;
  if (cgiFrame !== null) cancelAnimationFrame(cgiFrame);
  cgiFrame = null;
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  $('camera').srcObject = null;
  tell('camStatus', 'Cámara desactivada.');
}
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.station').forEach(s => s.classList.toggle('active', s.id === btn.dataset.target));
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  stopMood();
  if (cameraStream) stopCamera();
}));

// Frases traducidas de demostración, NO traducción libre de grabaciones.
const phrases = {
  cine: {'es-MX':'El cine es el arte de contar historias.', 'en-US':'Cinema is the art of telling stories.', 'fr-FR':'Le cinéma est l’art de raconter des histoires.', 'it-IT':'Il cinema è l’arte di raccontare storie.'},
  futuro: {'es-MX':'La tecnología transforma la manera de crear.', 'en-US':'Technology transforms the way we create.', 'fr-FR':'La technologie transforme notre façon de créer.', 'it-IT':'La tecnologia trasforma il modo in cui creiamo.'}
};
function updatePhrase() { tell('speechPreview', phrases[$('phrase').value][$('lang').value]); }
$('lang').addEventListener('change', updatePhrase);
$('phrase').addEventListener('change', updatePhrase);
updatePhrase();
$('speak').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return alert('Este navegador no admite voz sintetizada.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(phrases[$('phrase').value][$('lang').value]);
  u.lang = $('lang').value; u.rate = .93;
  const available = speechSynthesis.getVoices();
  const found = available.find(v => v.lang.toLowerCase() === u.lang.toLowerCase()) || available.find(v => v.lang.startsWith(u.lang.slice(0,2)));
  if (found) u.voice = found;
  speechSynthesis.speak(u);
});
$('stopSpeak').addEventListener('click', () => speechSynthesis.cancel());

// Grabación real del micrófono, guardada sólo en el navegador.
$('recVoice').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return tell('voiceStatus', 'Tu navegador no permite grabación en esta página. Usa HTTPS.');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({audio:true});
    const choices = ['audio/webm;codecs=opus','audio/mp4','audio/webm'];
    const mime = choices.find(x => MediaRecorder.isTypeSupported(x));
    recorder = new MediaRecorder(micStream, mime ? {mimeType:mime} : {});
    chunks = [];
    beginRecognition();
    recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, {type:recorder.mimeType || 'audio/webm'});
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      voiceUrl = URL.createObjectURL(blob);
      $('playVoice').src = voiceUrl; $('playVoice').hidden = false;
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      $('downloadVoice').href = voiceUrl; $('downloadVoice').download = `mi-voz-cine.${ext}`; $('downloadVoice').hidden = false;
      try { speechRecognizer?.stop(); } catch {}
      if (micStream) micStream.getTracks().forEach(t=>t.stop());
      micStream = null;
      $('recVoice').disabled = false; $('stopVoice').disabled = true;
      tell('voiceStatus', 'Grabación lista. Escúchala o descárgala.');
    };
    recorder.start(); $('recVoice').disabled = true; $('stopVoice').disabled = false;
    tell('voiceStatus', 'Grabando... di tu frase y presiona Detener.');
  } catch(e) { tell('voiceStatus', 'No se pudo usar el micrófono: revisa permisos.'); }
});
$('stopVoice').addEventListener('click', () => { if(recorder?.state === 'recording') recorder.stop(); });

// Cámara y filtros clásicos de cine
const filters = {
  none:'none', noir:'grayscale(1) contrast(1.55)', terror:'brightness(.68) contrast(1.55) saturate(.55) hue-rotate(25deg)',
  romance:'sepia(.27) saturate(1.5) brightness(1.13)', scifi:'hue-rotate(165deg) saturate(1.65) contrast(1.2)'
};
async function startCamera() {
  if(cameraStream) return cameraStream;
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Requiere HTTPS y un navegador compatible');
  cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
  $('camera').srcObject = cameraStream;
  await $('camera').play();
  return cameraStream;
}
$('startCam').addEventListener('click', async () => { try { await startCamera(); tell('camStatus', 'Cámara activa. Prueba diferentes looks.'); } catch(e) { tell('camStatus', 'No se pudo iniciar la cámara: ' + e.message); } });
$('stopCam').addEventListener('click', stopCamera);
$('look').addEventListener('change', () => { $('camera').style.filter = filters[$('look').value]; });
$('photo').addEventListener('click', () => {
  const v = $('camera');
  if (!cameraStream || !v.videoWidth) return tell('camStatus', 'Activa primero la cámara.');
  const c = $('shot'); c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext('2d'); ctx.filter = filters[$('look').value]; ctx.drawImage(v,0,0,c.width,c.height);
  const a = $('downloadPhoto'); a.href = c.toDataURL('image/png'); a.download = 'mi-escena-cinematografica.png'; a.hidden = false;
  tell('camStatus','Fotograma capturado. Puedes descargarlo.');
});

// Sonidos cinematográficos generativos con Web Audio API. No requiere ficheros MP3.
function stopMood() {
  if(soundTimer !== null){clearInterval(soundTimer);soundTimer=null;}
  synthNodes.forEach(n=>{try{n.stop?.();}catch{} try{n.disconnect?.();}catch{}});
  synthNodes=[];
  if(soundMaster){try{soundMaster.disconnect();}catch{} soundMaster=null;}
  if($('moodStatus')) tell('moodStatus','Sonido detenido.');
}
function soundNote(freq, start, duration, type='sine', power=.12){
  const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
  osc.type=type; osc.frequency.setValueAtTime(Math.max(25,freq),start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002,power),start+.045);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(gain).connect(soundMaster);
  osc.start(start); osc.stop(start+duration+.02);
  synthNodes.push(osc,gain);
  osc.onended=()=>{osc.disconnect();gain.disconnect();synthNodes=synthNodes.filter(n=>n!==osc&&n!==gain);};
}
function soundNoise(start,duration,power=.05){
  const count=Math.ceil(audioCtx.sampleRate*duration), buffer=audioCtx.createBuffer(1,count,audioCtx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<count;i++)data[i]=(Math.random()*2-1);
  const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();
  src.buffer=buffer;filter.type='lowpass';filter.frequency.value=650;
  gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(power,start+.12);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  src.connect(filter).connect(gain).connect(soundMaster);src.start(start);src.stop(start+duration);
  synthNodes.push(src,filter,gain);
  src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();synthNodes=synthNodes.filter(n=>n!==src&&n!==filter&&n!==gain);};
}
function playSoundPattern(mood){
  if(!audioCtx||!soundMaster)return;
  const now=audioCtx.currentTime+.04;
  const note=(f,t,d,kind='sine',p=.09)=>soundNote(f,now+t,d,kind,p);
  switch(mood){
    case 'suspense':
      note(55,0,2.8,'sawtooth',.06);note(58.27,.15,2.7,'triangle',.06);
      note(164.81,1.5,.45,'sine',.075);soundNoise(now+2,1.2,.025);break;
    case 'romance':
      [261.63,329.63,392,523.25,440,392,329.63,293.66].forEach((f,i)=>note(f,i*.46,.72,'sine',.12));
      [130.81,164.81,196].forEach(f=>note(f,0,3.6,'triangle',.035));break;
    case 'scifi':
      [110,164.81,220,330,440,660].forEach((f,i)=>note(f,i*.55,1.4,'sawtooth',.075));
      note(77.78,0,3.7,'sine',.065);break;
    case 'action':
      for(let i=0;i<8;i++){note(i%2?82.41:65.41,i*.45,.18,'square',.15);note(196+(i%3)*32,i*.45+.22,.2,'triangle',.08);}
      soundNoise(now+.1,.22,.085);soundNoise(now+1.9,.3,.085);break;
    case 'horror':
      note(41.2,0,3.7,'sawtooth',.055);note(43.65,.3,3.4,'sine',.09);
      note(740,2,.25,'triangle',.04);soundNoise(now+1.1,1.9,.035);break;
    case 'nature':
      soundNoise(now,3.7,.075);[659,784,988,880,784].forEach((f,i)=>note(f,.45+i*.59,.22,'sine',.065));break;
  }
}
$('moodVolume').addEventListener('input',()=>{
  const val=Number($('moodVolume').value);
  tell('moodVolumeValue',val+'%');
  if(soundMaster)soundMaster.gain.setTargetAtTime(val/100*.7,audioCtx.currentTime,.03);
});
$('playMood').addEventListener('click',async()=>{
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw Error('Tu navegador no admite audio Web Audio.');
    audioCtx ||= new AudioContextClass(); await audioCtx.resume();stopMood();
    soundMaster=audioCtx.createGain();soundMaster.gain.value=Number($('moodVolume').value)/100*.7;
    soundMaster.connect(audioCtx.destination);
    const mood=$('mood').value;
    playSoundPattern(mood);
    soundTimer=setInterval(()=>playSoundPattern(mood),4000);
    tell('moodStatus','Reproduciendo '+$('mood').selectedOptions[0].text+'. Ajusta el volumen o pulsa Silenciar.');
  }catch(error){tell('moodStatus','No se pudo reproducir: '+error.message);}
});
$('stopMood').addEventListener('click',stopMood);

// Doblaje: Web Speech Recognition -> traducción de texto (MyMemory) -> voz sintética.
// No es clonación de voz. SpeechRecognition no admite cargar una grabación guardada.
const recognitionConstructor=window.SpeechRecognition||window.webkitSpeechRecognition;
function beginRecognition(){
  if(!recognitionConstructor){tell('translateStatus','Tu navegador no reconoce voz automáticamente. Escribe el texto para traducir.');return;}
  try{
    if(speechRecognizer)try{speechRecognizer.abort();}catch{}
    speechRecognizer=new recognitionConstructor();speechRecognizer.lang='es-MX';
    speechRecognizer.continuous=true;speechRecognizer.interimResults=true;
    let finalized='';
    speechRecognizer.onresult=e=>{
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const s=e.results[i][0].transcript;
        if(e.results[i].isFinal)finalized+=s+' ';else interim+=s;
      }
      $('transcript').value=(finalized+interim).trim();
    };
    speechRecognizer.onerror=e=>{tell('translateStatus','Reconocimiento no disponible ('+e.error+'). Puedes escribir el diálogo manualmente.');};
    speechRecognizer.start();
  }catch(e){tell('translateStatus','No se pudo iniciar el reconocimiento. Escribe el diálogo manualmente.');}
}
let currentTranslation='';
const languageRoot=tag=>tag.split('-')[0];
const voiceSelect=$('voiceChoice');
function refreshVoices(){
  if(!('speechSynthesis' in window))return;
  const tag=$('targetLang').value,root=languageRoot(tag);
  const options=speechSynthesis.getVoices().filter(v=>languageRoot(v.lang.toLowerCase())===root);
  voiceSelect.replaceChildren(new Option('Automática según idioma',''));
  options.forEach(v=>voiceSelect.add(new Option(v.name+' ('+v.lang+')',v.voiceURI)));
}
if('speechSynthesis' in window){speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);refreshVoices();}
$('targetLang').addEventListener('change',()=>{refreshVoices();currentTranslation='';$('translatedText').value='';$('speakTranslated').disabled=true;});
$('transcript').addEventListener('input',()=>{currentTranslation='';$('speakTranslated').disabled=true;});
$('voiceRate').addEventListener('input',()=>tell('rateValue',Number($('voiceRate').value).toFixed(1)));
$('translateVoice').addEventListener('click',async()=>{
  const text=$('transcript').value.trim(),dest=languageRoot($('targetLang').value);
  if(!text){tell('translateStatus','Primero graba y transcribe, o escribe una frase.');return;}
  if(text.length>450){tell('translateStatus','Para el servicio gratuito, utiliza un texto de 450 caracteres o menos.');return;}
  $('translateVoice').disabled=true;$('speakTranslated').disabled=true;
  tell('translateStatus','Traduciendo tu diálogo...');
  try{
    let translated=text;
    if(dest!=='es'){
      const url='https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=es|'+encodeURIComponent(dest);
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Servicio no disponible ('+response.status+')');
      const data=await response.json();
      if(data.responseStatus!==200||!data.responseData?.translatedText)throw Error('El servicio no pudo traducir el diálogo');
      translated=data.responseData.translatedText;
      const el=document.createElement('textarea');el.innerHTML=translated;translated=el.value;
    }
    currentTranslation=translated;$('translatedText').value=translated;
    $('speakTranslated').disabled=!('speechSynthesis' in window);
    tell('translateStatus','Traducción lista. Pulsa Escuchar doblaje. La voz será sintética.');
  }catch(err){tell('translateStatus','No se completó la traducción: '+err.message+'. Revisa internet o intenta de nuevo.');}
  finally{$('translateVoice').disabled=false;}
});
$('speakTranslated').addEventListener('click',()=>{
  if(!currentTranslation||!('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(currentTranslation);
  u.lang=$('targetLang').value;u.rate=Number($('voiceRate').value);
  const voices=speechSynthesis.getVoices();
  const selected=voices.find(v=>v.voiceURI===voiceSelect.value);
  const matching=voices.find(v=>v.lang.toLowerCase()===u.lang.toLowerCase())||voices.find(v=>languageRoot(v.lang.toLowerCase())===languageRoot(u.lang));
  if(selected||matching)u.voice=selected||matching;
  else tell('translateStatus','No se encontró una voz instalada para '+$('targetLang').selectedOptions[0].text+'. El navegador intentará usar una voz alternativa.');
  speechSynthesis.speak(u);
});
$('stopTranslated').addEventListener('click',()=>{if('speechSynthesis' in window)speechSynthesis.cancel();});

// Chroma key de fondo verde + arte digital generado por Canvas
const keyCanvas = $('keyCanvas'), keyCtx = keyCanvas.getContext('2d',{willReadFrequently:true});
const temp = document.createElement('canvas'); temp.width=640;temp.height=360;
const foreground = document.createElement('canvas'); foreground.width=640; foreground.height=360;
const tempCtx = temp.getContext('2d',{willReadFrequently:true});
function backdrop(ctx,w,h) {
  const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'#070d31');g.addColorStop(.6,'#4b2475');g.addColorStop(1,'#f39858');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  for(let i=0;i<60;i++){const x=(i*197)%w,y=(i*101)%h;ctx.fillStyle=`rgba(255,255,255,${.2+(i%4)*.16})`;ctx.fillRect(x,y,2,2)}
  ctx.fillStyle='#0b1731';ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(0,h*.8);ctx.lineTo(w*.23,h*.62);ctx.lineTo(w*.48,h*.82);ctx.lineTo(w*.7,h*.58);ctx.lineTo(w,h*.78);ctx.lineTo(w,h);ctx.fill();
}
function renderKey() {
  if(!keyActive || !cameraStream) return;
  const v=$('camera'),w=keyCanvas.width,h=keyCanvas.height;
  if(v.readyState >= 2) {
    tempCtx.drawImage(v,0,0,w,h);
    const pixels=tempCtx.getImageData(0,0,w,h);
    const d=pixels.data, tol=Number($('keyTolerance').value);
    for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; if(g>r+tol && g>b+tol*.75 && g>75)d[i+3]=0; }
    foreground.getContext('2d').putImageData(pixels,0,0);
    backdrop(keyCtx,w,h); keyCtx.drawImage(foreground,0,0);
  }
  cgiFrame=requestAnimationFrame(renderKey);
}
$('startKey').addEventListener('click', async () => {
  try { await startCamera(); if(!keyActive){keyActive=true;renderKey();} tell('keyStatus','Efecto activo. Si el fondo es verde, verás el paisaje digital.'); }
  catch(e){tell('keyStatus','No se pudo iniciar el efecto: '+e.message);}
});
$('stopKey').addEventListener('click', () => {stopCamera();keyCtx.clearRect(0,0,640,360);tell('keyStatus','Efecto detenido.');});
window.addEventListener('pagehide', () => {stopMood();stopCamera();if(micStream)micStream.getTracks().forEach(t=>t.stop());try{speechRecognizer?.abort();}catch{}});

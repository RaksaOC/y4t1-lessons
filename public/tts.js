/* Read aloud: reads a subject page out loud and highlights the sentence and word being spoken.
   Voices come from Gemini text-to-speech (the Interactions API, with your own API key), with the
   device's own voice as a fallback. The earlier Puter.js version is still here but switched off:
   set PROVIDER to "puter" to use it again. The page is turned into "reading units" first: formulas are
   spoken in words, tables are read row by row with their column names, figures read their caption
   (and, if you want, the image description), interactive demos and quizzes are announced, not read,
   and slide references, buttons and controls are skipped. */
(function(){
  "use strict";
  if(window.top!==window.self)return;
  var main=document.querySelector("main");if(!main)return;

  /* ================================================================ settings */
  var PROVIDER="gemini"; /* "gemini" (in use) or "puter" (kept, not used) */

  /* Gemini: https://aistudio.google.com/docs/speech-generation
     The API key is never written into this file, because the site is public. It comes from
     a key pasted into the options menu (kept in that browser only), or on localhost from
     tts-config.local.js, which git ignores:  window.STUDY_HUB_TTS={geminiKey:"..."}; */
  var GEMINI_URL="https://generativelanguage.googleapis.com/v1beta/interactions";
  var GEMINI_MODELS=[
    {id:"gemini-3.8-flash-lite-tts",name:"Fast",note:"Flash-Lite TTS. Starts quickly, costs less"},
    {id:"gemini-3.8-flash-tts",name:"Best",note:"Flash TTS. Most natural, a little slower"}
  ];
  var GEMINI_STYLE="clear, warm and steady, like a patient tutor";
  /* The voice menu lists the voices of whichever service is reading right now. Each service keeps
     its own choice (S.voices), so a part read by Gemini uses your Gemini pick, a part read by
     ElevenLabs your ElevenLabs pick, and the device voice your device pick.
     The names shown are ours; gvoice / eleven are what the service is actually sent. */
  var GEMINI_VOICES=[
    {id:"g-kore",name:"Clara",note:"Female, firm and clear",gvoice:"Kore"},
    {id:"g-sulafat",name:"Maya",note:"Female, warm",gvoice:"Sulafat"},
    {id:"g-erinome",name:"Iris",note:"Female, crisp",gvoice:"Erinome"},
    {id:"g-achernar",name:"Nina",note:"Female, soft",gvoice:"Achernar"},
    {id:"g-achird",name:"Leo",note:"Male, friendly",gvoice:"Achird"},
    {id:"g-charon",name:"Owen",note:"Male, lower and informative",gvoice:"Charon"},
    {id:"g-iapetus",name:"Ethan",note:"Male, clear",gvoice:"Iapetus"},
    {id:"g-sadaltager",name:"Theo",note:"Male, knowledgeable",gvoice:"Sadaltager"}
  ];
  var ELEVEN_VOICES=[
    {id:"e-sarah",name:"Sarah",note:"Female, American, calm",eleven:"EXAVITQu4vr4xnSDxMaL"},
    {id:"e-alice",name:"Alice",note:"Female, British, clear",eleven:"Xb7hH8MSUJpSbSDYk0k2"},
    {id:"e-lily",name:"Lily",note:"Female, British, warm",eleven:"pFZP5JQG7iQjIQuC4Bku"},
    {id:"e-matilda",name:"Matilda",note:"Female, American, friendly",eleven:"XrExE9yKIg1WjnnlVkGX"},
    {id:"e-george",name:"George",note:"Male, British, warm",eleven:"JBFqnCBsd6RMkjVDRZzb"},
    {id:"e-daniel",name:"Daniel",note:"Male, British, steady",eleven:"onwK4e9ZLuTAKqWW03F9"},
    {id:"e-brian",name:"Brian",note:"Male, American, deep",eleven:"nPczCjzI2devNBz1zQrb"},
    {id:"e-will",name:"Will",note:"Male, American, relaxed",eleven:"bIHbv24MWmeRgasZH58o"}
  ];
  var KEY_STORE="tts-gemini-key";
  var LOCAL=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if(LOCAL&&!window.STUDY_HUB_TTS){var cfg=document.createElement("script");cfg.src="tts-config.local.js";cfg.onerror=function(){cfg.remove();};document.head.appendChild(cfg);}
  function storedKey(){try{return localStorage.getItem(KEY_STORE)||"";}catch(e){return "";}}
  function localKey(){var c=window.STUDY_HUB_TTS;return LOCAL&&c&&typeof c.geminiKey==="string"?c.geminiKey.trim():"";}
  function apiKey(){return storedKey()||localKey();}

  /* ElevenLabs: a second voice service. Fast to start and returns the time of every character,
     so the word highlight is exact. Its free quota is small, so it is used for "Ask first" answers
     first, and for reading only while Gemini is busy. */
  var ELEVEN_STORE="tts-eleven-key",ELEVEN_MODEL="eleven_flash_v2_5",ELEVEN_DEFAULT="EXAVITQu4vr4xnSDxMaL";
  function storedEleven(){try{return localStorage.getItem(ELEVEN_STORE)||"";}catch(e){return "";}}
  function elevenKey(){var c=window.STUDY_HUB_TTS;return storedEleven()||(LOCAL&&c&&typeof c.elevenKey==="string"?c.elevenKey.trim():"");}
  /* each service rests for a while after it fails: a rate limit for a minute, a used-up quota for 12 hours */
  var REST={gemini:0,eleven:0};
  function keyTag(k){return k?k.slice(-6):"";}
  /* read when needed: the local key file may load after this script */
  function savedRest(){try{var er=JSON.parse(localStorage.getItem("tts-eleven-rest")||"null");return er&&er.k===keyTag(elevenKey())?+er.until||0:0;}catch(e){return 0;}}
  /* When the page is served by the study hub's own server (Next.js), the keys live there and
     requests go through /api; the browser never sees them. Otherwise keys come from the browser. */
  var SERVER=null,serverP=null;
  function checkServer(){
    if(!serverP)serverP=fetch("/api/health",{cache:"no-store"}).then(function(r){return r.ok?r.json():false;}).then(function(j){SERVER=j&&typeof j==="object"?j:false;return SERVER;},function(){SERVER=false;return false;});
    return serverP;
  }
  if(location.protocol!=="file:")checkServer();
  function onServer(p){return !!(SERVER&&SERVER[p]);}
  function hasKey(p){return onServer(p)||(p==="gemini"?!!apiKey():!!elevenKey());}
  function ready(p){return hasKey(p)&&Date.now()>=Math.max(REST[p],p==="eleven"?savedRest():0);}
  function rest(p,e){
    var ms=15000,m=/retry in ([\d.]+)\s*s/i.exec(errText(e));
    if(e&&e.quota)ms=12*3600e3;else if(e&&e.status===429)ms=m?Math.ceil(+m[1]*1000)+500:60000;else if(e&&e.auth)ms=3600e3;
    REST[p]=Date.now()+ms;
    if(p==="eleven")try{localStorage.setItem("tts-eleven-rest",JSON.stringify({k:keyTag(elevenKey()),until:REST[p]}));}catch(x){}
  }

  /* Puter (not used while PROVIDER is "gemini") */
  var PUTER_VOICES=[
    {id:"ruth",name:"Ruth",note:"Most natural. AWS Polly generative",opts:{provider:"aws-polly",voice:"Ruth",engine:"generative",language:"en-US"}},
    {id:"matthew",name:"Matthew",note:"Natural male voice. AWS Polly generative",opts:{provider:"aws-polly",voice:"Matthew",engine:"generative",language:"en-US"}},
    {id:"joanna",name:"Joanna",note:"Fastest to start. AWS Polly neural",opts:{provider:"aws-polly",voice:"Joanna",engine:"neural",language:"en-US"}},
    {id:"nova",name:"Nova",note:"Teacher-like tone. OpenAI",opts:{provider:"openai",model:"gpt-4o-mini-tts",voice:"nova",instructions:"You are a friendly, clear university tutor reading study notes aloud. Speak at a steady pace and pause briefly between ideas."}},
    {id:"device",name:"Device voice",note:"Works offline. Exact word highlight, robotic voice",device:true}
  ];
  var VOICES=PROVIDER==="gemini"?GEMINI_VOICES:PUTER_VOICES;
  var FALLBACK_VOICE={id:"joanna-fallback",opts:{provider:"aws-polly",voice:"Joanna",engine:"neural",language:"en-US"}};
  var DEFAULTS={voice:PROVIDER==="gemini"?"g-kore":"ruth",gmodel:GEMINI_MODELS[0].id,rate:1,alt:true,tables:true,formulas:true,follow:true};
  var KEY="tts-settings";
  var S=Object.assign({},DEFAULTS);
  try{var saved=JSON.parse(localStorage.getItem(KEY)||"null");if(saved&&typeof saved==="object")Object.assign(S,saved);}catch(e){}
  if(!VOICES.some(function(v){return v.id===S.voice;}))S.voice=DEFAULTS.voice;
  S.voices=Object.assign({gemini:GEMINI_VOICES.some(function(v){return v.id===S.voice;})?S.voice:"g-kore",eleven:"e-sarah",device:""},S.voices&&typeof S.voices==="object"?S.voices:{});
  /* fixed rules: formulas in words, tables row by row, picture descriptions, follow along; Gemini Flash-Lite */
  Object.assign(S,{alt:true,tables:true,formulas:true,follow:true,gmodel:GEMINI_MODELS[0].id});
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
  function pick(list,id){for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];return list[0];}
  function gVoice(){return pick(GEMINI_VOICES,S.voices.gemini);}
  function eVoice(){return pick(ELEVEN_VOICES,S.voices.eleven);}
  /* Gemini mode: the current Gemini voice (never the device one; the device voice is chosen apart) */
  function voice(){return PROVIDER==="gemini"?gVoice():pick(VOICES,S.voice);}

  /* ================================================================ text to speech wording */
  var DIGIT=["zero","one","two","three","four","five","six","seven","eight","nine"];
  var GREEK_CHAR={"α":"alpha","β":"beta","γ":"gamma","δ":"delta","Δ":"delta","ε":"epsilon","θ":"theta","λ":"lambda","μ":"mu","π":"pi","ρ":"rho","σ":"sigma","Σ":"sigma","τ":"tau","φ":"phi","ϕ":"phi","χ":"chi","ψ":"psi","Ψ":"psi","ω":"omega","Ω":"omega","η":"eta"};
  var SUP={"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁻":"minus ","ⁿ":"n"};
  function spellKet(x){
    x=String(x).trim();
    if(/^[01]+$/.test(x))return x.split("").map(function(d){return DIGIT[+d];}).join(" ");
    if(x==="+")return "plus";if(x==="-"||x==="−")return "minus";
    return x.replace(/[ψφ]/g,function(c){return GREEK_CHAR[c];});
  }
  function power(p){
    if(p==="2")return " squared";if(p==="3")return " cubed";
    if(/^\d+$/.test(p))return " to the power "+p;
    return " to the "+p;
  }

  /* Plain text rules. Each returns the spoken form of what it matched. `s` is the whole source, `i` the match start. */
  var RULES=[
    [/\\\((.+?)\\\)/y,function(m){return " "+tex(m[1])+" ";}],
    [/\\\[(.+?)\\\]/y,function(m){return " "+tex(m[1])+" ";}],
    [/\|([0-9+\-−]{1,10}|[A-Za-zψφ]{1,4})⟩/y,function(m){return "ket "+spellKet(m[1]);}],
    [/⟨([^|⟩]{1,10})\|([^⟩]{1,10})⟩/y,function(m){return "bra "+spellKet(m[1])+" ket "+spellKet(m[2]);}],
    [/⟨([^|⟩]{1,10})\|/y,function(m){return "bra "+spellKet(m[1]);}],
    [/\be\.g\.,?/y,"for example,"],[/\bi\.e\.,?/y,"that is,"],[/\bvs\.?(?=\s)/y,"versus"],[/\bapprox\.(?=\s)/y,"approximately"],
    [/\bm²/y," square metres"],[/\bcm²/y," square centimetres"],
    [/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+/y,function(m){var p=m[0].split("").map(function(c){return SUP[c];}).join("");return power(p)+" ";}],
    [/\s?–\s?/y,function(m,s,i){var a=s.charAt(i-1),b=s.charAt(i+m[0].length);return /\d/.test(a)&&/\d/.test(b)?" to ":m[0]==="–"&&/[A-Za-z]/.test(a)&&/[A-Za-z]/.test(b)?" ":", ";}],
    [/(\d)\^(-?\d+)/y,function(m){return m[1]+" to the power "+m[2];}],
    [/\s?—\s?/y,", "],[/\s?·\s?/y,", "],
    [/×/y,function(m,s,i){var a=s.charAt(i-1),b=s.charAt(i+1);return /[A-Za-z0-9]/.test(a)&&/[A-Za-z0-9]/.test(b)?" by ":" times ";}],
    [/→/y," to "],[/⇒/y," implies "],[/←/y," from "],[/↔/y," both ways "],[/≈/y," about "],[/≤/y," at most "],[/≥/y," at least "],[/≠/y," not equal to "],
    [/±/y," plus or minus "],[/⊕/y," x-or "],[/⊗/y," tensor "],[/∞/y," infinity "],[/√/y," root "],[/∑/y," the sum of "],[/∈/y," in "],[/∝/y," proportional to "],
    [/≡/y," equivalent to "],[/°/y," degrees"],[/\s=\s/y," equals "],[/\s<\s/y," is less than "],[/\s>\s/y," is greater than "],[/∧/y," and "],[/∨/y," or "],[/¬/y," not "],[/−/y," minus "],
    [/[αβγδΔεθλμπρσΣτφϕχψΨωΩη]/y,function(m){return " "+GREEK_CHAR[m[0]]+" ";}],
    [/&/y," and "],[/\s\/\s/y," or "],[/~(?=\d)/y,"about "],[/…/y,"..."],
    [/[★☆●○▶◀▲▼▴▾◐↗✓✗✔✘⟶]/y," "],[/ /y," "]
  ];
  var CODE_RULES=[
    [/\(\)/y,""],[/==/y," equals "],[/!=/y," not equal to "],[/->|=>/y," to "],
    [/(?<=\w)\.(?=\w)/y," dot "],[/_/y," "],[/\//y," slash "],[/[`#*]/y," "]
  ];
  /* Turns `src` into spoken text and records, for every spoken character, which source characters it came from. */
  function transform(src,rules){
    var out="",from=[],to=[],i=0,n=src.length;
    outer:while(i<n){
      for(var r=0;r<rules.length;r++){
        var re=rules[r][0];re.lastIndex=i;var m=re.exec(src);
        if(m&&m[0].length){
          var rep=typeof rules[r][1]==="function"?rules[r][1](m,src,i):rules[r][1],end=i+m[0].length;
          for(var k=0;k<rep.length;k++){out+=rep[k];from.push(i);to.push(end);}
          i=end;continue outer;
        }
      }
      out+=src[i];from.push(i);to.push(i+1);i++;
    }
    return {text:out,from:from,to:to};
  }
  function plain(s){return transform(s,RULES).text.replace(/\s+/g," ").trim();}

  /* ---------------------------------------------------------------- TeX to words */
  var GREEK={alpha:"alpha",beta:"beta",gamma:"gamma",delta:"delta",epsilon:"epsilon",varepsilon:"epsilon",zeta:"zeta",eta:"eta",theta:"theta",vartheta:"theta",iota:"iota",kappa:"kappa",lambda:"lambda",mu:"mu",nu:"nu",xi:"xi",pi:"pi",varpi:"pi",rho:"rho",varrho:"rho",sigma:"sigma",varsigma:"sigma",tau:"tau",upsilon:"upsilon",phi:"phi",varphi:"phi",chi:"chi",psi:"psi",omega:"omega",
    Gamma:"capital gamma",Delta:"delta",Theta:"capital theta",Lambda:"capital lambda",Xi:"capital xi",Pi:"capital pi",Sigma:"capital sigma",Phi:"capital phi",Psi:"capital psi",Omega:"capital omega",ell:"l",hbar:"h bar",imath:"i",jmath:"j"};
  var OPS={"=":"equals","+":"plus","-":"minus","<":"is less than",">":"is greater than",pm:"plus or minus",mp:"minus or plus",times:"times",cdot:"times",div:"divided by",
    le:"is at most",leq:"is at most",leqslant:"is at most",ge:"is at least",geq:"is at least",geqslant:"is at least",ne:"is not equal to",neq:"is not equal to",approx:"is approximately",sim:"is about",simeq:"is about",cong:"is congruent to",
    equiv:"is equivalent to",propto:"is proportional to",to:"to",rightarrow:"to",longrightarrow:"to",Rightarrow:"implies",implies:"implies",Longrightarrow:"implies",leftarrow:"gets",gets:"gets",
    leftrightarrow:"if and only if",Leftrightarrow:"if and only if",iff:"if and only if",mapsto:"maps to",in:"in",notin:"not in",subset:"subset of",subseteq:"subset of",cup:"union",cap:"intersect",setminus:"minus",
    otimes:"tensor",oplus:"x-or",ll:"is much less than",gg:"is much greater than",mid:"given",land:"and",lor:"or",wedge:"and",vee:"or",neg:"not",lnot:"not",circ:"composed with",ast:"star",star:"star",
    forall:"for all",exists:"there exists",cdots:"and so on",ldots:"and so on",dots:"and so on",vdots:"and so on",ddots:" ",infty:"infinity",partial:"partial",nabla:"gradient of",dagger:"dagger",prime:"prime",
    perp:"perpendicular to",lt:"is less than",gt:"is greater than",nexists:"there is no",parallel:"parallel to",checkmark:"check",colon:":",vert:"given",lvert:"",rvert:"",cdotp:"times",bullet:"times",emptyset:"the empty set",varnothing:"the empty set",angle:"angle",triangle:"triangle"};
  var FUN={sin:"sine",cos:"cosine",tan:"tangent",cot:"cotangent",sec:"secant",csc:"cosecant",arcsin:"arc sine",arccos:"arc cosine",arctan:"arc tangent",sinh:"hyperbolic sine",cosh:"hyperbolic cosine",tanh:"tanh",
    log:"log",ln:"natural log",lg:"log",exp:"exp",det:"the determinant of",gcd:"the g c d of",lcm:"the l c m of",Pr:"the probability",tr:"the trace of",Tr:"the trace of",mod:"mod",bmod:"mod",pmod:"mod",rank:"the rank of",dim:"the dimension of",deg:"the degree of",sgn:"the sign of",
    max:"max",min:"min",argmax:"arg max",argmin:"arg min",sup:"sup",inf:"inf",lim:"limit"};
  var BIG={sum:"the sum",prod:"the product",int:"the integral",iint:"the double integral",oint:"the integral",bigcup:"the union",bigcap:"the intersection",bigoplus:"the x-or",bigotimes:"the tensor product"};
  var TEXTY={text:1,textrm:1,textbf:1,textit:1,textsf:1,texttt:1,mbox:1,hbox:1,textnormal:1};
  var FONT={mathrm:1,mathbf:1,mathit:1,mathsf:1,mathtt:1,mathcal:1,mathbb:1,mathfrak:1,mathscr:1,boldsymbol:1,bm:1,operatorname:1,mathop:1,mathbin:1,mathrel:1,mathord:1,displaystyle:0};
  var ACCENT={hat:"hat",widehat:"hat",bar:"bar",overline:"bar",vec:"vector",tilde:"tilde",widetilde:"tilde",dot:"dot",ddot:"double dot",underline:""};

  function tex(src){
    try{
      var s=String(src)
        .replace(/\\(text|textrm|textbf|textit|textsf|mbox|hbox|mathrm|operatorname)\s*\{([^{}]*)\}/g,function(m,c,b){return "\\"+c+"{"+b.replace(/ /g,"~")+"}";})
        .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg|displaystyle|textstyle|limits|nolimits|middle)(?![a-zA-Z])/g," ")
        .replace(/\{,\}/g,",")
        .replace(/\\langle\s*([^|]*?)\s*\|\s*([^|]*?)\s*\\rangle/g,"\\braket{$1}{$2}")
        .replace(/\|\s*([^|]*?)\s*\\rangle/g,"\\ket{$1}")
        .replace(/\\langle\s*([^|]*?)\s*\|/g,"\\bra{$1}")
        .replace(/\\\|([^|]+?)\\\|/g,"\\norm{$1}")
        .replace(/\|([^|]+?)\|/g,"\\abs{$1}")
        .replace(/\\lvert([\s\S]+?)\\rvert/g,"\\abs{$1}")
        .replace(/\\lVert([\s\S]+?)\\rVert/g,"\\norm{$1}");
      return tidy(speakToks(tokenize(s)));
    }catch(e){return plain(String(src).replace(/\\[a-zA-Z]+/g," ").replace(/[{}^_]/g," "));}
  }
  /* letter runs that are names, not products of single letters */
  var WORDS={avgdl:"average document length",var:"variance",rel:"rel",new:"new",old:"old",min:"min",max:"max",opt:"opt",amp:"amp",total:"total",fail:"fail",success:"success",train:"train",test:"test",pred:"predicted",true:"true",false:"false",mean:"mean",std:"standard deviation",avg:"average",score:"score",sim:"similarity",dist:"distance",loss:"loss",cost:"cost",err:"error",acc:"accuracy",out:"out",in:"in",hidden:"hidden",query:"query",doc:"doc"};
  function tokenize(s){
    var t=[],re=/\\([a-zA-Z]+)|\\(.)|(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)|([a-zA-Z]+)|(\s+)|([\s\S])/g,m;
    while((m=re.exec(s))){
      if(m[1])t.push({k:"cmd",v:m[1]});
      else if(m[2]!==undefined){if(",;:! ".indexOf(m[2])<0)t.push({k:"esc",v:m[2]});}
      else if(m[3])t.push({k:"num",v:m[3]});
      else if(m[4]){
        if(m[4].length>1&&WORDS.hasOwnProperty(m[4]))t.push({k:"word",v:m[4]});
        else for(var q=0;q<m[4].length;q++)t.push({k:"let",v:m[4][q]});
      }
      else if(m[5]);
      else t.push({k:"ch",v:m[6]});
    }
    return t;
  }
  function tidy(s){return s.replace(/\s+/g," ").replace(/\s+([,.;:])/g,"$1").replace(/([,;:])(?:\s*[,;:])+/g,"$1").replace(/^[\s,;:]+|[\s,;:]+$/g,"").trim();}
  function rawOf(toks){return toks.map(function(t){return t.k==="cmd"?"\\"+t.v:t.v;}).join("");}

  function speakToks(toks){
    var i=0;
    function peek(o){return toks[i+(o||0)];}
    function isV(t,v){return t&&t.k!=="cmd"&&t.k!=="esc"&&t.v===v;}
    function isC(t,v){return t&&t.k==="cmd"&&t.v===v;}
    /* everything up to the matching closer */
    function until(close){
      var start=i,depth=0,pd=0,open=close===")"?"(":close==="]"?"[":null;
      while(i<toks.length){
        var t=toks[i];
        if(isV(t,"{"))depth++;
        else if(isV(t,"}")){if(depth===0&&close==="}"){i++;return toks.slice(start,i-1);}depth--;}
        else if(depth===0&&open&&isV(t,open))pd++;
        else if(depth===0&&isV(t,close)){if(pd===0){i++;return toks.slice(start,i-1);}pd--;}
        i++;
      }
      return toks.slice(start);
    }
    function group(){
      var t=toks[i];
      if(!t)return [];
      if(isV(t,"{")){i++;return until("}");}
      i++;
      if(t.k==="num"&&t.v.length>1&&/^\d+$/.test(t.v)){toks.splice(i,0,{k:"num",v:t.v.slice(1)});return [{k:"num",v:t.v[0]}];}
      return [t];
    }
    function sub(ts){return speakToks(ts.slice());}
    function count(ts){var n=0,d=0;ts.forEach(function(t){if(isV(t,"{"))d++;else if(isV(t,"}"))d--;else if(d===0)n++;});return n;}
    function simple(ts){return count(ts)<=1||(ts.length===2&&isC(ts[0],"sqrt"));}
    function inKet(ts){var r=rawText(ts).replace(/\s+/g,"");return /^([01]+|[+\-])$/.test(r)?spellKet(r):sub(ts);}
    function rawText(ts){return rawOf(ts).replace(/\\[,;:!]|~/g," ").replace(/\\([{}%$&#_])/g,"$1");}

    function env(name){
      var start=i,depth=0;
      while(i<toks.length){
        if(isC(toks[i],"begin"))depth++;
        if(isC(toks[i],"end")){if(depth===0)break;depth--;}
        i++;
      }
      var body=toks.slice(start,i);
      if(isC(toks[i],"end")){i++;group();}
      var rows=[[[]]],d=0;
      body.forEach(function(t){
        if(isV(t,"{")||isC(t,"begin"))d++;if(isV(t,"}")||isC(t,"end"))d--;
        if(d===0&&t.k==="esc"&&t.v==="\\"){rows.push([[]]);return;}
        if(d===0&&isV(t,"&")){rows[rows.length-1].push([]);return;}
        var r=rows[rows.length-1];r[r.length-1].push(t);
      });
      rows=rows.filter(function(r){return r.some(function(c){return c.length;});});
      var cells=rows.map(function(r){return r.map(function(c){return sub(c);});});
      if(/matrix$/.test(name)){
        var det=name==="vmatrix"?"the determinant of ":"";
        if(cells.every(function(r){return r.length===1;}))return det+"the column vector "+cells.map(function(r){return r[0];}).join(", ")+",";
        if(cells.length===1)return det+"the row vector "+cells[0].join(", ")+",";
        return det+"the "+cells.length+" by "+cells[0].length+" matrix: "+cells.map(function(r,k){return "row "+(k+1)+": "+r.join(", ");}).join("; ")+";";
      }
      if(name==="cases")return "which is: "+cells.map(function(r){return r[0]+(r[1]?" "+r[1].replace(/^if\s+/i,"if ").replace(/^(?!if|otherwise)/i,"when "):"");}).join("; ")+";";
      return cells.map(function(r){return r.join(" ");}).join(". ")+".";
    }

    /* one thing to say, before any ^ or _ */
    function primary(){
      var t=toks[i++];if(!t)return null;
      if(t.k==="num")return {s:t.v,num:true};
      if(t.k==="let")return {s:t.v==="a"?"A":t.v,letter:true};
      if(t.k==="word")return {s:WORDS[t.v],fn:true};
      if(t.k==="esc"){
        if(t.v==="\\")return {s:".",sep:true};
        if(t.v==="{"||t.v==="}")return {s:""};
        if(t.v==="%")return {s:"percent"};
        if(t.v==="#")return {s:"the number of"};
        if(t.v==="|")return {s:"given",op:true};
        return {s:"",skip:true};
      }
      if(t.k==="ch"){
        var v=t.v;
        if(v==="{"){var g=until("}");return {s:sub(g),group:true,simple:simple(g),raw:rawOf(g)};}
        if(v==="("||v==="["){var close=v==="("?")":"]",inner=until(close);return {s:sub(inner),paren:true,simple:simple(inner)};}
        if(OPS[v])return {s:OPS[v],op:true,minus:v==="-"};
        if(v==="−")return {s:"minus",op:true,minus:true};
        if(v===",")return {s:",",sep:true};
        if(v===":"&&isV(peek(),"=")){i++;return {s:"becomes",op:true};}
        if(v==="@")return {s:"at"};
        if(v===";"||v===":")return {s:v,sep:true};
        if(v==="&"||v==="~"||v==="}"||v===")"||v==="]")return {s:"",skip:true};
        if(v==="|")return {s:"given",op:true};
        if(v==="!")return {s:"factorial"};
        if(v==="'")return {s:"prime"};
        if(v==="%")return {s:"percent"};
        if(v==="*")return {s:"star"};
        if(v==="/")return {s:"over",op:true};
        if(GREEK_CHAR[v])return {s:GREEK_CHAR[v]};
        return {s:plain(v)};
      }
      var c=t.v;
      if(GREEK[c])return {s:GREEK[c],letter:true};
      if(c==="frac"||c==="tfrac"||c==="dfrac"||c==="cfrac"){
        var a=group(),b=group(),ra=rawOf(a),rb=rawOf(b),sa=sub(a),sb=sub(b);
        if(ra==="1"&&rb==="2")return {s:"one half"};
        if(ra==="1"&&rb==="4")return {s:"one quarter"};
        if(simple(a)&&simple(b))return {s:sa+" over "+sb};
        return {s:"the fraction "+sa+", over "+sb+",",big:true};
      }
      if(c==="sqrt"){
        var n=null;if(isV(peek(),"[")){i++;n=until("]");}
        var x=group(),sx=sub(x),root=n?(rawOf(n)==="3"?"cube root":rawOf(n)+"th root"):"square root";
        if(simple(x))return {s:(n?"the "+root+" of ":"root ")+sx};
        return {s:"the "+root+" of "+sx+",",big:true};
      }
      if(TEXTY[c]){var tx=plain(rawText(group()));return {s:tx,fn:/^[A-Za-z][A-Za-z0-9]+$/.test(tx)};}
      if(FONT[c]){var fg=group(),fr=rawText(fg).trim();return /^[A-Za-z]{2,}$/.test(fr)?{s:FUN[fr]||fr,fn:true}:{s:sub(fg)};}
      if(ACCENT[c]!==undefined){var ag=group();return {s:sub(ag)+(ACCENT[c]?" "+ACCENT[c]:"")};}
      if(c==="ket")return {s:"ket "+inKet(group())};
      if(c==="bra")return {s:"bra "+inKet(group())};
      if(c==="braket"){var p=group(),q=group();return {s:"bra "+inKet(p)+" ket "+inKet(q)};}
      if(c==="abs"){var ab=group();return {s:"the absolute value of "+sub(ab)+",",absv:true};}
      if(c==="norm"){var nb=group();return {s:"the norm of "+sub(nb)+",",absv:true};}
      if(c==="lfloor")return {s:"the floor of"};
      if(c==="lceil")return {s:"the ceiling of"};
      if(c==="rfloor"||c==="rceil")return {s:",",sep:true};
      if(c==="xrightarrow"||c==="xleftarrow"){group();return {s:c==="xrightarrow"?"goes to":"comes from",op:true};}
      if(c==="binom"||c==="tbinom"||c==="dbinom"){var n1=group(),k1=group();return {s:sub(n1)+" choose "+sub(k1)};}
      if(c==="begin"){var nm=rawText(group());return {s:env(nm),big:true,env:true};}
      if(c==="end"){group();return {s:"",skip:true};}
      if(c==="quad"||c==="qquad")return {s:",",sep:true};
      if(c==="text"||c==="label"||c==="tag"){group();return {s:"",skip:true};}
      if(c==="not"){var nt=primary();return {s:"not "+(nt?nt.s:"")};}
      if(c==="arg"&&isC(peek(),"max")){i++;c="argmax";}
      if(c==="arg"&&isC(peek(),"min")){i++;c="argmin";}
      if(BIG[c]||c==="lim"||c==="max"||c==="min"||c==="argmax"||c==="argmin"||c==="sup"||c==="inf"){
        var lo=null,hi=null;
        for(var k=0;k<2;k++){
          if(isV(peek(),"_")){i++;lo=group();}
          else if(isV(peek(),"^")){i++;hi=group();}
        }
        if(BIG[c]){
          var lead=BIG[c];
          if(lo&&hi)return {s:lead+" from "+sub(lo)+" to "+sub(hi)+" of",lead:true};
          if(lo)return {s:lead+" over "+sub(lo)+" of",lead:true};
          return {s:lead+" of",lead:true};
        }
        if(c==="lim")return {s:"the limit"+(lo?" as "+sub(lo).replace(/ to /," goes to "):"")+" of",lead:true};
        return {s:"the "+FUN[c]+(lo?" over "+sub(lo):"")+" of",lead:true};
      }
      if(FUN[c])return {s:FUN[c],fn:true,lead:/ of$/.test(FUN[c])};
      if(OPS[c]!==undefined)return {s:OPS[c],op:!/^(and so on|infinity|partial|dagger|prime|h bar)$/.test(OPS[c])};
      if(c==="mathbb")return {s:sub(group())};
      return {s:c};
    }

    var parts=[],prevOp=true;
    function apply(a){
      /* f(x) reads as "f of x" */
      if(!isV(peek(),"("))return a;
      i++;var arg=until(")");if(!arg.length)return a;
      return {s:a.s+(/ of$/.test(a.s)?" ":" of ")+sub(arg)+(simple(arg)?"":",")};
    }
    while(i<toks.length){
      var a=primary();if(!a)break;
      if(a.skip)continue;
      var isFn=a.fn||(a.letter&&/^[fghpqrwPJLEFGQRTUVONCMSKDW]$/.test(a.s));
      /* superscripts, subscripts, primes */
      for(;;){
        var nx=peek();
        if(isV(nx,"^")){
          i++;var e=group(),re=rawOf(e).replace(/\s+/g,""),se=sub(e),word;
          if(re==="2")word="squared";else if(re==="3")word="cubed";else if(re==="T"||re==="\\top"||re==="\\intercal")word="transpose";
          else if(re==="\\dagger"||re==="†")word="dagger";else if(re==="*"||re==="\\ast")word="star";else if(re==="-1")word="inverse";
          else if(re==="\\circ")word="degrees";else if(re==="\\prime"||re==="'")word="prime";else if(re==="\\otimesn"||re==="\\otimes{n}")word="tensor n";
          else if(simple(e))word=(/^\d+$/.test(re)?"to the power ":"to the ")+se;
          else word="to the power "+se+",";
          if(re==="+")word="plus";else if(re==="-")word="minus";else if(re==="\\pm")word="plus or minus";
          if((a.paren||a.big)&&word!=="degrees"&&word!=="prime")a={s:"the quantity "+a.s+", "+word};
          else a={s:a.s+" "+word,fn:a.fn};
          continue;
        }
        if(isV(nx,"_")){
          i++;var b=group(),sb=sub(b),rb=rawOf(b);
          if(/^\d+$/.test(rb))a={s:a.s+" "+sb,fn:a.fn};
          else if(simple(b))a={s:a.s+" sub "+sb,fn:a.fn};
          else a={s:a.s+" sub "+sb+",",fn:a.fn};
          continue;
        }
        if(isV(nx,"'")){i++;a={s:a.s+" prime",fn:a.fn};continue;}
        if(isV(nx,"!")){i++;a=(a.paren||a.big)?{s:"the quantity "+a.s+", factorial"}:{s:a.s+" factorial"};continue;}
        break;
      }
      if(isFn&&!a.op)a=apply(a);
      if(a.paren&&!a.simple&&isV(peek(),"/"))a={s:"the quantity "+a.s+",",paren:false};
      if(a.minus&&prevOp)a={s:"negative",op:false};
      if(a.paren&&!prevOp&&parts.length&&!/^the quantity/.test(a.s))a={s:a.simple?"times "+a.s:"times the quantity "+a.s+","};
      if(a.env&&!prevOp&&parts.length)a={s:"times "+a.s};
      parts.push(a.s);
      prevOp=!!(a.op||a.sep||a.lead);
    }
    return parts.join(" ");
  }

  /* ================================================================ reading units */
  var SKIP=".refs,.ref,.legend,.slidebar,.dl,.tts-ui,.tts-here,script,style,noscript,svg,canvas,button,input,select,textarea,label.ctl,.readout,.msg,.player,.tabs,.svgwrap,.progress-pill,nav,.toc,.flipnav,.qnav,mjx-assistive-mml,[aria-hidden=\"true\"],template";
  var BLOCKS="P,H1,H2,H3,H4,H5,H6,UL,OL,LI,TABLE,FIGURE,PRE,BLOCKQUOTE,DIV,SECTION,HEADER,FOOTER,ARTICLE,DL,DT,DD,DETAILS,SUMMARY,FIGCAPTION,FORM,FIELDSET,ASIDE,HR".split(",");
  var texOf=new Map();
  function readTex(){
    texOf=new Map();
    try{var d=window.MathJax&&MathJax.startup&&MathJax.startup.document;if(d&&d.math)for(var it of d.math)if(it.typesetRoot)texOf.set(it.typesetRoot,it.math);}catch(e){}
  }
  function hidden(el){return !el.getClientRects().length;}
  function isBlock(el){return BLOCKS.indexOf(el.tagName)>=0||(el.matches&&el.matches("mjx-container[display=\"true\"]"));}
  function hasBlockKids(el){for(var c=el.firstElementChild;c;c=c.nextElementSibling)if(isBlock(c)&&!c.matches(SKIP))return true;return false;}

  /* A unit collects pieces: real text (mapped to a text node), a whole element (a formula) or added words. */
  function Unit(el,kind){this.el=el;this.kind=kind;this.text="";this.pieces=[];this.pi=[];this.f=[];this.t=[];}
  Unit.prototype.add=function(spoken,piece,from,to){
    var idx=this.pieces.push(piece)-1;
    for(var k=0;k<spoken.length;k++){
      var ch=spoken[k];if(/\s/.test(ch))ch=" ";
      if(ch===" "&&(!this.text.length||this.text[this.text.length-1]===" "))continue;
      this.text+=ch;this.pi.push(idx);this.f.push(from?from[k]:0);this.t.push(to?to[k]:0);
    }
  };
  Unit.prototype.say=function(words){
    if(/^[.,;:!?]+$/.test(words)){this.text=this.text.replace(words===","?/ $/:/[ ,]+$/,"");while(this.pi.length>this.text.length){this.pi.pop();this.f.pop();this.t.pop();}this.add(words+" ",{v:true});}
    else if(/^[.,;:!?]/.test(words)){this.text=this.text.replace(/ +$/,"");while(this.pi.length>this.text.length){this.pi.pop();this.f.pop();this.t.pop();}this.add(words+" ",{v:true});}
    else this.add(" "+words+" ",{v:true});
  };
  Unit.prototype.textNode=function(node,code){
    var r=transform(node.nodeValue,code?CODE_RULES:RULES);this.add(r.text,{node:node},r.from,r.to);
  };
  Unit.prototype.elem=function(el,words){this.add(" "+words+" ",{el:el});};
  Unit.prototype.stop=function(){if(this.text&&!/[.!?:;…]["'”’)]*\s*$/.test(this.text))this.say(".");};
  Unit.prototype.end=function(){
    this.text=this.text.replace(/\s+$/,"");
    while(this.pi.length>this.text.length){this.pi.pop();this.f.pop();this.t.pop();}
    if(this.text&&!/[.!?:;…]["'”’)]*$/.test(this.text))this.say(".");
    this.text=this.text.replace(/\s+$/,"");
    while(this.pi.length>this.text.length){this.pi.pop();this.f.pop();this.t.pop();}
    return /[A-Za-z0-9]/.test(this.text);
  };

  function mathWords(el){
    var t=texOf.get(el);
    if(t)return tex(t);
    var a=el.querySelector("mjx-assistive-mml");
    return plain(a?a.textContent:el.textContent);
  }
  /* Inline content of `el` into unit `u`. `stopAtBlocks`: leave nested lists, tables and so on for the walker. */
  function collect(el,u,o){
    o=o||{};
    for(var n=el.firstChild;n;n=n.nextSibling){
      if(n.nodeType===3){u.textNode(n,o.code);continue;}
      if(n.nodeType!==1)continue;
      var tag=n.tagName;
      if(tag==="MJX-CONTAINER"){u.elem(n,S.formulas||n.getAttribute("display")!=="true"?mathWords(n):"a formula");continue;}
      if(n.matches(SKIP))continue;
      if(o.stopAtBlocks&&(tag==="UL"||tag==="OL"||tag==="TABLE"||tag==="PRE"||tag==="FIGURE"||(tag==="DIV"&&hasBlockKids(n))||n.classList.contains("math")||n.classList.contains("tbl")))continue;
      if(tag==="BR"){u.say(",");continue;}
      if(tag==="IMG"){if(S.alt&&n.alt)u.elem(n,"("+n.alt+")");continue;}
      if(tag==="CODE"||tag==="KBD"||tag==="SAMP"){collect(n,u,{code:true,stopAtBlocks:o.stopAtBlocks});continue;}
      if(o.pipe&&tag==="I"){u.say(", then");continue;}
      if(tag==="SUP"){var st=n.textContent.trim();u.say(st==="2"?"squared":st==="3"?"cubed":"to the "+st);continue;}
      if(tag==="SUB"){u.say("sub");collect(n,u,o);continue;}
      var disp=isBlock(n)?"block":tag==="SPAN"?getComputedStyle(n).display:"inline";
      var blocky=disp!=="inline"&&disp!=="contents";
      if(blocky&&u.text.length&&!/\s$/.test(u.text))u.say("");
      var before=u.text.length;
      collect(n,u,o);
      if(blocky&&u.text.length>before&&!/[.!?:;,]\s*$/.test(u.text))u.say(",");
    }
  }

  var units=[],unitOf=new Map(),section="";
  function push(u,sec){if(u.end()){u.sec=sec===undefined?section:sec;unitOf.set(u.el,units.length);units.push(u);}}
  function unitFrom(el,kind,lead,opts){var u=new Unit(el,kind);if(lead)u.say(lead);collect(el,u,opts);push(u);return u;}
  function headingText(el){var c=el.cloneNode(true);c.querySelectorAll(SKIP).forEach(function(x){x.remove();});return c.textContent.replace(/\s+/g," ").trim();}

  function table(wrap,tbl){
    var head=[].map.call(tbl.querySelectorAll("thead th, thead td"),function(c){return plain(c.textContent);});
    var rows=[].filter.call(tbl.querySelectorAll("tbody tr, :scope > tr"),function(r){return !hidden(r);});
    if(!rows.length&&!head.length)return;
    var intro=new Unit(wrap,"table"),named=head.filter(Boolean);
    intro.say("A table"+(rows.length?" with "+rows.length+(rows.length===1?" row":" rows"):"")+(named.length?". Its columns are "+(named.length>1?named.slice(0,-1).join(", ")+" and "+named[named.length-1]:named[0]):"")+".");
    push(intro);
    if(!S.tables){var skip=new Unit(wrap,"table");skip.say("Its rows are on the page.");push(skip);return;}
    rows.forEach(function(r){
      var u=new Unit(r,"row"),cells=[].slice.call(r.children);
      cells.forEach(function(c,k){
        if(!c.textContent.trim()&&!c.querySelector("mjx-container,img"))return;
        if(k>0&&head[k])u.say(head[k]+":");
        collect(c,u);
        u.say(k===0&&cells.length>1?".":k===cells.length-1?".":";");
      });
      push(u);
    });
  }
  function figure(f){
    var cap=f.querySelector("figcaption"),img=f.querySelector("img"),u=new Unit(f,"figure");
    u.say("Figure.");
    if(cap)collect(cap,u);
    u.stop();
    if(S.alt&&img&&img.alt){var alt=plain(img.alt).replace(/^[A-Z](?=[a-z])/,function(w){return w.toLowerCase();});u.elem(img,"The picture shows "+alt+(/[.!?]$/.test(alt)?"":"."));}
    push(u);
  }
  function code(pre){
    if(pre.classList.contains("out"))return;
    var lines=pre.textContent.replace(/\s+$/,"").split("\n").length,u=new Unit(pre,"code");
    if(!pre.textContent.trim())return;
    u.say("A code example, "+lines+(lines===1?" line":" lines")+", is shown on the page.");
    push(u);
  }
  function lab(l){
    var head=l.querySelector(".lab-head"),tag=head&&head.querySelector(".tag"),h=head&&head.querySelector("h4,h3"),body=l.querySelector(".lab-body");
    var nb=l.classList.contains("nb")||(tag&&/lab|notebook/i.test(tag.textContent)&&!/try/i.test(tag.textContent));
    var u=new Unit(head||l,"lab");
    if(nb){u.say((tag?tag.textContent.trim():"In the lab")+":");if(h)collect(h,u);push(u);if(body)walk(body,{inLab:true});}
    else{u.say("Interactive demo:");if(h)collect(h,u);u.stop();u.say("Try it on the page.");push(u);if(body)walk(body,{inDemo:true});}
  }
  function walk(root,ctx){
    ctx=ctx||{};
    for(var el=root.firstElementChild;el;el=el.nextElementSibling){
      if(el.matches(SKIP)||hidden(el))continue;
      var tag=el.tagName,cl=el.classList;
      if(cl.contains("chapter-head")){var num=el.querySelector(".num"),h2=el.querySelector("h2");section=h2?headingText(h2):section;var cu=new Unit(el,"heading");if(num){collect(num,cu);cu.say(":");}if(h2)collect(h2,cu);push(cu);continue;}
      if(el.hasAttribute("data-xq")){var q=new Unit(el,"quiz");q.say("The quiz questions are on the page. Skipping ahead.");push(q);continue;}
      if(cl.contains("lab")){lab(el);continue;}
      if(/^H[1-6]$/.test(tag)){if(tag==="H1"||tag==="H2"||tag==="H3")section=headingText(el);unitFrom(el,"heading");continue;}
      if(cl.contains("math")||tag==="MJX-CONTAINER"){
        var nxt=el.nextElementSibling;
        if(nxt&&nxt.classList.contains("say")&&/^\s*in words/i.test(nxt.textContent))continue;
        var mu=new Unit(el,"math"),words=[];
        var mjs=tag==="MJX-CONTAINER"?[el]:[].slice.call(el.querySelectorAll("mjx-container"));
        if(!mjs.length){unitFrom(el,"math");continue;}
        mjs.forEach(function(m){words.push([m,mathWords(m)]);});
        var total=words.reduce(function(n,w){return n+w[1].length;},0);
        if(!S.formulas)mu.say("A formula is shown on the page.");
        else if(total>520)mu.say("A long formula is shown on the page.");
        else words.forEach(function(w){mu.elem(w[0],w[1]+".");});
        push(mu);continue;
      }
      if(cl.contains("tbl")||tag==="TABLE"){if(ctx.inDemo)continue;var t=tag==="TABLE"?el:el.querySelector("table");if(t)table(el,t);continue;}
      if(tag==="FIGURE"){figure(el);continue;}
      if(tag==="PRE"){if(!ctx.inDemo)code(el);continue;}
      if(cl.contains("pipe")){unitFrom(el,"text",null,{pipe:true});continue;}
      if(cl.contains("kpis")){var ku=new Unit(el,"text");el.querySelectorAll(".kpi").forEach(function(k){[].forEach.call(k.children,function(c){collect(c,ku);ku.say("");});ku.say(",");});push(ku);continue;}
      if(cl.contains("call")){
        var tg=el.querySelector(":scope > .tag");
        if(tg){var tu=new Unit(tg,"tag");collect(tg,tu);tu.say(tu.text&&/…|\.\.\.$/.test(tu.text)?"":":");push(tu);}
        walk(el,ctx);continue;
      }
      if(tag==="UL"||tag==="OL"){walk(el,ctx);continue;}
      if(tag==="LI"){
        if(hasBlockKids(el)){unitFrom(el,"text",null,{stopAtBlocks:true});walk(el,ctx);}
        else unitFrom(el,"text");
        continue;
      }
      if(tag==="P"||tag==="BLOCKQUOTE"||tag==="DT"||tag==="DD"||tag==="FIGCAPTION"||tag==="SUMMARY"){if(ctx.inDemo&&!el.textContent.trim())continue;unitFrom(el,"text");continue;}
      if(tag==="DETAILS"&&!el.open){var su=el.querySelector("summary");if(su)unitFrom(su,"text");continue;}
      if(cl.contains("tag"))continue;
      if(hasBlockKids(el))walk(el,ctx);
      else if(el.textContent.trim()&&!ctx.inDemo)unitFrom(el,"text");
    }
  }

  /* ---------------------------------------------------------------- sentences, words, chunks */
  var sents=[];
  function build(){
    readTex();units=[];unitOf=new Map();section=document.title.split("·")[0].trim();sents=[];
    walk(main);
    units.forEach(function(u,ui){
      u.first=sents.length;
      var text=u.text,start=0,re=/[.!?…]+["'”’)\]]*\s+(?=[^a-z])/g,m;
      var cut=function(end){
        var s=start;while(s<end&&text[s]===" ")s++;
        if(end>s){
          /* very long sentences are split at a semicolon or comma so each request stays small */
          while(end-s>420){
            var slice=text.slice(s,s+420),k=Math.max(slice.lastIndexOf("; "),slice.lastIndexOf(", "));
            if(k<120)k=slice.lastIndexOf(" ");if(k<60)k=420;
            sents.push({u:ui,s:s,e:s+k+1});s=s+k+1;while(s<end&&text[s]===" ")s++;
          }
          if(end>s&&/[A-Za-z0-9]/.test(text.slice(s,end)))sents.push({u:ui,s:s,e:end});
        }
      };
      while((m=re.exec(text))){
        var before=text.slice(Math.max(0,m.index-4),m.index+1);
        if(/\b(?:Mr|Ms|Mrs|Dr|St|No|Fig|vs|approx)\.$/i.test(before))continue;
        cut(m.index+m[0].length);start=m.index+m[0].length;
      }
      cut(text.length);
      u.last=sents.length-1;
    });
    sents.forEach(function(st){st.text=units[st.u].text.slice(st.s,st.e).trim();});
  }
  function chunkMax(first){return engine==="cloud"&&PROVIDER==="gemini"&&cloudReady()?(first?240:600):380;}
  function chunkFrom(idx,max){
    max=max||380;
    var parts=[],len=0,j=idx;
    while(j<sents.length&&(parts.length===0||len+sents[j].text.length<max)){parts.push(j);len+=sents[j].text.length+1;j++;}
    var text="",words=[],w=0;
    parts.forEach(function(si){
      var st=sents[si],u=units[st.u],base=text.length,re=/\S+/g,m,seg=u.text.slice(st.s,st.e);
      var lead=seg.length-seg.replace(/^\s+/,"").length;
      text+=st.text+" ";
      while((m=re.exec(st.text))){
        var wd=m[0],weight=wd.replace(/[^A-Za-z0-9]/g,"").length+1.6+(/[,;:]$/.test(wd)?3:0)+(/[.!?…]["'”’)]*$/.test(wd)?6:0)+(/^\d/.test(wd)?wd.length*1.2:0);
        words.push({si:si,s:st.s+lead+m.index,e:st.s+lead+m.index+wd.length,c:base+m.index,w0:w,w1:w+weight});
        w+=weight;
      }
    });
    return {start:idx,end:parts[parts.length-1],text:text.trim(),words:words,total:w};
  }

  /* ================================================================ highlighting */
  var HL=!!(window.CSS&&CSS.highlights&&window.Highlight);
  var curUnit=-1,curSent=-1,curWordKey="",marked=[],wordMarked=[],lastUserScroll=0;
  function rangeFor(u,s,e){
    var firstT=-1,lastT=-1,els=[];
    for(var k=s;k<e;k++){
      var p=u.pieces[u.pi[k]];if(!p)continue;
      if(p.node){if(firstT<0)firstT=k;lastT=k;}
      else if(p.el&&els.indexOf(p.el)<0)els.push(p.el);
    }
    var ranges=[];
    if(firstT>=0){
      try{
        var r=document.createRange(),a=u.pieces[u.pi[firstT]].node,b=u.pieces[u.pi[lastT]].node;
        r.setStart(a,Math.min(u.f[firstT],a.length));r.setEnd(b,Math.min(u.t[lastT],b.length));ranges.push(r);
      }catch(err){}
    }
    return {ranges:ranges,els:els};
  }
  function mark(list,els,cls){list.forEach(function(x){x.classList.remove(cls);});list.length=0;els.forEach(function(x){x.classList.add(cls);list.push(x);});}
  function clearHighlights(){
    if(HL){CSS.highlights.delete("tts-sent");CSS.highlights.delete("tts-word");}
    mark(marked,[],"tts-m");mark(wordMarked,[],"tts-m-now");
    document.querySelectorAll(".tts-block").forEach(function(x){x.classList.remove("tts-block");});
    curUnit=-1;curSent=-1;curWordKey="";
  }
  function follow(target){
    if(!S.follow||Date.now()-lastUserScroll<4000||!target)return;
    var r=target.getBoundingClientRect?target.getBoundingClientRect():null;if(!r)return;
    var barH=ui.bar&&!ui.bar.hidden?ui.bar.getBoundingClientRect().height+24:24,top=70;
    if(r.top<top||r.bottom>innerHeight-barH){
      var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({top:scrollY+r.top-Math.max(top,(innerHeight-barH)/2-Math.min(r.height,innerHeight/3)/2),behavior:reduce?"auto":"smooth"});
    }
  }
  function show(si,word){
    var st=sents[si];if(!st)return;var u=units[st.u];
    if(st.u!==curUnit){
      document.querySelectorAll(".tts-block").forEach(function(x){x.classList.remove("tts-block");});
      u.el.classList.add("tts-block");curUnit=st.u;
      media(u);placeAskBtn();
    }
    if(si!==curSent){
      curSent=si;var r=rangeFor(u,st.s,st.e);
      if(HL)CSS.highlights.set("tts-sent",new Highlight(...r.ranges));
      mark(marked,r.els,"tts-m");
      follow(r.ranges[0]||r.els[0]||u.el);
      ui.prog.style.width=(100*si/Math.max(1,sents.length-1)).toFixed(2)+"%";
    }
    if(word){
      var key=si+":"+word.s;if(key===curWordKey)return;curWordKey=key;
      var w=rangeFor(u,word.s,word.e);
      if(HL){if(w.ranges.length)CSS.highlights.set("tts-word",new Highlight(...w.ranges));else CSS.highlights.delete("tts-word");}
      mark(wordMarked,w.els,"tts-m-now");
    }
  }
  ["wheel","touchmove"].forEach(function(ev){addEventListener(ev,function(){lastUserScroll=Date.now();},{passive:true});});
  addEventListener("keydown",function(e){if(/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)&&!e.target.closest("input,select,textarea,button"))lastUserScroll=Date.now();});

  /* ================================================================ engines */
  var SILENT="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  var player=null,puterP=null,cache=new Map(),made=[];
  var gen=0,playing=false,paused=false,engine="cloud",chunk=null,raf=0,dev={start:0,bound:false};
  function errText(e){if(!e)return "unknown error";if(typeof e==="string")return e;if(e.error&&e.error.message)return e.error.message;if(e.message)return e.message;try{return JSON.stringify(e).slice(0,160);}catch(x){return String(e);}}
  function loadPuter(){
    if(window.puter&&window.puter.ai)return Promise.resolve();
    if(puterP)return puterP;
    puterP=new Promise(function(ok,no){
      var s=document.createElement("script");s.src="https://js.puter.com/v2/";s.async=true;
      s.onload=function(){window.puter&&window.puter.ai?ok():no(new Error("Puter loaded without its AI tools"));};
      s.onerror=function(){puterP=null;no(new Error("Could not load Puter. Check your connection."));};
      document.head.appendChild(s);
    });
    return puterP;
  }
  /* Puter's AI needs a signed-in Puter user. We never trigger its sign-in window ourselves:
     Puter voices are used only when already signed in, and the menu has a button to sign in. */
  function signedIn(){try{var a=window.puter&&window.puter.auth;return !!(a&&typeof a.isSignedIn==="function"&&a.isSignedIn());}catch(e){return false;}}
  function authError(e){if(e&&e.auth)return true;return /auth|sign.?in|log.?in|cancel|closed|401|403|permission|unauthori/i.test(errText(e));}
  async function signInPuter(){
    try{
      await loadPuter();
      if(!signedIn())await window.puter.auth.signIn();
    }catch(e){state("Puter sign-in did not finish. Still using your device's voice.",true);paintAuth();return;}
    paintAuth();
    if(signedIn()&&!voice().device){
      engine="cloud";state("Signed in to Puter. Natural voice on.");
      if(playing&&curSent>=0)playFrom(units[sents[curSent].u].first);
    }
  }
  function withTimeout(p,ms,msg){return Promise.race([p,new Promise(function(_,no){setTimeout(function(){no(new Error(msg));},ms);})]);}
  function cloudReady(){return PROVIDER==="gemini"?ready("gemini")||ready("eleven"):signedIn();}
  function anyKey(){return PROVIDER==="gemini"?hasKey("gemini")||hasKey("eleven"):signedIn();}
  function b64bytes(b64){var bin=atob(b64),n=bin.length,out=new Uint8Array(n);for(var k=0;k<n;k++)out[k]=bin.charCodeAt(k);return out;}
  function wavHeader(len,rate){
    var h=new DataView(new ArrayBuffer(44)),w=function(o,str){for(var k=0;k<str.length;k++)h.setUint8(o+k,str.charCodeAt(k));};
    w(0,"RIFF");h.setUint32(4,36+len,true);w(8,"WAVE");w(12,"fmt ");h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);
    h.setUint32(24,rate,true);h.setUint32(28,rate*2,true);h.setUint16(32,2,true);h.setUint16(34,16,true);w(36,"data");h.setUint32(40,len,true);
    return h.buffer;
  }
  /* the last audio part anywhere in the reply (REST: steps[].content[] with type "audio") */
  function findAudio(j){
    var found=null;
    (function walk(o){
      if(!o||typeof o!=="object")return;
      if(Array.isArray(o)){o.forEach(walk);return;}
      if(o.type==="audio"&&typeof o.data==="string")found=o.data;
      else if(o.inlineData&&typeof o.inlineData.data==="string")found=o.inlineData.data;
      else if(o.output_audio&&typeof o.output_audio.data==="string")found=o.output_audio.data;
      for(var k in o)if(o[k]&&typeof o[k]==="object")walk(o[k]);
    })(j);
    return found;
  }
  async function geminiSynth(text,v){
    var key=apiKey(),srv=onServer("gemini");if(!key&&!srv){var ne=new Error("No Gemini API key");ne.auth=true;throw ne;}
    var part={type:"text",text:text};
    if(GEMINI_STYLE)part.annotations=[{type:"speech_metadata",style:GEMINI_STYLE}];
    v=gVoice();var body={model:S.gmodel,input:[{type:"user_input",content:[part]}],response_format:{type:"audio"},generation_config:{speech_config:[{voice:v.gvoice}]}};
    var r=await withTimeout(srv
      ?fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"gemini",text:text,voice:v.gvoice,style:GEMINI_STYLE})})
      :fetch(GEMINI_URL,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(body)}),90000,"Gemini took too long to answer.");
    var j=null;try{j=await r.json();}catch(e){}
    if(!r.ok){
      var err=new Error((j&&j.error&&j.error.message)||("HTTP "+r.status));err.status=r.status;
      if(r.status===400&&/api key|api_key/i.test(err.message)||r.status===401||r.status===403)err.auth=true;
      throw err;
    }
    var b64=findAudio(j);if(!b64)throw new Error("Gemini returned no audio");
    var bytes=b64bytes(b64),riff=bytes.length>12&&bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70;
    var blob=riff?new Blob([bytes],{type:"audio/wav"}):new Blob([wavHeader(bytes.length,24000),bytes],{type:"audio/wav"});
    var url=URL.createObjectURL(blob);made.push(url);return url;
  }
  async function elevenSynth(text,v,voiceId){
    var key=elevenKey(),srv=onServer("eleven");if(!key&&!srv)throw new Error("No ElevenLabs key");
    var id=voiceId||eVoice().eleven||ELEVEN_DEFAULT;
    var r=await withTimeout(srv
      ?fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"eleven",text:text,voice:id})})
      :fetch("https://api.elevenlabs.io/v1/text-to-speech/"+id+"/with-timestamps?output_format=mp3_44100_64",
      {method:"POST",headers:{"Content-Type":"application/json","xi-api-key":key},body:JSON.stringify({text:text,model_id:ELEVEN_MODEL})}),45000,"ElevenLabs took too long to answer.");
    var j=null;try{j=await r.json();}catch(e){}
    if(!r.ok){
      var d=j&&(j.detail||j.error),msg=typeof d==="string"?d:(d&&d.message)||("HTTP "+r.status),code=(d&&(d.status||d.code))||"",err=new Error(msg);err.status=r.status;
      if(/quota|credits/i.test(msg+" "+code))err.quota=true;
      else if(/voice/i.test(msg+" "+code)&&id!==ELEVEN_DEFAULT)return elevenSynth(text,v,ELEVEN_DEFAULT);
      else if(r.status===401||r.status===403)err.auth=true;
      throw err;
    }
    if(!j||!j.audio_base64)throw new Error("ElevenLabs returned no audio");
    var url=URL.createObjectURL(new Blob([b64bytes(j.audio_base64)],{type:"audio/mpeg"}));made.push(url);
    var a=j.alignment,times=a&&a.character_start_times_seconds&&a.character_start_times_seconds.length?{start:a.character_start_times_seconds,n:a.characters.length,len:text.length}:null;
    return {url:url,times:times,via:"eleven"};
  }
  /* the smart switch: try each service that has a key and isn't resting, in order */
  async function cloudSynth(text,v,purpose){
    var order=purpose==="answer"?["eleven","gemini"]:["gemini","eleven"],last=null;
    for(var k=0;k<order.length;k++){
      var p=order[k];if(!ready(p))continue;
      try{return p==="gemini"?{url:await geminiSynth(text,v),via:"gemini"}:await elevenSynth(text,v);}
      catch(e){last=e;rest(p,e);if(e&&e.name==="AbortError")throw e;}
    }
    if(last)throw last;
    var none=new Error("No voice service is available right now");none.none=true;throw none;
  }
  async function synth(text,v){return PROVIDER==="gemini"?cloudSynth(text,v,"read"):{url:await puterSynth(text,v),via:"puter"};}
  async function puterSynth(text,v){
    await loadPuter();
    var a=await withTimeout(window.puter.ai.txt2speech(text,Object.assign({},v.opts)),45000,"The voice took too long to answer.");
    var src=a&&(a.src||a.currentSrc);if(!src)throw new Error("Puter returned no audio");
    if(/^https?:/.test(src)){
      try{var b=await (await fetch(src)).blob();if(b.size){src=URL.createObjectURL(b);made.push(src);}}catch(e){}
    }
    return src;
  }
  var downgraded={};
  function ckey(text){return (PROVIDER==="gemini"?gVoice().id+"|"+eVoice().id:voice().id)+"|"+text;}
  function audioFor(ch){
    var v=voice(),key=ckey(ch.text);
    if(!cache.has(key)){
      var p=(downgraded[v.id]?synth(ch.text,FALLBACK_VOICE):synth(ch.text,v).catch(function(e){
        /* a generative voice can be unavailable: use the plain neural voice from then on */
        if(PROVIDER==="puter"&&v.opts&&v.opts.engine==="generative"&&!authError(e)){downgraded[v.id]=true;return synth(ch.text,FALLBACK_VOICE);}
        throw e;
      }));
      p.catch(function(){cache.delete(key);});
      cache.set(key,p);
      if(cache.size>40){var old=cache.keys().next().value;cache.delete(old);}
      while(made.length>60)URL.revokeObjectURL(made.shift());
    }
    return cache.get(key);
  }
  function prefetch(from,n){if(!cloudReady())return;var j=from;for(var k=0;k<n&&j<sents.length;k++){var c=chunkFrom(j,chunkMax(false));audioFor(c).catch(function(){});j=c.end+1;}}
  function wordAtWeight(ch,x){
    var ws=ch.words,lo=0,hi=ws.length-1;
    while(lo<hi){var mid=(lo+hi+1)>>1;if(ws[mid].w0<=x)lo=mid;else hi=mid-1;}
    return ws[lo];
  }
  function tick(){
    raf=0;if(!playing||paused||!chunk)return;
    var w=null;
    if(chunk.via==="cloud"&&chunk.wt&&player){
      var ct=player.currentTime,ws=chunk.words,lo=0,hi=chunk.wt.length-1;
      while(lo<hi){var md=(lo+hi+1)>>1;if(chunk.wt[md]<=ct+0.02)lo=md;else hi=md-1;}
      w=ws[lo];
    }else if(chunk.via==="cloud"&&player&&isFinite(player.duration)&&player.duration>0){
      var t=Math.max(0,player.currentTime-0.08),d=Math.max(0.2,player.duration-0.25);
      w=wordAtWeight(chunk,Math.min(1,t/d)*chunk.total);
    }else if(chunk.via==="device"&&!dev.bound&&dev.start){
      var cps=14*S.rate,el=(performance.now()-dev.start)/1000;
      w=wordAtWeight(chunk,Math.min(chunk.total-0.01,el*cps*chunk.total/Math.max(1,chunk.text.length)));
    }
    if(w)show(w.si,w);
    raf=requestAnimationFrame(tick);
  }
  function loop(){if(!raf)raf=requestAnimationFrame(tick);}

  function stopAudio(){
    gen++;if(ui.bar)ui.bar.classList.remove("tts-wait");
    if(player){player.onended=null;player.onerror=null;try{player.pause();}catch(e){}}
    if(window.speechSynthesis)try{speechSynthesis.cancel();}catch(e){}
    if(raf){cancelAnimationFrame(raf);raf=0;}
  }
  async function playFrom(idx){
    stopAudio();var my=gen;
    if(idx>=sents.length){finish();return;}
    var cont=playing&&!paused&&chunk&&idx===chunk.end+1;
    playing=true;paused=false;paint();
    chunk=chunkFrom(idx,chunkMax(!cont));var ch=chunk;
    show(ch.start,ch.words[0]);
    if(engine!=="cloud"||!cloudReady()){ch.via="device";usedBy("device");speakDevice(ch,my);return;}
    ch.via="cloud";
    state(PROVIDER==="gemini"?"Getting the voice ready… Gemini takes a few seconds to start.":"Getting the voice ready…");
    var url,res;
    ui.bar.classList.add("tts-wait");
    try{res=await audioFor(ch);url=res.url;}
    catch(e){
      if(my===gen)ui.bar.classList.remove("tts-wait");
      if(my!==gen)return;
      /* this part is read by the device; the next part tries the services again */
      if(e&&e.auth&&!e.quota)state("A voice key was rejected ("+errText(e)+"). Using another voice.",true);
      if(PROVIDER==="puter")engine="device";
      ch.via="device";usedBy("device");speakDevice(ch,my);return;
    }
    usedBy(res.via);
    if(my!==gen)return;
    ui.bar.classList.remove("tts-wait");
    if(res.times){var tm=res.times;ch.wt=ch.words.map(function(w){var i=tm.n===tm.len?w.c:Math.round(w.c*tm.n/Math.max(1,tm.len));return tm.start[Math.max(0,Math.min(tm.n-1,i))];});}
    prefetch(ch.end+1,2);
    player.onended=function(){if(my===gen)playFrom(ch.end+1);};
    player.onerror=function(){if(my!==gen)return;cache.delete(ckey(ch.text));state("That part failed to play. Skipping ahead.",true);playFrom(ch.end+1);};
    player.src=url;player.defaultPlaybackRate=S.rate;player.playbackRate=S.rate;
    try{player.preservesPitch=true;}catch(e){}
    if(paused)return;
    try{await player.play();}catch(e){if(my!==gen)return;if(e&&e.name==="NotAllowedError"){paused=true;paint();state("Press play to start the audio.",true);return;}}
    if(my===gen)loop();
  }
  var devVoice=null;
  /* novelty voices that come with macOS; not useful for study notes */
  var NOVELTY=/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy)\b/;
  var REGION={US:"American",GB:"British",AU:"Australian",IN:"Indian",IE:"Irish",ZA:"South African",CA:"Canadian",NZ:"New Zealand",SG:"Singaporean",SC:"Scottish"};
  function deviceVoices(){
    if(!window.speechSynthesis)return [];
    var seen={},out=[];
    speechSynthesis.getVoices().forEach(function(v){
      if(!/^en(-|_|$)/i.test(v.lang)||NOVELTY.test(v.name))return;
      var name=v.name.replace(/^(Microsoft|Google|Apple)\s+/i,"").replace(/\s*-\s*English.*$/i,"").replace(/\s+Online\b/i,"").replace(/\s*\((Natural|Enhanced|Premium)\)/ig,"").replace(/\s*\(English[^)]*\)/i,"").trim()||v.name;
      var reg=(v.lang.split(/[-_]/)[1]||"").toUpperCase(),q=(/natural/i.test(v.name)?"natural":/premium/i.test(v.name)?"premium":/enhanced/i.test(v.name)?"enhanced":"");
      var key=name+"|"+reg;if(seen[key])return;seen[key]=1;
      out.push({id:v.voiceURI||v.name,name:name,note:[(REGION[reg]||"")+" English",q,v.localService===false?"online":""].filter(Boolean).join(", ").replace(/^ English/,"English"),v:v,rank:q?0:1});
    });
    out.sort(function(a,b){return a.rank-b.rank||a.name.localeCompare(b.name);});
    return out;
  }
  function pickDeviceVoice(){
    if(!window.speechSynthesis)return null;
    var mine=S.voices.device&&deviceVoices().filter(function(d){return d.id===S.voices.device;})[0];
    if(mine)return mine.v;
    var vs=speechSynthesis.getVoices().filter(function(v){return /^en(-|_|$)/i.test(v.lang);});
    if(!vs.length)return null;
    var pref=[/natural/i,/neural/i,/premium/i,/enhanced/i,/google us english/i,/samantha/i,/aria|jenny|guy/i,/en-us/i];
    for(var p=0;p<pref.length;p++)for(var k=0;k<vs.length;k++)if(pref[p].test(vs[k].name+" "+vs[k].lang))return vs[k];
    return vs[0];
  }
  function speakDevice(ch,my){
    if(!window.speechSynthesis){state("This browser has no built-in voice. Try Chrome, Edge or Safari.",true);finish(true);return;}
    devVoice=devVoice||pickDeviceVoice();
    var u=new SpeechSynthesisUtterance(ch.text);u.rate=S.rate;u.lang="en-US";if(devVoice)u.voice=devVoice;
    dev={start:0,bound:false};
    u.onstart=function(){if(my===gen){dev.start=performance.now();loop();}};
    u.onboundary=function(e){
      if(my!==gen||(e.name&&e.name!=="word"))return;dev.bound=true;
      var w=null;for(var k=0;k<ch.words.length;k++){if(ch.words[k].c<=e.charIndex)w=ch.words[k];else break;}
      if(w)show(w.si,w);
    };
    u.onend=function(){if(my===gen)playFrom(ch.end+1);};
    u.onerror=function(e){if(my!==gen||e.error==="interrupted"||e.error==="canceled")return;state("The device voice stopped: "+e.error,true);};
    speechSynthesis.cancel();speechSynthesis.speak(u);
  }
  function pause(){
    if(!playing)return;paused=true;
    if(chunk&&chunk.via==="cloud"&&player)player.pause();else if(window.speechSynthesis)speechSynthesis.pause();
    paint();
  }
  function resume(){
    if(!playing){playFrom(Math.max(0,curSent));return;}
    paused=false;
    if(chunk&&chunk.via==="cloud"&&player){if(player.src&&player.src!==SILENT&&!player.ended){player.play().catch(function(){});loop();}else playFrom(Math.max(0,curSent));}
    else if(window.speechSynthesis){if(speechSynthesis.paused)speechSynthesis.resume();else playFrom(Math.max(0,curSent));loop();}
    paint();
  }
  function finish(quiet){stopAudio();playing=false;paused=false;if(!quiet)state("Finished the page.");paint();}
  function unitStart(i){return units[Math.max(0,Math.min(units.length-1,i))].first;}
  function next(){if(!sents.length)return;var u=sents[Math.max(0,curSent)].u;if(u+1<units.length)playFrom(unitStart(u+1));}
  function prev(){
    if(!sents.length)return;var cs=Math.max(0,curSent),u=sents[cs].u;
    playFrom(cs>units[u].first?units[u].first:unitStart(u-1));
  }
  function restartHere(){
    if(!sents.length)return;var el=curUnit>=0&&units[curUnit]?units[curUnit].el:null;
    build();
    var i=el&&unitOf.has(el)?units[unitOf.get(el)].first:Math.max(0,Math.min(curSent,sents.length-1));
    clearHighlights();
    if(playing&&!paused)playFrom(i);else{show(i);}
  }

  /* where to start: the first unit that is on screen */
  function firstVisible(){
    var top=80,best=0;
    for(var k=0;k<units.length;k++){var r=units[k].el.getBoundingClientRect();if(r.bottom>top){best=k;break;}}
    return units.length?units[best].first:0;
  }
  async function open(fromEl){
    /* unlock audio inside the click, before anything async (Safari needs this) */
    if(!player){player=new Audio();player.preload="auto";}
    try{player.src=SILENT;player.play().catch(function(){});}catch(e){}
    if(window.speechSynthesis){try{var w=new SpeechSynthesisUtterance(" ");w.volume=0;speechSynthesis.speak(w);}catch(e){}}
    showBar(true);state("Preparing the page…");
    engine="device";
    if(location.protocol!=="file:"&&SERVER===null){try{await withTimeout(checkServer(),3000,"");}catch(e){}}
    if(!voice().device){if(PROVIDER==="puter"){try{await withTimeout(loadPuter(),6000,"");}catch(e){}}if(anyKey())engine="cloud";}
    state(engine==="device"&&!voice().device?NO_CLOUD():"");
    if(window.MathJax&&MathJax.startup&&MathJax.startup.promise){try{await withTimeout(MathJax.startup.promise,5000,"");}catch(e){}}
    build();
    if(!sents.length){state("Nothing to read here.",true);return;}
    var i=fromEl&&unitOf.has(fromEl)?units[unitOf.get(fromEl)].first:firstVisible();
    playFrom(i);
  }
  function NO_CLOUD(){return PROVIDER==="gemini"?"Using your device's voice. For Gemini voices, open the options and add a Gemini API key.":"Using your device's voice. For natural voices, open the options and sign in to Puter.";}
  function close(){endAsk(false);stopAudio();playing=false;paused=false;clearHighlights();showBar(false);if("mediaSession" in navigator)try{navigator.mediaSession.playbackState="none";}catch(e){}}

  function media(u){
    if(!("mediaSession" in navigator)||!window.MediaMetadata)return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:u.sec||document.title,artist:"Year 4 Study Hub",album:document.title.split("·")[0].trim()});
      navigator.mediaSession.setActionHandler("play",resume);navigator.mediaSession.setActionHandler("pause",pause);
      navigator.mediaSession.setActionHandler("nexttrack",next);navigator.mediaSession.setActionHandler("previoustrack",prev);
    }catch(e){}
  }

  /* ================================================================ interface */
  var ICON={
    send:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    spark:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
    mic:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    stop:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
    keys:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
    voice:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
    hush:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l4 6M21 9l-4 6"/></svg>',
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
    prev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/></svg>',
    next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/></svg>',
    gear:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    speaker:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
  };
  var CSS_TEXT=
    ".tts-go{width:100%;min-height:40px;display:flex;align-items:center;gap:10px;text-align:left}"+
    ".tts-go svg{width:18px;height:18px;flex:none}"+
    ".tts-bar{position:fixed;z-index:60;left:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:calc(100vw - 32px);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;"+
      "background:var(--bg);color:var(--ink);border:var(--bw2,2px) solid var(--box,var(--ink));border-radius:var(--r-card,0);box-shadow:0 14px 40px rgba(0,0,0,.25);font-family:var(--f-body);font-size:14px;line-height:1.35;letter-spacing:normal;overflow:hidden}"+
    ".tts-bar[hidden]{display:none}"+
    ":root[data-look=\"frosted\"] .tts-bar{background:var(--glass-strong,var(--bg));-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%)}"+
    ".tts-bar.tts-dragging{cursor:grabbing}"+
    ".tts-grab{width:44px;height:0;border-radius:2px;background:var(--line,#d0d0d0);margin:0 auto;opacity:0;transition:height .15s,margin .15s,opacity .15s}"+
    ".tts-bar:hover .tts-grab,.tts-bar.tts-dragging .tts-grab{height:4px;margin:7px auto 2px;opacity:1}"+
    "@media (hover:none){.tts-grab{height:4px;margin:7px auto 2px;opacity:1}}"+
    ".tts-toast{margin:0;padding:8px 12px 0;font-size:12.5px;line-height:1.35;color:var(--ink);max-width:none}.tts-toast[hidden]{display:none}"+
    ".tts-ctl{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:10px}"+
    ".tts-bar[data-mode=\"ask\"] .tts-ctl,.tts-bar[data-mode=\"ask\"] .tts-panel{display:none}"+
    /* loading: a small round spinner replaces the play icon (a rotating border sweeps outside square buttons) */
    ".tts-bar.tts-wait .tts-pp{position:relative}.tts-bar.tts-wait .tts-pp svg{opacity:0}"+
    ".tts-bar.tts-wait .tts-pp::after{content:\"\";position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;box-sizing:border-box;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:tts-spin .8s linear infinite;pointer-events:none}"+
    "@keyframes tts-spin{to{transform:rotate(360deg)}}"+
    /* ask view */
    ".tts-ask{display:none;padding:10px 12px 12px;gap:10px}.tts-bar[data-mode=\"ask\"] .tts-ask{display:grid}"+
    ".tts-ask-head{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:var(--w-lbl,800);text-transform:var(--lbl-tt,uppercase);letter-spacing:calc(.04em * var(--lk,1));color:var(--muted);min-width:0}"+
    ".tts-ask-head svg{width:14px;height:14px;flex:none;color:var(--hi,var(--ink))}.tts-ask-head span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
    ".tts-ask-note{margin:0;font-size:12.5px;max-width:none}.tts-ask-note[hidden]{display:none}"+
    ".tts-ask-rec,.tts-ask-type,.tts-ask-out{display:none}"+
    ".tts-ask-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:8px}"+
    ".tts-ask-mid{min-width:0}"+
    ".tts-ask[data-state=\"rec\"] .tts-ask-rec{display:flex;align-items:center;gap:10px}.tts-ask-rec .tts-meter{flex:1 1 auto;min-width:0}"+
    ".tts-time{font-family:var(--f-mono);font-size:12px;color:var(--muted);min-width:2.5em;text-align:right}"+
    ".tts-meter{display:flex;align-items:center;gap:3px;height:34px}.tts-meter i{flex:1 1 0;height:100%;border-radius:2px;background:var(--hi,var(--ink));transform:scaleY(.12);transition:transform .08s linear}"+
    ".tts-ask[data-state=\"type\"] .tts-ask-type{display:flex}"+
    ".tts-ask-type input{flex:1 1 auto;min-width:0;font:inherit;font-size:14px;min-height:40px;padding:0 10px;border:var(--bw15,1.5px) solid var(--box,var(--ink));background:var(--bg);color:var(--ink);border-radius:var(--r-btn,0)}"+
    ".tts-ask[data-state=\"think\"] .tts-ask-out,.tts-ask[data-state=\"answer\"] .tts-ask-out{display:block;max-height:min(34vh,260px);overflow:auto;cursor:auto;user-select:text;-webkit-user-select:text;touch-action:pan-y}"+
    ".tts-q{margin:0 0 4px;font-size:12.5px;color:var(--muted);max-width:none}.tts-q:empty{display:none}"+
    ".tts-a{margin:0;font-size:15px;line-height:1.5;max-width:none}"+
    ".tts-ask[data-state=\"think\"] .tts-a::after,.tts-a:empty::after{content:\"\";display:inline-block;width:8px;height:1em;margin-left:2px;vertical-align:-2px;background:var(--hi,var(--ink));animation:tts-blink 1s steps(2) infinite}"+
    "@keyframes tts-blink{50%{opacity:0}}"+
    ".tts-ask-row .tts-abtn[hidden]{display:none}.tts-ask-row .tts-abtn svg{width:20px;height:20px}"+
    ".tts-bar .tts-rec{border-radius:999px;background:#d93636;border-color:#d93636;color:#fff;animation:tts-pulse 1.4s ease-in-out infinite}"+
    "@keyframes tts-pulse{0%,100%{box-shadow:0 0 0 0 rgba(217,54,54,.45)}50%{box-shadow:0 0 0 8px rgba(217,54,54,0)}}"+
    ".tts-bar .tts-think svg{animation:tts-spin 1.6s linear infinite}"+
    /* history */
    ".tts-panel{border-bottom:var(--bw15,1.5px) solid var(--box,var(--ink));padding:10px 12px;max-height:min(46vh,380px);overflow:auto;cursor:auto;touch-action:pan-y;user-select:text;-webkit-user-select:text}"+
    ".tts-panel[hidden]{display:none}.tts-h-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 auto 2px;max-width:46rem}"+
    ".tts-panel h5{margin:0;font-size:11.5px;font-weight:var(--w-lbl,800);text-transform:var(--lbl-tt,uppercase);letter-spacing:calc(.05em * var(--lk,1))}"+
    ".tts-bar .tts-h-head .btn{min-height:30px;min-width:0;font-size:12px;padding:0 10px}"+
    ".tts-h-list{list-style:none;margin:0 auto;padding:0;max-width:46rem;display:grid}.tts-h-list li{margin:0;border-bottom:1px solid var(--line,#d0d0d0)}.tts-h-list li:last-child{border-bottom:0}"+
    ".tts-h-item{font:inherit;display:grid;gap:3px;width:100%;text-align:left;padding:10px 4px;border:0;border-radius:0;background:transparent;color:var(--ink);cursor:pointer}"+
    ".tts-h-item:hover{background:var(--surface-2)}"+
    ".tts-h-top{display:flex;justify-content:space-between;gap:10px;font-size:11px;text-transform:var(--lbl-tt,uppercase);letter-spacing:calc(.04em * var(--lk,1))}"+
    ".tts-h-top b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tts-h-top time{flex:none;color:var(--muted)}"+
    ".tts-h-q{font-weight:700;font-size:13.5px}.tts-h-a{font-size:13px;color:var(--muted);line-height:1.45}"+
    ".tts-h-empty{font-size:13px;color:var(--muted);padding:6px 0}"+
    /* the Ask first button */
    ".tts-askbtn{position:absolute;z-index:55;width:30px;height:30px;padding:0;display:grid;place-items:center;border-radius:50%;border:var(--bw15,1.5px) solid var(--box,var(--ink));background:var(--bg);color:var(--ink);cursor:pointer;opacity:0;transform:scale(.85);transition:opacity .15s,transform .15s;box-shadow:0 4px 14px rgba(0,0,0,.18)}"+
    ".tts-askbtn[hidden]{display:none}.tts-askbtn svg{width:16px;height:16px}"+
    ".tts-askbtn.on,.tts-askbtn:focus-visible{opacity:1;transform:none}.tts-askbtn:hover{background:var(--hi,var(--ink));color:var(--on-hi,var(--bg));border-color:var(--hi,var(--ink))}"+
    ".tts-askbtn::after{content:attr(data-tip);position:absolute;right:calc(100% + 8px);top:50%;transform:translate(4px,-50%);white-space:nowrap;padding:5px 10px;border-radius:999px;background:var(--ink);color:var(--bg);font:700 12px/1.2 var(--f-body);letter-spacing:.01em;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}"+
    ".tts-askbtn:hover::after,.tts-askbtn:focus-visible::after{opacity:1;transform:translate(0,-50%)}"+
    "@media (hover:none){.tts-askbtn{opacity:1;transform:none}}"+
    /* voice settings beside Listen */
    ".tts-launch .tts-go{flex:1 1 auto;width:auto;min-width:0;margin:0}"+
    ".tts-vmenu{font-family:var(--f-body);text-transform:none;letter-spacing:normal}.tts-vmenu[hidden]{display:none}"+
    ".tts-vmenu .tts-auth{margin:6px 0 0}"+
    ".tts-vhead{display:block;margin:8px 2px 0;font-size:11.5px;font-weight:700;color:var(--muted)}.tts-vhead:empty{display:none}"+
    ".tts-vico{grid-row:span 2;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;border:1px solid rgba(128,128,128,.55);color:var(--muted)}.tts-vico svg{width:14px;height:14px}"+
    ".look-opt[aria-pressed=\"true\"] .tts-vico{color:var(--hi,var(--ink));border-color:currentColor}"+
    ".tts-left{justify-self:start}.tts-right{justify-self:end}.tts-mid{display:flex;gap:6px;align-items:center}"+
    ".tts-bar .btn{margin:0;display:inline-grid;place-items:center;min-width:40px;min-height:40px;padding:0 8px}"+
    ".tts-bar .btn svg{width:20px;height:20px;display:block}"+
    ".tts-bar .tts-pp{min-width:52px}"+
    ".tts-bar select{font:inherit;font-size:13px;font-weight:700;min-height:40px;padding:0 6px;border:var(--bw15,1.5px) solid var(--box,var(--ink));background:var(--bg);color:var(--ink);border-radius:var(--r-btn,0)}"+
    ".tts-prog{display:block;height:4px;background:var(--faint,#e2e2e2)}.tts-prog s{display:block;height:100%;width:0;background:var(--hi,var(--ink));text-decoration:none;transition:width .3s}"+
    ".tts-auth[hidden]{display:none}"+
    ".tts-auth{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;justify-content:space-between;margin:6px 0 2px;padding:8px;background:var(--surface-2);border-radius:min(var(--r-in,0px),10px);font-size:12.5px}.tts-auth .btn{flex:none;min-height:34px;padding:0 10px;font-size:12.5px}"+
    ".tts-auth>span{flex:1 1 220px}.tts-auth a{font-size:12px}"+
    ".tts-key{display:flex;flex-wrap:wrap;gap:6px;flex:1 1 100%}.tts-key input{flex:1 1 100%!important}.tts-key input{flex:1 1 auto;min-width:0;font:inherit;font-size:13px;min-height:34px;padding:0 8px;border:var(--bw15,1.5px) solid var(--box,var(--ink));background:var(--bg);color:var(--ink);border-radius:var(--r-btn,0)}"+
    "html.tts-open body{padding-bottom:150px}"+
    "::highlight(tts-sent){background-color:color-mix(in srgb,var(--hi,#f4c430) 26%,transparent)}"+
    "::highlight(tts-word){background-color:var(--hi,#f4c430);color:var(--on-hi,#000)}"+
    ".tts-block{outline:2px solid color-mix(in srgb,var(--hi,var(--ink)) 55%,transparent);outline-offset:5px;border-radius:2px}"+
    "tr.tts-block{outline-offset:-2px}"+
    "mjx-container.tts-m{background:color-mix(in srgb,var(--hi,#f4c430) 22%,transparent);border-radius:3px}"+
    "mjx-container.tts-m-now,img.tts-m-now{box-shadow:0 0 0 2px var(--hi,#f4c430);border-radius:3px}"+
    ".tts-here{position:absolute;display:inline-grid;place-items:center;margin:-.12em 0 0 .3em;width:1.4em;height:1.4em;min-width:28px;min-height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer;opacity:.0;transition:opacity .15s}"+
    ".tts-here svg{width:62%;height:62%}"+
    "h2:hover .tts-here,h3:hover .tts-here,.tts-here:focus-visible,html.tts-open .tts-here{opacity:.85}.tts-here:hover{color:var(--ink);background:var(--surface-2)}"+
    "@media (hover:none){.tts-here{opacity:.6}}"+
    "@media (max-width:960px){.tts-bar{bottom:calc(env(safe-area-inset-bottom,0px) + 8px)}.toc-top .tts-launch{grid-column:1 / -1;margin:0}}"+
    "@media (prefers-reduced-motion: reduce){.tts-prog s,.tts-here,.tts-askbtn,.tts-grab,.tts-meter i{transition:none}.tts-rec,.tts-think svg,.tts-bar.tts-wait .tts-pp::after{animation:none}}"+
    "@media print{.tts-bar,.tts-launch,.tts-here,.tts-askbtn{display:none!important}}";

  var ui={};
  function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
  function btn(cls,icon,label){var b=el("button","btn "+cls,icon);b.type="button";b.setAttribute("aria-label",label);b.title=label;return b;}
  var toastT=0;
  function state(msg,warn){
    if(!ui.toast||!warn||!msg)return;
    ui.toast.textContent=msg;ui.toast.hidden=false;clearTimeout(toastT);
    toastT=setTimeout(function(){ui.toast.hidden=true;},7000);
  }
  function paint(){
    if(!ui.pp)return;
    var on=playing&&!paused;
    ui.pp.innerHTML=on?ICON.pause:ICON.play;ui.pp.setAttribute("aria-label",on?"Pause":"Play");ui.pp.title=on?"Pause":"Play";
    if("mediaSession" in navigator)try{navigator.mediaSession.playbackState=on?"playing":"paused";}catch(e){}
    ui.launches.forEach(function(b){b.querySelector("b").textContent=ui.bar.hidden?"Listen":"Listening…";});
  }
  /* the player spans the content column, not the contents panel */
  function placeBar(){
    if(!ui.bar||ui.bar.hidden)return;
    var r=main.getBoundingClientRect(),l=Math.max(8,r.left),w=Math.min(r.width,innerWidth-l-8);
    ui.bar.style.left=l+"px";ui.bar.style.width=w+"px";
  }
  /* drag the player down, left or right to stop reading */
  function dragToClose(bar){
    var d=null;
    function reset(){bar.style.transition="";bar.style.transform="";bar.style.opacity="";}
    bar.addEventListener("pointerdown",function(e){
      if(e.button!==0||e.target.closest("button,select,input,a,form,.tts-panel,.tts-ask-out"))return;
      d={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
      try{bar.setPointerCapture(e.pointerId);}catch(x){}
      bar.style.transition="none";bar.classList.add("tts-dragging");
    });
    bar.addEventListener("pointermove",function(e){
      if(!d||e.pointerId!==d.id)return;
      d.dx=e.clientX-d.x;d.dy=Math.max(0,e.clientY-d.y);
      var far=Math.max(Math.abs(d.dx),d.dy*1.6);
      bar.style.transform="translate("+d.dx+"px,"+d.dy+"px)";bar.style.opacity=String(Math.max(.3,1-far/320));
    });
    function end(e){
      if(!d||e.pointerId!==d.id)return;
      var dx=d.dx,dy=d.dy,side=Math.abs(dx)>120,down=dy>70;d=null;bar.classList.remove("tts-dragging");
      var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
      if(side||down){
        if(reduce){close();reset();return;}
        bar.style.transition="transform .22s ease-in, opacity .22s ease-in";
        bar.style.transform=side?"translate("+(dx>0?innerWidth:-innerWidth)+"px,"+dy+"px)":"translate("+dx+"px,"+(dy+240)+"px)";
        bar.style.opacity="0";
        setTimeout(function(){close();reset();},230);
      }else{bar.style.transition="transform .2s ease-out, opacity .2s";bar.style.transform="";bar.style.opacity="";}
    }
    bar.addEventListener("pointerup",end);bar.addEventListener("pointercancel",end);
  }
  function showBar(v){
    ui.bar.hidden=!v;if(v)placeBar();document.documentElement.classList.toggle("tts-open",v);
    if(!v){hist(false);if(ui.toast)ui.toast.hidden=true;}
    placeAskBtn();paint();
  }
  /* the voice menu opens under whichever Listen button was used */
  function menu(v,box){
    if(v&&box&&ui.vmenu.parentNode!==box)box.appendChild(ui.vmenu);
    ui.vmenu.hidden=!v;
    ui.vbtns.forEach(function(b){b.setAttribute("aria-expanded",v&&b.closest(".tts-launch")===ui.vmenu.parentNode?"true":"false");});
    if(v)paintMenu();
  }
  function paintAuth(){if(PROVIDER==="gemini")paintGeminiAuth();else paintPuterAuth();}
  function restartForVoice(){if(playing&&curSent>=0)playFrom(units[sents[curSent].u].first);}
  function paintGeminiAuth(){
    if(!ui.auth)return;
    ui.auth.innerHTML="";
    var txt=el("span");
    if(storedKey()||storedEleven()){
      txt.textContent="Voice keys saved in this browser only.";
      var rm=el("button","btn");rm.type="button";rm.textContent="Remove keys";
      rm.addEventListener("click",function(){try{localStorage.removeItem(KEY_STORE);localStorage.removeItem(ELEVEN_STORE);}catch(e){}if(!anyKey())engine="device";paintAuth();restartForVoice();});
      ui.auth.appendChild(txt);ui.auth.appendChild(rm);
    }else if(localKey()||elevenKey()||onServer("gemini")||onServer("eleven")){
      /* keys from tts-config.local.js: nothing to show */
    }else{
      txt.textContent="Natural voices need a Gemini API key; an ElevenLabs key is optional and starts faster. Keys stay in this browser.";
      var form=el("form","tts-key"),g=el("input"),x=el("input"),ok=el("button","btn");
      [[g,"Gemini API key"],[x,"ElevenLabs key (optional)"]].forEach(function(f){f[0].type="password";f[0].autocomplete="off";f[0].spellcheck=false;f[0].placeholder=f[1];f[0].setAttribute("aria-label",f[1]);form.appendChild(f[0]);});
      ok.type="submit";ok.textContent="Save";form.appendChild(ok);
      form.addEventListener("submit",function(e){
        e.preventDefault();var gk=g.value.trim(),xk=x.value.trim();if(!gk&&!xk)return;
        try{if(gk)localStorage.setItem(KEY_STORE,gk);if(xk){localStorage.setItem(ELEVEN_STORE,xk);localStorage.removeItem("tts-eleven-rest");REST.eleven=0;}}catch(z){state("This browser blocked saving the key.",true);return;}
        if(!voice().device)engine="cloud";paintAuth();restartForVoice();
      });
      var link=el("a");link.href="https://aistudio.google.com/apikey";link.target="_blank";link.rel="noopener";link.textContent="Get a Gemini key";
      ui.auth.appendChild(txt);ui.auth.appendChild(form);ui.auth.appendChild(link);
    }
    ui.auth.hidden=!ui.auth.firstChild;
  }
  function paintPuterAuth(){
    if(!ui.auth)return;
    ui.auth.innerHTML="";
    var txt=el("span"),b=el("button","btn");b.type="button";
    if(signedIn()){
      txt.textContent="Signed in to Puter: natural voices are on.";b.textContent="Sign out";
      b.addEventListener("click",function(){try{window.puter.auth.signOut();}catch(e){}engine="device";paintAuth();if(playing&&curSent>=0)playFrom(units[sents[curSent].u].first);});
    }else{
      txt.textContent="Not signed in to Puter, so your device's voice is used. Ruth, Matthew, Joanna and Nova need a free Puter account (a guest one is fine).";b.textContent="Sign in to Puter";
      b.addEventListener("click",signInPuter);
    }
    ui.auth.appendChild(txt);ui.auth.appendChild(b);ui.auth.hidden=false;
  }
  /* which service is reading: the one that read the last part while playing, otherwise the one that would go first */
  var lastVia="";
  function current(){
    if(PROVIDER!=="gemini")return voice().device?"device":"puter";
    if(engine==="cloud"&&cloudReady()){if(playing&&(lastVia==="gemini"||lastVia==="eleven")&&ready(lastVia))return lastVia;return ready("gemini")?"gemini":"eleven";}
    if(!playing&&anyKey()&&cloudReady())return ready("gemini")?"gemini":"eleven";
    return "device";
  }
  function usedBy(p){if(p===lastVia)return;lastVia=p;if(ui.vmenu&&!ui.vmenu.hidden)paintMenu();}
  var PROV_NAME={gemini:"Gemini voices",eleven:"ElevenLabs voices",device:"Voices on this device"};
  function paintMenu(){
    paintAuth();if(SERVER===null)checkServer().then(function(){if(!ui.vmenu.hidden)paintMenu();});if(PROVIDER==="puter"&&!window.puter)loadPuter().then(paintAuth,function(){});
    ui.voices.innerHTML="";
    if(PROVIDER==="gemini"){paintVoiceList();return;}
    VOICES.forEach(function(v){
      var li=el("li"),b=el("button","look-opt");b.type="button";b.setAttribute("aria-pressed",v.id===S.voice?"true":"false");
      var ic=el("span","tts-vico",v.device?ICON.speaker:ICON.voice);ic.setAttribute("aria-hidden","true");
      var t=el("b");t.textContent=v.name;var s=el("small");s.textContent=v.note;b.appendChild(ic);b.appendChild(t);b.appendChild(s);li.appendChild(b);ui.voices.appendChild(li);
      b.addEventListener("click",function(){
        S.voice=v.id;save();paintMenu();
        engine=v.device||!anyKey()?"device":"cloud";
        if(!v.device&&!anyKey())state((PROVIDER==="gemini"?"Add a Gemini API key (above) to use ":"Sign in to Puter (above) to use ")+v.name+". Using your device's voice for now.",true);
        if(!v.device&&PROVIDER==="puter"){loadPuter().catch(function(){});}
        if(playing&&!paused&&curSent>=0)playFrom(units[sents[curSent].u].first);
      });
    });
  }
  function paintVoiceList(){
    var p=current(),list=p==="gemini"?GEMINI_VOICES:p==="eleven"?ELEVEN_VOICES:deviceVoices();
    var on=p==="gemini"?gVoice().id:p==="eleven"?eVoice().id:(function(){var d=pickDeviceVoice();return d?d.voiceURI||d.name:"";})();
    ui.vhead.textContent=PROV_NAME[p];
    if(!list.length){var li=el("li","tts-h-empty");li.textContent=window.speechSynthesis?"Loading voices…":"This browser has no built-in voices.";ui.voices.appendChild(li);return;}
    list.forEach(function(v){
      var li=el("li"),b=el("button","look-opt");b.type="button";b.setAttribute("aria-pressed",v.id===on?"true":"false");
      var ic=el("span","tts-vico",p==="device"?ICON.speaker:ICON.voice);ic.setAttribute("aria-hidden","true");
      var t=el("b");t.textContent=v.name;var s=el("small");s.textContent=v.note;b.appendChild(ic);b.appendChild(t);b.appendChild(s);li.appendChild(b);ui.voices.appendChild(li);
      b.addEventListener("click",function(){
        S.voices[p]=v.id;save();if(p==="device")devVoice=null;paintMenu();
        if(playing&&!paused&&curSent>=0)playFrom(units[sents[curSent].u].first);
      });
    });
    var sel=ui.voices.querySelector('[aria-pressed="true"]');if(sel&&sel.scrollIntoView)try{sel.scrollIntoView({block:"nearest"});}catch(e){}
  }
  /* ================================================================ Ask first: a quick spoken question about the paragraph being read */
  var ASK_MODEL="gemini-3.5-flash-lite"; /* the cheapest text model; recall answers are short */
  var ASK_URL="https://generativelanguage.googleapis.com/v1beta/models/"+ASK_MODEL+":streamGenerateContent?alt=sse";
  var HKEY="tts-history:"+location.pathname;
  var ask={mode:"",unit:-1,gen:0,rec:null,abort:null,q:"",a:"",speaking:false,clear:0};
  function loadHistory(){try{var h=JSON.parse(localStorage.getItem(HKEY)||"[]");return Array.isArray(h)?h:[];}catch(e){return [];}}
  function saveHistory(h){try{localStorage.setItem(HKEY,JSON.stringify(h.slice(-100)));}catch(e){}}
  function sectionId(u){var s=u&&(u.el.closest("section.sub[id]")||u.el.closest("section[id]"));return s?s.id:"";}

  /* What Gemini sees: the page as read so far (headings marked, the current paragraph flagged),
     a little of what comes next, and the last few questions asked on this page. */
  function pageContext(at){
    var out=[],end=Math.min(units.length-1,at+3);
    for(var k=0;k<=end;k++){
      var u=units[k],t=u.text;
      if(u.kind==="heading")t="\n## "+t;
      if(k===at)t=">>> "+t+" <<<";
      if(k===at+1)out.push("[The student has not heard the rest yet:]");
      out.push(t);
    }
    var txt=out.join("\n");
    return txt.length>90000?"…"+txt.slice(-90000):txt;
  }
  function askSystem(at){
    var u=units[at],page=document.title.split("·")[0].trim();
    return "You are a quick recall tutor built into a student's study page called \""+page+"\". "+
      "The student is listening to the page read aloud and paused at the paragraph marked >>> <<< (section \""+(u.sec||"")+"\") because they forgot or did not get something. "+
      "Remind them briefly so they can carry on listening: 1 to 3 short spoken sentences, under 60 words. Plain words only: no markdown, no lists, no symbols or LaTeX; say formulas in words. "+
      "Use the page notes below as the source, with the same terms and examples. If the idea was explained earlier on the page, say which section. "+
      "If the notes don't cover it, answer from general knowledge in one sentence and say it isn't in these notes. "+
      "Reply in exactly this format: a first line 'Q: ' with the student's question as they asked it (transcribe the audio and fix obvious mishearings), then a line 'A: ' with your answer.\n\n"+
      "PAGE NOTES:\n"+pageContext(at);
  }
  function parseQA(full){
    var m=full.match(/Q:\s*([\s\S]*?)(?:\n\s*A:\s*([\s\S]*))?$/);
    if(!m)return {q:"",a:full.trim(),hasA:!!full.trim()};
    return {q:m[1].trim(),a:(m[2]||"").trim(),hasA:m[2]!==undefined};
  }
  async function askGemini(q,onText){
    var key=apiKey(),srv=onServer("gemini");
    if(!key&&!srv){var ne=new Error("Add a Gemini API key (the voice button next to Listen) to ask questions.");ne.auth=true;throw ne;}
    var contents=[];
    loadHistory().slice(-4).forEach(function(h){
      contents.push({role:"user",parts:[{text:"(At section \""+h.sec+"\") "+h.q}]});
      contents.push({role:"model",parts:[{text:"Q: "+h.q+"\nA: "+h.a}]});
    });
    var parts=[{text:"(Asked at section \""+(units[ask.unit].sec||"")+"\".) "+(q.text||"The question is in the audio.")}];
    if(q.audio)parts.push({inlineData:{mimeType:"audio/wav",data:q.audio}});
    contents.push({role:"user",parts:parts});
    var ctrl=window.AbortController?new AbortController():null;ask.abort=ctrl;
    var r=await fetch(srv?"/api/ask":ASK_URL,{method:"POST",signal:ctrl&&ctrl.signal,headers:srv?{"Content-Type":"application/json"}:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({systemInstruction:{parts:[{text:askSystem(ask.unit)}]},contents:contents,generationConfig:{maxOutputTokens:300,temperature:0.4}})});
    if(!r.ok){var j=null;try{j=await r.json();}catch(e){}var err=new Error((j&&j.error&&j.error.message)||("HTTP "+r.status));err.status=r.status;throw err;}
    var full="";
    function take(block){
      block.split("\n").forEach(function(line){
        if(line.indexOf("data:")!==0)return;
        try{var jj=JSON.parse(line.slice(5)),c=jj.candidates&&jj.candidates[0];if(c&&c.content&&c.content.parts)c.content.parts.forEach(function(pp){if(pp.text&&!pp.thought)full+=pp.text;});}catch(e){}
      });
      onText(full);
    }
    if(r.body&&r.body.getReader){
      var reader=r.body.getReader(),dec=new TextDecoder(),buf="";
      for(;;){
        var x=await reader.read();if(x.done)break;
        buf+=dec.decode(x.value,{stream:true}).replace(/\r/g,"");
        var k;while((k=buf.indexOf("\n\n"))>=0){take(buf.slice(0,k));buf=buf.slice(k+2);}
      }
      if(buf.trim())take(buf);
    }else take(await r.text());
    return full;
  }

  /* --- microphone: raw samples, so the upload is a plain 16 kHz WAV that Gemini always accepts */
  function toWavB64(chunks,rate){
    var n=0;chunks.forEach(function(c){n+=c.length;});
    var ratio=rate/16000,len=Math.floor(n/ratio),pcm=new Int16Array(len),all=new Float32Array(n),o=0;
    chunks.forEach(function(c){all.set(c,o);o+=c.length;});
    for(var k=0;k<len;k++){
      var a=Math.floor(k*ratio),b=Math.min(n,Math.floor((k+1)*ratio)),sum=0;
      for(var q=a;q<b;q++)sum+=all[q];
      var v=b>a?sum/(b-a):all[a]||0;v=Math.max(-1,Math.min(1,v));pcm[k]=v<0?v*0x8000:v*0x7fff;
    }
    var bytes=new Uint8Array(44+pcm.byteLength);bytes.set(new Uint8Array(wavHeader(pcm.byteLength,16000)),0);bytes.set(new Uint8Array(pcm.buffer),44);
    var bin="";for(var i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    return {b64:btoa(bin),seconds:len/16000};
  }
  async function startRec(){
    setAsk("rec");
    if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){setAsk("type","The microphone only works on https or localhost. Type your question instead.");return;}
    var stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});}
    catch(e){if(ask.mode==="rec")setAsk("type","The microphone is blocked. Type your question instead.");return;}
    if(ask.mode!=="rec"){stream.getTracks().forEach(function(t){t.stop();});return;}
    var AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(stream),proc=ac.createScriptProcessor(4096,1,1);
    var rec={stream:stream,ac:ac,src:src,proc:proc,chunks:[],rate:ac.sampleRate,t0:performance.now(),heard:false,loud:0,levels:[]};
    proc.onaudioprocess=function(e){
      if(ask.rec!==rec)return;
      var d=e.inputBuffer.getChannelData(0),sum=0;rec.chunks.push(new Float32Array(d));
      for(var k=0;k<d.length;k+=4)sum+=d[k]*d[k];
      var rms=Math.sqrt(sum/(d.length/4)),now=performance.now();
      meter(rms);
      if(rms>0.02){rec.heard=true;rec.loud=now;}
      /* stop by itself after a short silence once you've spoken, or after 30 seconds */
      if((rec.heard&&now-rec.loud>1700&&now-rec.t0>1200)||now-rec.t0>30000)stopRec(true);
      ui.askTime.textContent=Math.floor((now-rec.t0)/1000)+"s";
    };
    src.connect(proc);proc.connect(ac.destination);
    ask.rec=rec;
  }
  function stopRec(send){
    var r=ask.rec;if(!r)return;ask.rec=null;
    try{r.proc.disconnect();r.src.disconnect();}catch(e){}
    r.stream.getTracks().forEach(function(t){t.stop();});
    try{r.ac.close();}catch(e){}
    if(!send)return;
    if(!r.heard){setAsk("rec","I didn't hear anything. Try again, or type it.");startRec();return;}
    var w=toWavB64(r.chunks,r.rate);
    sendAsk({audio:w.b64});
  }
  function meter(rms){
    var bars=ui.meterBars;if(!bars)return;
    var v=Math.min(1,rms*9);ui.levels=(ui.levels||[]).concat([v]).slice(-bars.length);
    for(var k=0;k<bars.length;k++){var l=ui.levels[ui.levels.length-bars.length+k];bars[k].style.transform="scaleY("+(0.12+0.88*(l||0)).toFixed(3)+")";}
  }

  /* --- the flow */
  function startAsk(){
    if(curUnit<0||!units[curUnit])return;
    ask.unit=curUnit;ask.resumeAt=curSent>=0?curSent:units[curUnit].first;
    stopAudio();if(playing)paused=true;paint();
    hist(false);
    ui.askSec.textContent=units[curUnit].sec||"";
    startRec();
  }
  async function sendAsk(q){
    var my=++ask.gen;ask.q=q.text||"";ask.a="";
    setAsk("think");
    ui.askQ.textContent=q.text?"\u201c"+q.text+"\u201d":"";ui.askA.textContent="";
    var full;
    try{
      full=await askGemini(q,function(t){
        if(my!==ask.gen)return;
        var qa=parseQA(t);
        if(!q.text&&qa.q)ui.askQ.textContent="\u201c"+qa.q.replace(/\n[\s\S]*$/,"")+"\u201d";
        if(qa.hasA&&qa.a){if(ask.mode!=="answer")setAsk("answer");ui.askA.textContent=qa.a;}
      });
    }catch(e){
      if(my!==ask.gen||(e&&e.name==="AbortError"))return;
      setAsk("answer");ui.askA.textContent=e&&e.status===429?"Gemini is busy right now (rate limit). Try again in a minute.":errText(e);ask.a="";return;
    }
    if(my!==ask.gen)return;
    var qa=parseQA(full),question=q.text||qa.q.replace(/\n[\s\S]*$/,"")||"(your question)",answer=qa.a||full.trim();
    ask.q=question;ask.a=answer;
    ui.askQ.textContent="\u201c"+question+"\u201d";ui.askA.textContent=answer;setAsk("answer");
    var h=loadHistory(),u=units[ask.unit];
    h.push({t:Date.now(),sec:u.sec||"",id:sectionId(u),at:u.text.slice(0,80),q:question,a:answer});saveHistory(h);
    speakAnswer(answer,my);
  }
  async function speakAnswer(text,my){
    hush();if(!text)return;
    ask.speaking=true;paintAsk();
    var done=function(){if(my===ask.gen){ask.speaking=false;paintAsk();}};
    if(!voice().device&&cloudReady()){
      try{
        var url=(await cloudSynth(text,voice(),"answer")).url;
        if(my!==ask.gen||ask.mode!=="answer")return;
        player.onerror=null;player.onended=done;player.src=url;player.defaultPlaybackRate=S.rate;player.playbackRate=S.rate;
        await player.play();return;
      }catch(e){if(my!==ask.gen||ask.mode!=="answer")return;}
    }
    if(window.speechSynthesis){
      var u=new SpeechSynthesisUtterance(text);u.rate=S.rate;u.lang="en-US";devVoice=devVoice||pickDeviceVoice();if(devVoice)u.voice=devVoice;
      u.onend=done;u.onerror=done;speechSynthesis.cancel();speechSynthesis.speak(u);
    }else done();
  }
  function hush(){
    if(player){player.onended=null;try{player.pause();}catch(e){}}
    if(window.speechSynthesis)try{speechSynthesis.cancel();}catch(e){}
    ask.speaking=false;
  }
  /* back to the player; "Got it" carries on reading from the sentence you stopped at */
  function endAsk(resume){
    if(!ask.mode)return;
    ask.gen++;if(ask.rec)stopRec(false);
    if(ask.abort)try{ask.abort.abort();}catch(e){}
    hush();setAsk("");
    if(resume&&units.length)playFrom(curSent>=0?curSent:ask.resumeAt);
  }
  function setAsk(m,note){
    ask.mode=m;
    ui.bar.setAttribute("data-mode",m?"ask":"player");
    ui.ask.setAttribute("data-state",m||"off");
    ui.askNote.textContent=note||"";ui.askNote.hidden=!note;
    if(m==="type")setTimeout(function(){ui.askInput.focus();},30);
    if(m==="rec"){ui.askTime.textContent="0s";ui.levels=[];meter(0);}
    paintAsk();placeAskBtn();
  }
  function paintAsk(){
    var m=ask.mode,L=ui.askL,C=ui.askC,R=ui.askR;
    function set(b,show,icon,label,cls){b.hidden=!show;if(!show)return;b.innerHTML=icon;b.setAttribute("aria-label",label);b.title=label;b.className="btn tts-abtn"+(cls?" "+cls:"");}
    set(L,!!m,m==="answer"?ICON.mic:ICON.close,m==="answer"?"Ask more":"Cancel");
    if(m==="rec")set(C,true,ICON.stop,"Done, send my question","tts-rec");
    else if(m==="type")set(C,true,ICON.send,"Ask","primary");
    else if(m==="think")set(C,true,ICON.spark,"Thinking","tts-think");
    else if(m==="answer")set(C,!!ask.a,ask.speaking?ICON.hush:ICON.speaker,ask.speaking?"Stop voice":"Hear it");
    else set(C,false);
    if(m==="rec")set(R,true,ICON.keys,"Type instead");
    else if(m==="type")set(R,true,ICON.mic,"Speak instead");
    else if(m==="answer")set(R,true,ICON.check,"Got it","primary");
    else set(R,false);
    C.disabled=m==="think";
  }

  /* --- the floating "Ask first" button beside the paragraph being read */
  var askHover=false,askHideT=0;
  function placeAskBtn(){
    var b=ui.askBtn;if(!b)return;
    if(!ui.bar||ui.bar.hidden||ask.mode||curUnit<0||!units[curUnit]){b.hidden=true;return;}
    var r=units[curUnit].el.getBoundingClientRect(),m=main.getBoundingClientRect();
    if(!r.width&&!r.height){b.hidden=true;return;}
    var x=r.right+12+30<=m.right?r.right+12:r.right-34;
    b.style.left=(x+scrollX)+"px";b.style.top=(r.top+scrollY+Math.min(6,r.height/2-15))+"px";b.hidden=false;
  }
  function askVisible(v){
    clearTimeout(askHideT);
    if(v){askHover=true;placeAskBtn();ui.askBtn.classList.add("on");}
    else askHideT=setTimeout(function(){askHover=false;ui.askBtn.classList.remove("on");},350);
  }

  /* --- question history */
  function when(t){
    var d=new Date(t),now=new Date(),hm=d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    if(d.toDateString()===now.toDateString())return "Today "+hm;
    var y=new Date(now);y.setDate(now.getDate()-1);
    if(d.toDateString()===y.toDateString())return "Yesterday "+hm;
    return d.toLocaleDateString([],{day:"numeric",month:"short"})+", "+hm;
  }
  function hist(v){
    if(!ui.hist)return;
    ui.hist.hidden=!v;ui.histB.setAttribute("aria-expanded",v?"true":"false");
    if(v)paintHist();
  }
  function paintHist(){
    var list=ui.histList,h=loadHistory().slice().reverse();
    list.innerHTML="";ask.clear=0;ui.histClear.textContent="Clear";ui.histClear.hidden=!h.length;
    if(!h.length){var e=el("li","tts-h-empty");e.textContent="No questions yet. While it reads, point at the highlighted paragraph and press the \u2726 button to ask about it.";list.appendChild(e);return;}
    h.forEach(function(x){
      var li=el("li"),b=el("button","tts-h-item");b.type="button";
      var top=el("span","tts-h-top"),sec=el("b"),tm=el("time");sec.textContent=x.sec||"This page";tm.textContent=when(x.t);top.appendChild(sec);top.appendChild(tm);
      var q=el("span","tts-h-q"),a=el("span","tts-h-a");q.textContent=x.q;a.textContent=x.a;
      b.appendChild(top);b.appendChild(q);b.appendChild(a);li.appendChild(b);list.appendChild(li);
      b.title="Go back to this part";
      b.addEventListener("click",function(){
        hist(false);
        if(!units.length)build();
        var idx=-1;
        for(var k=0;k<units.length;k++)if(units[k].text.slice(0,80)===x.at){idx=k;break;}
        if(idx<0&&x.id){var sect=document.getElementById(x.id);if(sect)for(var k2=0;k2<units.length;k2++)if(sect.contains(units[k2].el)){idx=k2;break;}}
        if(idx>=0){clearHighlights();lastUserScroll=0;playFrom(units[idx].first);}
      });
    });
  }

  function buildUI(){
    if(ui.bar)return;
    var st=el("style");st.textContent=CSS_TEXT;document.head.appendChild(st);
    /* launch: Listen, with the voice settings button beside it */
    ui.launches=[];ui.vbtns=[];
    function launch(where,before){
      if(!where)return;
      var box=el("div","tts-launch dl tts-ui"),row=el("div","dl-row");
      var b=el("button","btn tts-go",ICON.speaker+'<span><b>Listen</b></span>');b.type="button";
      b.addEventListener("click",function(){if(ui.bar.hidden)open();else if(!playing||paused)resume();else ui.pp.focus();});
      var v=btn("dl-fs tts-vbtn",ICON.voice,"Voice");v.setAttribute("aria-expanded","false");
      v.addEventListener("click",function(){var openHere=!ui.vmenu.hidden&&ui.vmenu.parentNode===box;menu(!openHere,box);});
      row.appendChild(b);row.appendChild(v);
      /* the full screen button (from export.js) joins this row */
      var lone=where.querySelector(".dl.dl-fs-only"),fs=lone&&lone.querySelector(".dl-fs");
      if(fs){row.appendChild(fs);if(before===lone)before=lone.nextSibling;lone.remove();}
      box.appendChild(row);where.insertBefore(box,before||null);
      ui.launches.push(b);ui.vbtns.push(v);
    }
    var toc=document.getElementById("toc-nav"),d=document.getElementById("toc-d");
    if(toc)launch(toc,d&&d.parentNode===toc?d:toc.children[1]||null);
    ui.vmenu=el("div","tts-vmenu");ui.vmenu.hidden=true;
    ui.auth=el("div","tts-auth");ui.voices=el("ul","look-list tts-voices");
    ui.vhead=el("small","tts-vhead");
    ui.vmenu.appendChild(ui.auth);ui.vmenu.appendChild(ui.vhead);ui.vmenu.appendChild(ui.voices);
    document.addEventListener("click",function(e){if(!ui.vmenu.hidden&&e.target.isConnected&&!e.target.closest(".tts-launch"))menu(false);});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ui.vmenu.hidden){menu(false);}});

    /* the player */
    var bar=el("div","tts-bar tts-ui");bar.hidden=true;bar.setAttribute("role","region");bar.setAttribute("aria-label","Read aloud");bar.setAttribute("data-mode","player");
    ui.sec=el("b");
    var grab=el("div","tts-grab");grab.setAttribute("aria-hidden","true");
    ui.toast=el("p","tts-toast");ui.toast.hidden=true;ui.toast.setAttribute("role","status");
    var ctl=el("div","tts-ctl");
    ui.prevB=btn("tts-prev",ICON.prev,"Previous paragraph");ui.pp=btn("tts-pp primary",ICON.play,"Play");ui.nextB=btn("tts-next",ICON.next,"Next paragraph");
    ui.rate=el("select");ui.rate.setAttribute("aria-label","Reading speed");
    [0.75,0.9,1,1.1,1.25,1.5,1.75,2].forEach(function(r){var o=el("option");o.value=r;o.textContent=r+"\u00d7";if(r===S.rate)o.selected=true;ui.rate.appendChild(o);});
    ui.histB=btn("tts-histb",ICON.clock,"Questions you asked");ui.histB.setAttribute("aria-expanded","false");
    var mid=el("div","tts-mid");[ui.prevB,ui.pp,ui.nextB].forEach(function(x){mid.appendChild(x);});
    var left=el("div","tts-left"),right=el("div","tts-right");left.appendChild(ui.rate);right.appendChild(ui.histB);
    [left,mid,right].forEach(function(x){ctl.appendChild(x);});
    /* history panel */
    ui.hist=el("div","tts-panel");ui.hist.hidden=true;
    var hh=el("div","tts-h-head"),ht=el("h5");ht.textContent="Questions";ui.histClear=el("button","btn");ui.histClear.type="button";ui.histClear.textContent="Clear";
    hh.appendChild(ht);hh.appendChild(ui.histClear);ui.histList=el("ul","tts-h-list");ui.hist.appendChild(hh);ui.hist.appendChild(ui.histList);
    ui.histClear.addEventListener("click",function(){if(ask.clear){saveHistory([]);paintHist();}else{ask.clear=1;ui.histClear.textContent="Press again to clear";}});
    /* ask view */
    ui.ask=el("div","tts-ask");
    var ah=el("div","tts-ask-head");ah.innerHTML=ICON.spark;ui.askSec=el("span");ah.appendChild(ui.askSec);
    var rec=el("div","tts-ask-rec"),mt=el("div","tts-meter");ui.meterBars=[];
    for(var k=0;k<28;k++){var sp=el("i");mt.appendChild(sp);ui.meterBars.push(sp);}
    ui.askTime=el("span","tts-time");
    rec.appendChild(mt);rec.appendChild(ui.askTime);
    var form=el("form","tts-ask-type");ui.askInput=el("input");ui.askInput.type="text";ui.askInput.placeholder="Type your question";ui.askInput.setAttribute("aria-label","Your question");
    form.appendChild(ui.askInput);
    form.addEventListener("submit",function(e){e.preventDefault();var t=ui.askInput.value.trim();if(!t)return;ui.askInput.value="";sendAsk({text:t});});
    var outBox=el("div","tts-ask-out");ui.askQ=el("p","tts-q");ui.askA=el("p","tts-a");ui.askA.setAttribute("aria-live","polite");outBox.appendChild(ui.askQ);outBox.appendChild(ui.askA);
    ui.askNote=el("p","tts-ask-note");ui.askNote.hidden=true;
    /* one row: [cancel / ask more]  [meter or text box]  [main action] [type / speak / got it] */
    var row=el("div","tts-ask-row"),midc=el("div","tts-ask-mid");midc.appendChild(rec);midc.appendChild(form);
    ui.askL=btn("tts-abtn",ICON.close,"Cancel");ui.askC=btn("tts-abtn",ICON.stop,"Done");ui.askR=btn("tts-abtn",ICON.check,"Got it");
    [ui.askL,midc,ui.askC,ui.askR].forEach(function(x){row.appendChild(x);});
    [ah,ui.askNote,outBox,row].forEach(function(x){ui.ask.appendChild(x);});
    ui.askL.addEventListener("click",function(){if(ask.mode==="answer"){hush();startRec();}else endAsk(true);});
    ui.askC.addEventListener("click",function(){if(ask.mode==="rec")stopRec(true);else if(ask.mode==="type"){if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event("submit",{cancelable:true}));}else if(ask.mode==="answer"){if(ask.speaking){hush();paintAsk();}else speakAnswer(ask.a,ask.gen);}});
    ui.askR.addEventListener("click",function(){if(ask.mode==="rec"){stopRec(false);setAsk("type");}else if(ask.mode==="type")startRec();else if(ask.mode==="answer")endAsk(true);});

    ui.prog=el("s");var pr=el("i","tts-prog");pr.appendChild(ui.prog);
    [grab,ui.toast,ui.hist,ctl,ui.ask,pr].forEach(function(x){bar.appendChild(x);});
    document.body.appendChild(bar);ui.bar=bar;
    dragToClose(bar);
    addEventListener("resize",function(){placeBar();placeAskBtn();});

    ui.pp.addEventListener("click",function(){if(playing&&!paused)pause();else resume();});
    ui.prevB.addEventListener("click",prev);ui.nextB.addEventListener("click",next);
    ui.histB.addEventListener("click",function(){hist(ui.hist.hidden);});
    ui.rate.addEventListener("change",function(){
      S.rate=parseFloat(ui.rate.value)||1;save();
      if(chunk&&chunk.via==="cloud"&&player){player.defaultPlaybackRate=S.rate;player.playbackRate=S.rate;}
      else if(playing&&!paused&&curSent>=0)playFrom(curSent);
    });
    bar.addEventListener("keydown",function(e){
      if(e.key!=="Escape")return;e.stopPropagation();
      if(!ui.hist.hidden){hist(false);ui.histB.focus();}else if(ask.mode)endAsk(true);else close();
    });

    /* the Ask first button */
    ui.askBtn=el("button","tts-askbtn tts-ui",ICON.spark);ui.askBtn.type="button";ui.askBtn.hidden=true;
    ui.askBtn.setAttribute("aria-label","Ask first");ui.askBtn.setAttribute("data-tip","Ask first");
    ui.askBtn.addEventListener("click",function(e){e.stopPropagation();ui.askBtn.classList.remove("on");startAsk();});
    ui.askBtn.addEventListener("mouseenter",function(){askVisible(true);});ui.askBtn.addEventListener("mouseleave",function(){askVisible(false);});
    ui.askBtn.addEventListener("focus",function(){askVisible(true);});ui.askBtn.addEventListener("blur",function(){askVisible(false);});
    document.body.appendChild(ui.askBtn);
    main.addEventListener("mouseover",function(e){
      if(curUnit<0||ui.bar.hidden||ask.mode)return;
      var cur=units[curUnit]&&units[curUnit].el;
      if(cur&&cur.contains(e.target))askVisible(true);else if(askHover)askVisible(false);
    });
    main.addEventListener("mouseleave",function(){if(askHover)askVisible(false);});

    /* "listen from here" on every chapter and section heading */
    main.querySelectorAll(".chapter-head h2, section.sub > h3, main > section > h3").forEach(function(h){
      if(h.querySelector(".tts-here"))return;
      var b=el("button","tts-here",ICON.speaker);b.type="button";b.setAttribute("aria-label","Listen from here: "+h.textContent.trim());b.title="Listen from here";
      b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var target=h.closest(".chapter-head")||h;if(ui.bar.hidden)open(target);else{endAsk(false);build();if(unitOf.has(target)){clearHighlights();playFrom(units[unitOf.get(target)].first);}}});
      h.appendChild(b);
    });
    /* while the reader is open, clicking a paragraph jumps to it */
    main.addEventListener("click",function(e){
      if(ui.bar.hidden||!units.length||ask.mode)return;
      if(e.target.closest("a,button,input,select,textarea,label,summary,.lab-body,[data-xq],.tts-ui,img"))return;
      var sel=window.getSelection&&getSelection();if(sel&&!sel.isCollapsed)return;
      for(var n=e.target;n&&n!==main;n=n.parentElement){if(unitOf.has(n)){clearHighlights();playFrom(units[unitOf.get(n)].first);return;}}
    });
    paint();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildUI);else buildUI();
  if(window.speechSynthesis&&speechSynthesis.addEventListener)speechSynthesis.addEventListener("voiceschanged",function(){devVoice=null;if(ui.vmenu&&!ui.vmenu.hidden)paintMenu();});

  /* for testing in the console: StudyHubTTS.tex("\\frac{1}{\\sqrt2}") */
  window.StudyHubTTS={tex:tex,plain:plain,build:function(){build();return {units:units,sents:sents};}};
})();

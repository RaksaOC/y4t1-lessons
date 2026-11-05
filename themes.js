/* Theme picker. A look is a full design (colour, type, shape); light or dark stays on the existing switch. */
(function(){
  var LOOKS=[{"id":"","name":"Lecture Slides","note":"Black ink, hard edges, condensed capitals","sw":{"l":["#ffffff","#000000","#9b9b9b"],"d":["#0e0e0e","#f2f2f2","#7d7d7d"]}},{"id":"reading-room","name":"Reading Room","note":"Warm paper, clay and serif headlines","fonts":"family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700","sw":{"l":["#faf9f5","#cc785c","#141413"],"d":["#181715","#cc785c","#faf9f5"]}},{"id":"gallery","name":"Quiet Gallery","note":"Calm space, soft greys and one blue","fonts":"family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#0066cc","#1d1d1f"],"d":["#000000","#2997ff","#ffffff"]}},{"id":"open-house","name":"Open House","note":"Friendly, rounded and a rosy welcome","fonts":"family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#ff385c","#222222"],"d":["#181818","#ff385c","#f7f7f7"]}},{"id":"machined","name":"Machined","note":"Square edges, heavy heads, thin body","fonts":"family=Inter:wght@300;400;700","sw":{"l":["#ffffff","#1c69d4","#262626"],"d":["#1a2129","#5a96ea","#ffffff"]}},{"id":"deep-lab","name":"Deep Lab","note":"Austere research, forest bands, mono labels","fonts":"family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#ff7759","#000000"],"d":["#00211c","#ff7759","#ffffff"]}},{"id":"neon-poster","name":"Neon Poster","note":"Huge tight type and glowing colour cards","fonts":"family=Geist:wght@500;700&family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#0088e6","#090909"],"d":["#090909","#0099ff","#ffffff"]}},{"id":"orbit","name":"Orbit","note":"Warm stone, big curves and orange arcs","fonts":"family=Sofia+Sans:wght@400;450;500;700","sw":{"l":["#f3f0ee","#cf4500","#141413"],"d":["#141413","#f37338","#f3f0ee"]}},{"id":"night-session","name":"Night Session","note":"Dark room, green glow and pill buttons","fonts":"family=Figtree:wght@400;600;700","sw":{"l":["#ffffff","#1db954","#121212"],"d":["#121212","#1ed760","#ffffff"]}},{"id":"frosted","name":"Frosted Glass","note":"Soft gradients, frosted cards and glossy buttons","fonts":"family=Inter:wght@400;500;600;700;800","sw":{"l":["#f2f2f7","#0071e3","#000000"],"d":["#000000","#0a84ff","#ffffff"]}},{"id":"clay","name":"Clay Play","note":"Pastel, puffy and soft like modelling clay","fonts":"family=Inter:wght@400;500;600;700","sw":{"l":["#f1edfb","#d9796c","#2e2a3a"],"d":["#1f1b2a","#ffb4a9","#f6f2ff"]}},{"id":"pop-block","name":"Pop Block","note":"Thick outlines, candy colours and hard shadows","fonts":"family=Inter:wght@400;500;700;800","sw":{"l":["#fffbea","#ff5252","#111111"],"d":["#121214","#ff6b6b","#f7f7f7"]}},{"id":"neon-terminal","name":"Neon Terminal","note":"Monospace, neon green and a scanline glow","fonts":"family=JetBrains+Mono:wght@400;500;700","sw":{"l":["#f2f4ef","#c2189b","#0d1a0d"],"d":["#0d0d0d","#ff3bd4","#e6ffe6"]}},{"id":"heads-up","name":"Heads-Up","note":"Cyan hairlines, corner brackets and a grid","fonts":"family=IBM+Plex+Mono:wght@400;500;600","sw":{"l":["#eef5f8","#007c99","#06202b"],"d":["#05090d","#00e5ff","#e0fbff"]}}];
  var KEY="hub-look",root=document.documentElement;
  function find(id){for(var i=0;i<LOOKS.length;i++)if(LOOKS[i].id===id)return LOOKS[i];return LOOKS[0];}
  function fonts(l){
    var el=document.getElementById("look-fonts");
    if(!l.fonts){if(el)el.remove();return;}
    var href="https://fonts.googleapis.com/css2?"+l.fonts+"&display=swap";
    if(!el){el=document.createElement("link");el.id="look-fonts";el.rel="stylesheet";document.head.appendChild(el);}
    if(el.getAttribute("href")!==href)el.setAttribute("href",href);
  }
  function set(l){if(l.id)root.setAttribute("data-look",l.id);else root.removeAttribute("data-look");fonts(l);}
  var saved="";try{saved=localStorage.getItem(KEY)||"";}catch(e){}
  var cur=find(saved);set(cur);

  function isDark(){var a=root.getAttribute("data-theme");if(a)return a==="dark";return !!(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);}
  var SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.4 14.5A8.5 8.5 0 0 1 9.5 3.6a8.5 8.5 0 1 0 10.9 10.9z"/></svg>';
  /* The page's own script still switches light and dark and writes "Dark mode" or "Light mode". Keep that text for screen readers and show an icon instead. */
  function modeIcon(tb){
    tb.classList.add("mode-btn");
    var ic=document.createElement("span");ic.className="mode-ico";ic.setAttribute("aria-hidden","true");
    var lbl=document.getElementById("theme-lbl"),ob;
    function setup(){
      var text=(lbl&&tb.contains(lbl)?lbl.textContent:tb.textContent).trim()||"Dark mode";
      if(!lbl||!tb.contains(lbl)){lbl=document.createElement("span");lbl.textContent=text;}
      lbl.className="sr";
      while(tb.firstChild)tb.removeChild(tb.firstChild);
      tb.appendChild(ic);tb.appendChild(lbl);
    }
    function paint(){
      if(ob)ob.disconnect();
      if(!tb.contains(ic)||!tb.contains(lbl))setup();
      var d=isDark(),next=d?"light":"dark";
      ic.innerHTML=d?SUN:MOON;
      tb.setAttribute("aria-label","Switch to "+next+" mode");tb.title="Switch to "+next+" mode";
      if(window.MutationObserver){ob=ob||new MutationObserver(paint);ob.observe(tb,{childList:true,subtree:true,characterData:true});}
    }
    setup();paint();
    tb.addEventListener("click",function(){setTimeout(paint,0);});
  }
  function build(){
    var tb=document.getElementById("theme-btn");if(!tb||document.getElementById("look-btn"))return;
    var box=document.createElement("div");box.className="look";
    var btn=document.createElement("button");btn.type="button";btn.id="look-btn";btn.className="btn look-btn";btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-controls","look-list");
    var now=document.createElement("span");now.className="look-now";var ico=document.createElement("span");ico.className="ico";ico.setAttribute("aria-hidden","true");ico.textContent="▾";
    btn.appendChild(now);btn.appendChild(ico);
    var ul=document.createElement("ul");ul.className="look-list";ul.id="look-list";ul.hidden=true;
    var opts=LOOKS.map(function(l){
      var li=document.createElement("li"),o=document.createElement("button");o.type="button";o.className="look-opt";o.setAttribute("data-id",l.id);
      var sw=document.createElement("span");sw.className="look-sw";sw.setAttribute("aria-hidden","true");for(var i=0;i<3;i++)sw.appendChild(document.createElement("i"));
      var b=document.createElement("b");b.textContent=l.name;var s=document.createElement("small");s.textContent=l.note;
      o.appendChild(sw);o.appendChild(b);o.appendChild(s);li.appendChild(o);ul.appendChild(li);
      o.addEventListener("click",function(){choose(l);});
      return o;
    });
    var inHub=tb.parentNode.className==="hub-ctl";
    var bar=document.createElement("div");bar.className="look-bar";bar.appendChild(btn);
    tb.parentNode.insertBefore(box,tb);bar.appendChild(tb);box.appendChild(bar);box.appendChild(ul);
    modeIcon(tb);
    function swatches(){var k=isDark()?"d":"l";opts.forEach(function(o,n){var c=LOOKS[n].sw[k],d=o.querySelectorAll(".look-sw i");for(var i=0;i<3;i++)d[i].style.background=c[i];});}
    function paint(){now.innerHTML="";var pre=document.createElement("span");pre.className="look-pre";pre.textContent="Theme: ";now.appendChild(pre);now.appendChild(document.createTextNode(cur.name));btn.setAttribute("aria-label","Theme: "+cur.name+". Choose a theme");opts.forEach(function(o){o.setAttribute("aria-pressed",o.getAttribute("data-id")===cur.id?"true":"false");});}
    function open(v){ul.hidden=!v;btn.setAttribute("aria-expanded",v?"true":"false");ico.textContent=v?"▴":"▾";if(v)swatches();}
    function choose(l){cur=l;set(l);try{if(l.id)localStorage.setItem(KEY,l.id);else localStorage.removeItem(KEY);}catch(e){}paint();window.dispatchEvent(new Event("qc-theme"));}
    btn.addEventListener("click",function(){open(ul.hidden);});
    box.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ul.hidden){open(false);btn.focus();e.stopPropagation();}});
    document.addEventListener("click",function(e){if(!ul.hidden&&inHub&&!box.contains(e.target))open(false);});
    tb.addEventListener("click",swatches);
    paint();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build);else build();
})();

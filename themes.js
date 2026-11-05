/* Theme picker. A look is a full design (colour, type, shape); light or dark stays on the existing switch. */
(function(){
  var LOOKS=[{"id":"","name":"Lecture Slides","note":"Black ink, hard edges, condensed capitals","sw":{"l":["#ffffff","#000000","#9b9b9b"],"d":["#0e0e0e","#f2f2f2","#7d7d7d"]}},{"id":"reading-room","name":"Reading Room","note":"Warm paper, clay and serif headlines","fonts":"family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700","sw":{"l":["#faf9f5","#cc785c","#141413"],"d":["#181715","#cc785c","#faf9f5"]}},{"id":"gallery","name":"Quiet Gallery","note":"Calm space, soft greys and one blue","fonts":"family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#0066cc","#1d1d1f"],"d":["#000000","#2997ff","#ffffff"]}},{"id":"open-house","name":"Open House","note":"Friendly, rounded and a rosy welcome","fonts":"family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#ff385c","#222222"],"d":["#181818","#ff385c","#f7f7f7"]}},{"id":"machined","name":"Machined","note":"Square edges, heavy heads, thin body","fonts":"family=Inter:wght@300;400;700","sw":{"l":["#ffffff","#1c69d4","#262626"],"d":["#1a2129","#5a96ea","#ffffff"]}},{"id":"deep-lab","name":"Deep Lab","note":"Austere research, forest bands, mono labels","fonts":"family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#ff7759","#000000"],"d":["#00211c","#ff7759","#ffffff"]}},{"id":"neon-poster","name":"Neon Poster","note":"Huge tight type and glowing colour cards","fonts":"family=Geist:wght@500;700&family=Inter:wght@400;500;600;700","sw":{"l":["#ffffff","#0088e6","#090909"],"d":["#090909","#0099ff","#ffffff"]}},{"id":"orbit","name":"Orbit","note":"Warm stone, big curves and orange arcs","fonts":"family=Sofia+Sans:wght@400;450;500;700","sw":{"l":["#f3f0ee","#cf4500","#141413"],"d":["#141413","#f37338","#f3f0ee"]}},{"id":"night-session","name":"Night Session","note":"Dark room, green glow and pill buttons","fonts":"family=Figtree:wght@400;600;700","sw":{"l":["#ffffff","#1db954","#121212"],"d":["#121212","#1ed760","#ffffff"]}}];
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
    box.appendChild(btn);box.appendChild(ul);
    if(tb.parentNode.className==="hub-ctl")tb.parentNode.insertBefore(box,tb);else tb.parentNode.insertBefore(box,tb.nextSibling);
    function swatches(){var k=isDark()?"d":"l";opts.forEach(function(o,n){var c=LOOKS[n].sw[k],d=o.querySelectorAll(".look-sw i");for(var i=0;i<3;i++)d[i].style.background=c[i];});}
    function paint(){now.textContent="Theme: "+cur.name;btn.setAttribute("aria-label","Theme: "+cur.name+". Choose a theme");opts.forEach(function(o){o.setAttribute("aria-pressed",o.getAttribute("data-id")===cur.id?"true":"false");});}
    function open(v){ul.hidden=!v;btn.setAttribute("aria-expanded",v?"true":"false");ico.textContent=v?"▴":"▾";if(v)swatches();}
    function choose(l){cur=l;set(l);try{if(l.id)localStorage.setItem(KEY,l.id);else localStorage.removeItem(KEY);}catch(e){}paint();window.dispatchEvent(new Event("qc-theme"));}
    btn.addEventListener("click",function(){open(ul.hidden);});
    box.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ul.hidden){open(false);btn.focus();e.stopPropagation();}});
    document.addEventListener("click",function(e){if(!ul.hidden&&tb.parentNode.className==="hub-ctl"&&!box.contains(e.target))open(false);});
    tb.addEventListener("click",swatches);
    paint();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build);else build();
})();

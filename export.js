/* Subject page tools: a full screen button, and a download of the page as an A4 PDF, or as one PNG per A4 page in a zip, in the current theme.
   The page is rebuilt in a hidden copy at paper width, split only at gaps between blocks, and each
   sheet is drawn by the browser itself from the page's own CSS, so maths, fonts and themes match. */
(function(){
  if(window.top!==window.self)return;
  var W=820,H=1160,MY=52,MX=52,SCALE=2,USABLE=H-MY*2,MAX_KEEP=USABLE*.72,PDF_W=595.28,PDF_H=841.89;
  var WEBKIT=/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/.test(navigator.userAgent);
  /* WebKit misplaces box shadows when an image is scaled while drawing, so there both the copy and the sheets are laid out at full size. */
  var BLANK="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  var COPY_CSS=
    "html{scroll-behavior:auto!important}*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent}"+
    ".toc,.toc-scrim,.progress-pill,.dl{display:none!important}"+
    "body{display:flow-root!important;margin:0!important;padding:0!important;overflow:visible!important;width:"+W+"px}"+
    ".shell{display:block!important;max-width:none!important;margin:0!important;padding:0!important}"+
    "main{display:flow-root!important;margin:0!important;padding:0 "+MX+"px!important;max-width:none!important}"+
    ".tbl,mjx-container{overflow:visible!important}"+
    "mjx-container[display=\"true\"]{max-width:100%!important}"+
    "pre{white-space:pre-wrap!important;overflow:visible!important;overflow-wrap:anywhere}"+
    ".dl-quiz{display:grid;gap:14px}.dl-q{margin:0!important}";
  var running=false,cancelled=false,views=[];

  function isDark(){var a=document.documentElement.getAttribute("data-theme");if(a)return a==="dark";return !!(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);}
  function pause(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function slug(s){return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
  function stop(){if(cancelled)throw new Error("cancelled");}
  function toData(blob){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(r.result);};r.onerror=no;r.readAsDataURL(blob);});}
  function fetchData(url){return fetch(url).then(function(r){if(!r.ok)throw new Error("Could not load "+url);return r.blob();}).then(toData);}

  /* ---------- the hidden copy ---------- */
  function openCopy(){
    return new Promise(function(ok,no){
      var f=document.createElement("iframe");
      f.setAttribute("aria-hidden","true");f.tabIndex=-1;f.title="";
      f.style.cssText="position:fixed;left:-20000px;top:0;width:"+W+"px;height:"+H+"px;border:0;opacity:0;pointer-events:none";
      f.onload=function(){try{if(!f.contentDocument)throw 0;ok(f);}catch(e){f.remove();no(new Error("local"));}};
      f.onerror=function(){f.remove();no(new Error("load"));};
      f.src=location.pathname+location.search;document.body.appendChild(f);
    });
  }
  async function waitMath(win){
    for(var i=0;i<300;i++){if(win.MathJax&&win.MathJax.startup&&win.MathJax.startup.promise)break;stop();await pause(100);}
    if(!(win.MathJax&&win.MathJax.startup&&win.MathJax.startup.promise))throw new Error("The maths did not load. Check your connection and try again.");
    await win.MathJax.startup.promise;
    if(win.MathJax.typesetPromise)await win.MathJax.typesetPromise();
  }
  async function waitImages(doc){
    var imgs=[].slice.call(doc.images);
    imgs.forEach(function(i){i.loading="eager";});
    await Promise.all(imgs.map(function(i){
      return new Promise(function(r){
        if(i.complete&&i.naturalWidth)return r();
        i.addEventListener("load",r,{once:true});i.addEventListener("error",r,{once:true});setTimeout(r,20000);
      });
    }));
  }
  /* Anything that would scroll sideways is scaled to fit, so nothing is hidden on paper. */
  function fitWide(doc){
    var main=doc.querySelector("main"),m=main.getBoundingClientRect(),right=m.right-MX+1,wide=[];
    doc.querySelectorAll("main .tbl,main mjx-container[display=\"true\"],main pre,main .lab-body>*,main .call>*,main>section *").forEach(function(el){
      if(el.closest("svg")&&el.tagName.toLowerCase()!=="svg")return;
      var cs=doc.defaultView.getComputedStyle(el);if(cs.display==="inline"||cs.display==="contents")return;
      var over=el.scrollWidth-el.clientWidth;
      if(el.clientWidth>0&&over>1&&(cs.overflowX==="auto"||cs.overflowX==="scroll"||cs.overflowX==="hidden")){el.style.overflow="visible";el.style.zoom=Math.max(.45,el.clientWidth/el.scrollWidth);}
    });
    doc.querySelectorAll("main .tbl,main mjx-container[display=\"true\"]").forEach(function(el){
      var r=el.getBoundingClientRect(),inner=el.firstElementChild?el.firstElementChild.getBoundingClientRect().right:r.right;
      var room=right-r.left,need=Math.max(r.right,inner)-r.left;
      if(need>room+1&&room>0)el.style.zoom=Math.max(.45,room/need*(parseFloat(el.style.zoom)||1));
    });
    main.querySelectorAll("*").forEach(function(el){if(el.closest("svg")&&el.tagName.toLowerCase()!=="svg")return;var r=el.getBoundingClientRect();if(r.width&&r.right>right+1)wide.push(el.tagName+"."+String(el.className.baseVal===undefined?el.className:"").slice(0,30)+" +"+Math.round(r.right-right));});
    return wide;
  }
  /* A quiz shows one question at a time. Step through it here and stack every question for paper. */
  async function stackQuizzes(win){
    var hosts=win.document.querySelectorAll("[data-xq]");
    for(var h=0;h<hosts.length;h++){
      var host=hosts[h],slide=host.querySelector(".xq-slide"),acts=host.querySelector(".xq-acts"),jumps=host.querySelectorAll(".qdots [data-go]"),list=win.document.createElement("div");
      if(!slide||!jumps.length)continue;
      list.className="dl-quiz";
      for(var i=0;i<jumps.length-1;i++){
        stop();
        var jump=host.querySelector('.qdots [data-go="'+i+'"]');if(!jump)break;
        jump.click();
        if(win.MathJax&&win.MathJax.typesetPromise)await win.MathJax.typesetPromise([slide]);
        var q=win.document.createElement("div");q.className="qc xq dl-q";q.innerHTML=slide.outerHTML;
        if(acts){var a=acts.cloneNode(true);a.querySelectorAll(".row,button").forEach(function(n){n.remove();});if(a.textContent.trim())q.appendChild(a);}
        list.appendChild(q);
      }
      host.innerHTML="";host.appendChild(list);
    }
  }
  async function prepare(win){
    var doc=win.document,root=doc.documentElement,st=doc.createElement("style");
    /* The copy must never change the quiz progress saved for the real page. */
    win.Storage.prototype.setItem=function(){};win.Storage.prototype.removeItem=function(){};
    root.setAttribute("data-theme",isDark()?"dark":"light");
    st.textContent=COPY_CSS+(WEBKIT?"body{zoom:"+SCALE+"}":"");doc.head.appendChild(st);
    doc.querySelectorAll("details").forEach(function(d){d.open=true;});
    win.dispatchEvent(new Event("qc-theme"));win.dispatchEvent(new Event("resize"));
    await waitMath(win);stop();
    await stackQuizzes(win);stop();
    await waitImages(doc);stop();
    if(doc.fonts&&doc.fonts.ready)await doc.fonts.ready;
    var wide=fitWide(doc);
    await settle(doc);
    return wide;
  }
  /* Late fonts can re-wrap text, so only measure once the page height has stopped changing. */
  async function settle(doc){
    var main=doc.querySelector("main"),last=-1,same=0;
    for(var i=0;i<100&&same<6;i++){
      var now=main.getBoundingClientRect().height;
      same=now===last?same+1:0;last=now;stop();
      await pause(200);
    }
  }

  /* ---------- where each sheet may end ---------- */
  function planPages(doc){
    var body=doc.body,top0=body.getBoundingClientRect().top,main=doc.querySelector("main");
    var unit=body.getBoundingClientRect().width/W;
    function box(el){var r=el.getBoundingClientRect();return {t:(r.top-top0)/unit,b:(r.bottom-top0)/unit,h:r.height/unit};}
    var keep=[],KEEP="h1,h2,h3,h4,h5,h6,p,li,tr,dt,dd,pre,figure,figcaption,blockquote,.fig,.call,.lab,.panel,.dl-q,.chapter-head,.legend,.slidebar,.row,.grid2,.chips,mjx-container,img,svg,canvas,input,select,button,label";
    var all=main.getElementsByTagName("*");
    for(var i=0;i<all.length;i++){
      var el=all[i];if(el.closest("svg")&&el.tagName.toLowerCase()!=="svg")continue;
      var hasText=false;for(var n=el.firstChild;n;n=n.nextSibling)if(n.nodeType===3&&n.nodeValue.trim()){hasText=true;break;}
      var b=box(el);if(!b.h)continue;
      var tag=el.tagName.toLowerCase();
      var hard=tag==="tr"||tag==="img"||tag==="svg"||tag==="canvas"||tag==="mjx-container"||hasText;
      if((hard&&b.h<=USABLE)||(el.matches(KEEP)&&b.h<=MAX_KEEP))keep.push([b.t,b.b]);
      if(/^h[1-6]$/.test(tag)||el.matches(".chapter-head,thead")){
        var nx=tag==="thead"?el.parentNode.querySelector("tbody tr"):el.nextElementSibling;
        if(nx){var c=box(nx);if(c.h)keep.push([b.t,c.t+Math.min(c.h,70)]);}
      }
    }
    keep.sort(function(a,b){return a[0]-b[0];});
    var spans=[];keep.forEach(function(s){var l=spans[spans.length-1];if(l&&s[0]<l[1]-.5)l[1]=Math.max(l[1],s[1]);else spans.push([s[0],s[1]]);});
    /* Cut halfway through each gap, so tall letters above or below a block are never clipped. */
    function cutBefore(y){
      for(var k=spans.length-1;k>=0;k--)if(spans[k][0]<=y+.5){
        if(y>=spans[k][1])return (spans[k][1]+y)/2;
        if(y-spans[k][0]>.5)return y;
        return k?(spans[k-1][1]+y)/2:y;
      }
      return y;
    }
    var starts=spans.map(function(s){return s[0];});
    var chapters=[].slice.call(doc.querySelectorAll("section.chapter")).map(function(s){
      var head=s.querySelector(".chapter-head"),h=head&&head.querySelector("h2,h1");
      var label=head?(((head.querySelector(".num")||{}).textContent||"").trim()+" "+(h?h.textContent.trim():"")).trim():"";
      return {y:box(s).t,title:label||(h?h.textContent.trim():"Chapter")};
    });
    var end=box(main).b,pages=[],hard=0,y=spans.length?spans[0][0]:0,marks=[];
    while(y<end-1){
      var limit=y+USABLE,next=null,target=null,forced=null,j;
      for(j=0;j<chapters.length;j++)if(cutBefore(chapters[j].y)>y+1){forced=chapters[j].y;break;}
      if(forced!==null&&forced<=limit){target=forced;next=cutBefore(forced);}
      else if(end<=limit)next=target=end;
      else{
        for(j=starts.length-1;j>=0;j--)if(starts[j]<=limit){if(starts[j]>y+1){target=starts[j];next=cutBefore(target);}break;}
        if(next===null){next=target=limit;hard++;}
      }
      chapters.forEach(function(c){if(!c.done&&c.y>=y-1&&c.y<next-1){c.done=true;marks.push({title:c.title,page:pages.length});}});
      pages.push({y:y,h:next-y});y=Math.max(next,target-10);
    }
    return {pages:pages,hard:hard,chapters:marks};
  }

  /* ---------- the page as an SVG image ---------- */
  function collectCss(win){
    var out=[];
    function walk(rules){
      for(var i=0;i<rules.length;i++){
        var r=rules[i],t=r.constructor&&r.constructor.name;
        if(r.type===4){if(win.matchMedia(r.media.mediaText).matches)walk(r.cssRules);}
        else if(r.type===7||r.type===5||t==="CSSKeyframesRule"||t==="CSSFontFaceRule")continue;
        else if(r.type===12){out.push("@supports "+r.conditionText+"{");walk(r.cssRules);out.push("}");}
        else out.push(r.cssText);
      }
    }
    [].forEach.call(win.document.styleSheets,function(s){var rules;try{rules=s.cssRules;}catch(e){return;}if(rules)walk(rules);});
    /* Viewport units are fixed to the paper size, so scaling a sheet can't change its layout. */
    return out.join("\n").replace(/(^|[^\w.#-])(-?\d*\.?\d+)(vw|vh|vmin|vmax|svh|lvh|dvh|svw|lvw|dvw)\b/g,function(_,pre,n,u){
      var base=/w$/.test(u)||u==="vmin"?W:H;return pre+(parseFloat(n)*base/100)+"px";
    });
  }
  function inRange(list,set){
    return list.split(",").some(function(part){
      var m=part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);if(!m)return true;
      var lo=parseInt(m[1].replace(/\?/g,"0"),16),hi=m[2]?parseInt(m[2],16):parseInt(m[1].replace(/\?/g,"F"),16);
      if(hi-lo>4000){for(var k=0;k<set.length;k++)if(set[k]>=lo&&set[k]<=hi)return true;return false;}
      for(var c=lo;c<=hi;c++)if(set.has(c))return true;return false;
    });
  }
  async function fontCss(doc){
    var seen=new Set(),chars=new Set(),out=[],files={};
    for(var ch of doc.body.textContent)chars.add(ch.codePointAt(0));
    chars.forEach(function(c){seen.add(c);});
    var arr=Array.from(chars);arr.has=function(c){return chars.has(c);};
    var links=[].slice.call(doc.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
    for(var l=0;l<links.length;l++){
      var css=await (await fetch(links[l].href)).text(),faces=css.match(/@font-face\s*\{[^}]*\}/g)||[];
      for(var f=0;f<faces.length;f++){
        var ur=faces[f].match(/unicode-range:\s*([^;}]+)/),url=faces[f].match(/url\(([^)]+)\)/);if(!url)continue;
        if(ur&&!inRange(ur[1],arr))continue;
        var u=url[1].replace(/['"]/g,"");
        files[u]=files[u]||await fetchData(u);
        out.push(faces[f].replace(url[0],"url("+files[u]+")"));
      }
    }
    return out.join("\n");
  }
  function buildSheet(win,css){
    var doc=win.document,clone=doc.body.cloneNode(true),srcs=[],liveC=doc.body.querySelectorAll("canvas"),cloneC=clone.querySelectorAll("canvas");
    var liveF=doc.body.querySelectorAll("input,select,textarea"),cloneF=clone.querySelectorAll("input,select,textarea");
    [].forEach.call(liveF,function(el,i){var c=cloneF[i];
      if(el.tagName==="SELECT"){[].forEach.call(c.options,function(o,k){if(k===el.selectedIndex)o.setAttribute("selected","selected");else o.removeAttribute("selected");});}
      else if(el.tagName==="TEXTAREA")c.textContent=el.value;
      else if(el.type==="checkbox"||el.type==="radio"){if(el.checked)c.setAttribute("checked","checked");else c.removeAttribute("checked");}
      else c.setAttribute("value",el.value);
      /* WebKit sizes form controls differently inside an image. Pin them to their measured size so nothing below moves. */
      var cs=win.getComputedStyle(el);
      if(!WEBKIT||cs.display==="none")return;
      var size="width:"+cs.width+";height:"+cs.height+";margin:"+cs.margin+";box-sizing:border-box;vertical-align:"+cs.verticalAlign+";";
      if(el.type==="range"){
        var max=+el.max||100,min=+el.min||0,at=max>min?Math.min(100,Math.max(0,(el.value-min)/(max-min)*100)):0,sl=doc.createElement("span"),th=doc.createElement("span");
        sl.setAttribute("style",size+"display:"+(cs.display==="inline"?"inline-block":cs.display)+";position:relative;background:linear-gradient(90deg,var(--hi,var(--accent)) "+at+"%,var(--faint) "+at+"%) center/100% 6px no-repeat");
        th.setAttribute("style","position:absolute;top:50%;left:calc((100% - 16px) * "+(at/100)+");width:16px;height:16px;margin-top:-8px;border-radius:50%;background:var(--bg);border:1.5px solid var(--muted);box-sizing:border-box");
        sl.appendChild(th);c.parentNode.replaceChild(sl,c);
      }else c.setAttribute("style",(c.getAttribute("style")||"")+";"+size);
    });
    clone.querySelectorAll("script,noscript,link,style,iframe,.toc,.toc-scrim,.progress-pill").forEach(function(n){n.remove();});
    var liveI=[].slice.call(doc.querySelectorAll("main img")),cloneI=clone.querySelectorAll("main img"),top0=doc.body.getBoundingClientRect().top,unit=doc.body.getBoundingClientRect().width/W,boxes=[];
    [].forEach.call(cloneI,function(c,i){
      var live=liveI[i];if(!live||c.getAttribute("src")&&/^data:/.test(c.getAttribute("src")))return;
      var cs=win.getComputedStyle(live),r=live.getBoundingClientRect();
      srcs.push(live.currentSrc||live.src);boxes.push([(r.top-top0)/unit,(r.bottom-top0)/unit]);
      c.style.width=cs.width;c.style.height=cs.height;c.removeAttribute("srcset");c.removeAttribute("loading");
      c.setAttribute("src","@@IMG"+(srcs.length-1)+"@@");
    });
    [].forEach.call(cloneC,function(c,i){var img=doc.createElement("img"),cs=win.getComputedStyle(liveC[i]);try{img.src=liveC[i].toDataURL();}catch(e){}img.style.cssText="display:"+cs.display+";width:"+cs.width+";height:"+cs.height;img.className=c.className;c.parentNode.replaceChild(img,c);});
    var inner=doc.createElement("div"),clip=doc.createElement("div");
    while(clone.firstChild)inner.appendChild(clone.firstChild);
    inner.setAttribute("style","position:absolute;left:0;top:@@TOP@@px;width:"+W+"px");
    clip.setAttribute("style","position:absolute;left:0;top:"+MY+"px;width:"+W+"px;height:@@HEIGHT@@px;overflow:hidden");
    clip.appendChild(inner);clone.appendChild(clip);
    clone.style.cssText="display:block;margin:0;padding:0;position:relative;overflow:hidden;width:"+W+"px;height:"+H+"px"+(WEBKIT?";zoom:"+SCALE:"");
    var rootAttrs=' data-theme="'+esc(doc.documentElement.getAttribute("data-theme")||"light")+'"';
    if(doc.documentElement.getAttribute("data-look"))rootAttrs+=' data-look="'+esc(doc.documentElement.getAttribute("data-look"))+'"';
    var xml=new XMLSerializer().serializeToString(clone),Z=WEBKIT?SCALE:1;
    return {srcs:srcs,boxes:boxes,xml:'<svg xmlns="http://www.w3.org/2000/svg" width="'+W*Z+'" height="'+H*Z+'"'+rootAttrs+'><style><![CDATA['+css+']]></style><foreignObject x="0" y="0" width="'+W*Z+'" height="'+H*Z+'">'+xml+'</foreignObject></svg>'};
  }
  function loadImage(url){return new Promise(function(ok,no){var i=new Image();i.onload=function(){ok(i);};i.onerror=function(){no(new Error("A page could not be drawn."));};i.src=url;});}
  async function drawPage(sheet,page,n,total,cache,colors){
    var xml=sheet.xml.replace("@@TOP@@",-page.y).replace("@@HEIGHT@@",page.h);
    var needed={};sheet.boxes.forEach(function(b,i){if(b[1]>page.y&&b[0]<page.y+page.h)needed[i]=true;});
    var ids=Object.keys(needed);
    for(var k=0;k<ids.length;k++){var u=sheet.srcs[ids[k]];cache[u]=cache[u]||await fetchData(u);}
    xml=xml.replace(/@@IMG(\d+)@@/g,function(_,i){return needed[i]?cache[sheet.srcs[i]]:BLANK;});
    var img=await loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(xml));
    var c=document.createElement("canvas");c.width=W*SCALE;c.height=H*SCALE;
    var ctx=c.getContext("2d");
    function paint(){
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=colors.bg;ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      ctx.fillStyle=colors.muted;ctx.font=(11*SCALE)+"px "+colors.font;ctx.textAlign="right";ctx.fillText(n+" / "+total,c.width-MX*SCALE,c.height-22*SCALE);
    }
    paint();
    if(WEBKIT){await pause(120);paint();await pause(120);paint();}
    return c;
  }
  function toBlob(c,type,q){return new Promise(function(ok,no){c.toBlob(function(b){b?ok(b):no(new Error("This device ran out of memory."));},type,q);});}

  /* ---------- file writers ---------- */
  function pdfText(s){var h="FEFF";for(var i=0;i<s.length;i++)h+=("000"+s.charCodeAt(i).toString(16)).slice(-4);return "<"+h+">";}
  function makePdf(jpegs,title,marks){
    var parts=[],pos=0,offs=[];
    function put(p){parts.push(p);pos+=typeof p==="string"?p.length:p.size;}
    function open(id){offs[id]=pos;put(id+" 0 obj\n");}
    put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".replace(/[\xE2\xE3\xCF\xD3]/g,"~"));
    var first=5,ids=[];
    jpegs.forEach(function(_,i){ids.push(first+i*3);});
    var outl=first+jpegs.length*3;
    open(1);put("<< /Type /Catalog /Pages 2 0 R"+(marks.length?" /Outlines 4 0 R /PageMode /UseNone":"")+" >>\nendobj\n");
    open(2);put("<< /Type /Pages /Count "+jpegs.length+" /Kids ["+ids.map(function(i){return i+" 0 R";}).join(" ")+"] >>\nendobj\n");
    open(3);put("<< /Title "+pdfText(title)+" /Producer (Year 4 Study Hub) >>\nendobj\n");
    open(4);put("<< /Type /Outlines /Count "+marks.length+(marks.length?" /First "+outl+" 0 R /Last "+(outl+marks.length-1)+" 0 R":"")+" >>\nendobj\n");
    jpegs.forEach(function(j,i){
      var pg=ids[i],ct=pg+1,im=pg+2,draw="q "+PDF_W+" 0 0 "+PDF_H+" 0 0 cm /I Do Q";
      open(pg);put("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+PDF_W+" "+PDF_H+"] /Resources << /XObject << /I "+im+" 0 R >> >> /Contents "+ct+" 0 R >>\nendobj\n");
      open(ct);put("<< /Length "+draw.length+" >>\nstream\n"+draw+"\nendstream\nendobj\n");
      open(im);put("<< /Type /XObject /Subtype /Image /Width "+(W*SCALE)+" /Height "+(H*SCALE)+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+j.size+" >>\nstream\n");put(j);put("\nendstream\nendobj\n");
    });
    marks.forEach(function(m,i){
      var id=outl+i;open(id);
      put("<< /Title "+pdfText(m.title)+" /Parent 4 0 R"+(i?" /Prev "+(id-1)+" 0 R":"")+(i<marks.length-1?" /Next "+(id+1)+" 0 R":"")+" /Dest ["+ids[m.page]+" 0 R /Fit] >>\nendobj\n");
    });
    var count=outl+marks.length,xref=pos,x="xref\n0 "+count+"\n0000000000 65535 f \n";
    for(var n=1;n<count;n++)x+=("000000000"+offs[n]).slice(-10)+" 00000 n \n";
    put(x+"trailer\n<< /Size "+count+" /Root 1 0 R /Info 3 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
    return new Blob(parts,{type:"application/pdf"});
  }
  var CRC=(function(){var t=[],n,k,c;for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(u8){var c=0xFFFFFFFF;for(var i=0;i<u8.length;i++)c=CRC[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  async function makeZip(files){
    var parts=[],central=[],pos=0,enc=new TextEncoder();
    function hdr(sig,fields){var size=4+fields.reduce(function(a,f){return a+f[1];},0),b=new DataView(new ArrayBuffer(size)),o=4;b.setUint32(0,sig,true);fields.forEach(function(f){if(f[1]===2)b.setUint16(o,f[0],true);else b.setUint32(o,f[0],true);o+=f[1];});return new Uint8Array(b.buffer);}
    for(var i=0;i<files.length;i++){
      var f=files[i],name=enc.encode(f.name),data=new Uint8Array(await f.blob.arrayBuffer()),crc=crc32(data),sz=data.length;
      var common=[[20,2],[0x0800,2],[0,2],[0,2],[0x21,2],[crc,4],[sz,4],[sz,4],[name.length,2],[0,2]];
      var head=hdr(0x04034b50,common);parts.push(head,name,f.blob);
      central.push(hdr(0x02014b50,[[20,2]].concat(common,[[0,2],[0,2],[0,2],[0,4],[pos,4]])),name);
      pos+=head.length+name.length+sz;
    }
    var cdSize=central.reduce(function(a,c){return a+c.length;},0);
    return new Blob(parts.concat(central,[hdr(0x06054b50,[[0,2],[0,2],[files.length,2],[files.length,2],[cdSize,4],[pos,4],[0,2]])]),{type:"application/zip"});
  }
  function save(blob,name){
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},120000);
  }

  /* ---------- running an export ---------- */
  function status(msg){views.forEach(function(v){v.status.textContent=msg;v.status.hidden=!msg;});}
  function setBusy(b){views.forEach(function(v){v.label.textContent=b?"Cancel download":"Download";v.ico.textContent=b?"×":"▾";v.menu.hidden=true;v.btn.setAttribute("aria-expanded","false");});}
  function fileBase(){
    var subject=document.title.split(":")[0],root=document.documentElement,lookEl=document.querySelector(".look-now");
    var look=root.getAttribute("data-look")||(lookEl?lookEl.textContent.replace(/^Theme:\s*/,""):"lecture-slides");
    return slug(subject)+"-"+slug(look)+"-"+(isDark()?"dark":"light");
  }
  async function run(kind){
    if(running)return;running=true;cancelled=false;setBusy(true);status("Preparing the pages. This can take a minute.");
    var frame=null,started=Date.now();
    try{
      frame=await openCopy();stop();
      var win=frame.contentWindow,doc=win.document,wide=await prepare(win);stop();
      var css=collectCss(win),fonts=await fontCss(doc);stop();
      await settle(doc);
      var plan=planPages(doc),total=plan.pages.length;
      var sheet=buildSheet(win,fonts+"\n"+css),cs=win.getComputedStyle(doc.body),cache={},out=[],base=fileBase();
      var colors={bg:cs.backgroundColor&&cs.backgroundColor!=="rgba(0, 0, 0, 0)"?cs.backgroundColor:win.getComputedStyle(doc.documentElement).getPropertyValue("--bg")||"#fff",muted:win.getComputedStyle(doc.documentElement).getPropertyValue("--muted").trim()||cs.color,font:cs.fontFamily};
      for(var i=0;i<total;i++){
        stop();status("Page "+(i+1)+" of "+total);
        var c=await drawPage(sheet,plan.pages[i],i+1,total,cache,colors);
        if(kind==="pdf")out.push(await toBlob(c,"image/jpeg",.9));
        else out.push({name:base+"-page-"+("00"+(i+1)).slice(-3)+".png",blob:await toBlob(c,"image/png")});
        c.width=c.height=0;
      }
      status("Saving the file.");
      var blob=kind==="pdf"?makePdf(out,document.title.split("·")[0].trim(),plan.chapters):await makeZip(out);
      save(blob,base+(kind==="pdf"?".pdf":"-png.zip"));
      window.hubExportReport={kind:kind,pages:total,mainHeight:Math.round(doc.querySelector("main").getBoundingClientRect().height),hardCuts:plan.hard,wide:wide,bytes:blob.size,seconds:Math.round((Date.now()-started)/1000),chapters:plan.chapters};
      status("Saved "+total+" pages ("+(blob.size/1048576).toFixed(1)+" MB).");
    }catch(e){
      if(e&&e.message==="cancelled")status("Download cancelled.");
      else{
        if(window.console)console.error(e);
        status(e&&e.message==="local"?"Downloads work on the live site or a local server, not from a file opened directly.":(e&&e.message&&/maths|memory/.test(e.message)?e.message:"The file could not be made. Please try again."));
        window.hubExportReport={error:String(e&&e.stack||e)};
      }
    }finally{
      if(frame)frame.remove();
      running=false;setBusy(false);
    }
  }

  /* ---------- the full screen button ---------- */
  var FS_ENTER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var FS_EXIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  var fsButtons=[];
  function fsElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
  function paintFullscreen(){
    var on=!!fsElement(),label=on?"Exit full screen":"Full screen";
    fsButtons.forEach(function(b){b.innerHTML=on?FS_EXIT:FS_ENTER;b.setAttribute("aria-label",label);b.title=label;b.setAttribute("aria-pressed",on?"true":"false");});
  }
  function fullscreenButton(){
    var root=document.documentElement;
    if(!(root.requestFullscreen||root.webkitRequestFullscreen))return null;
    var b=document.createElement("button");b.type="button";b.className="btn dl-fs";
    b.addEventListener("click",function(){
      if(fsElement()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);return;}
      var p=(root.requestFullscreen||root.webkitRequestFullscreen).call(root);
      if(p&&p.catch)p.catch(function(){status("This browser did not allow full screen.");});
    });
    fsButtons.push(b);return b;
  }
  document.addEventListener("fullscreenchange",paintFullscreen);document.addEventListener("webkitfullscreenchange",paintFullscreen);

  /* ---------- the button and its menu ---------- */
  function build(where,before){
    var box=document.createElement("div");box.className="dl";
    var btn=document.createElement("button");btn.type="button";btn.className="btn dl-btn";btn.setAttribute("aria-expanded","false");btn.setAttribute("aria-haspopup","true");
    var label=document.createElement("span");label.textContent="Download";
    var ico=document.createElement("span");ico.className="ico";ico.setAttribute("aria-hidden","true");ico.textContent="▾";
    btn.appendChild(label);btn.appendChild(ico);
    var menu=document.createElement("ul");menu.className="look-list dl-menu";menu.hidden=true;
    [["pdf","PDF","A4 pages in this theme, ready to print or annotate"],["png","PNG","One image per A4 page, in a zip"]].forEach(function(o){
      var li=document.createElement("li"),b=document.createElement("button");b.type="button";b.className="look-opt dl-opt";b.setAttribute("data-kind",o[0]);
      var t=document.createElement("b");t.textContent=o[1];var s=document.createElement("small");s.textContent=o[2];
      b.appendChild(t);b.appendChild(s);li.appendChild(b);menu.appendChild(li);
      b.addEventListener("click",function(){run(o[0]);});
    });
    var st=document.createElement("p");st.className="dl-status";st.setAttribute("role","status");st.hidden=true;
    var row=document.createElement("div");row.className="dl-row";row.appendChild(btn);
    var fs=fullscreenButton();if(fs)row.appendChild(fs);
    box.appendChild(row);box.appendChild(menu);box.appendChild(st);
    where.insertBefore(box,before||null);
    function open(v){menu.hidden=!v;btn.setAttribute("aria-expanded",v?"true":"false");ico.textContent=v?"▴":"▾";}
    if(fs)fs.addEventListener("click",function(){open(false);});
    btn.addEventListener("click",function(){if(running){cancelled=true;status("Cancelling.");return;}open(menu.hidden);});
    box.addEventListener("keydown",function(e){if(e.key==="Escape"&&!menu.hidden){open(false);btn.focus();e.stopPropagation();}});
    document.addEventListener("click",function(e){if(!menu.hidden&&!box.contains(e.target))open(false);});
    views.push({btn:btn,label:label,ico:ico,menu:menu,status:st});
  }
  function init(){
    var toc=document.getElementById("toc-nav"),d=document.getElementById("toc-d"),hero=document.querySelector(".hero"),legend=hero&&hero.querySelector(".legend");
    if(toc)build(toc,d&&d.parentNode===toc?d:toc.children[1]||null);
    if(hero)build(hero,legend);
    paintFullscreen();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

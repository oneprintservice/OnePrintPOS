(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const canvas = document.getElementById("printCanvas");
  const panel = document.getElementById("previewPanel");
  const title = document.getElementById("previewTitle");
  if (!canvas || !panel) return;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const rect = (x,y,w,h,fill,stroke="none",sw=0,rx=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const line = (x1,y1,x2,y2,stroke="#111",sw=.25) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const text = (x,y,t,size=3.2,weight=400,fill="#111") => `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(t)}</text>`;
  const header = (name,sub) => `${text(5,8,"ONEPRINT REPAIR SERVICE",4.1,700)}${text(5,14,name,6,700)}${text(5,19,sub,2.7,400,"#444")}${line(5,23,205,23,"#333",.35)}`;
  const footer = () => `${line(5,294,205,294,"#888",.2)}${text(5,299,"oneprintservice.web.id  |  Printer Quality Test",2.5,400,"#555")}${text(161,299,"A4 PORTRAIT",2.5,700,"#555")}`;
  const label = (x,y,t) => text(x,y,t,3.1,700);
  const box = (x,y,w,h,titleText,content) => `${rect(x,y,w,h,"#fff","#777",.25,0)}${label(x+2,y+4,titleText)}${content}`;

  function mono(kind) {
    const diagnostic = kind === "diagnostic-mono";
    let s = header(diagnostic ? "DIAGNOSTIC MONO PATTERN" : "BASIC MONO TEST PAGE",
      diagnostic ? "Visual diagnostic aid | Monochrome | Compare uniformity, line quality and density" : "Basic print quality check | Text, line sharpness, grayscale and solid black");
    // Full-width text panel: samples remain inside the border, including the largest type.
    let samples = "";
    [2.2,2.8,3.4,4.2,5.2].forEach((v,i) => {
      const y = 36 + i*5.8;
      samples += text(8,y,`The quick brown fox 0123456789  |  ${v.toFixed(1)} mm sample`,v*1.08,400);
    });
    samples += text(8,66,"ABCDEFGHIJKLMNOPQRSTUVWXYZ  abcdefghijklmnopqrstuvwxyz",2.7,400);
    s += box(5,27,200,43,"TEXT & EDGE QUALITY — FULL WIDTH",samples);

    let shades="";
    for(let i=0;i<10;i++){let g=Math.round(255-i*25.5);shades+=rect(8+i*19,81,19,18,`rgb(${g},${g},${g})`,"#777",.15)+text(14+i*19,103,String(i+1),2.5,700);}
    s += box(5,74,200,36,"GRAYSCALE 10 STEPS",shades);

    s += box(5,114,96,54,"SOLID BLACK & MIDTONE",
      rect(8,122,28,25,"#000")+rect(39,122,28,25,"#555")+rect(70,122,28,25,"#aaa")+
      text(12,153,"100% BLACK",2.3,700)+text(43,153,"MIDTONE",2.3,700)+text(77,153,"LIGHT",2.3,700));
    let fine="";
    for(let i=0;i<24;i++){let y=122+i*.72;fine+=line(108,y,199,y,"#111",i%4===0?.35:.12);}
    for(let i=0;i<18;i++){let x=110+i*5;fine+=line(x,143,x,163,"#111",i%3===0?.35:.12);}
    s += box(105,114,96,54,"FINE HORIZONTAL / VERTICAL LINES",fine);

    let repeat="";
    for(let i=0;i<30;i++){repeat+=line(8,177+i*.65,98,177+i*.65,"#111",.16);repeat+=line(110+i*3,177,110+i*3,197,"#111",.16);}
    s += box(5,172,200,30,"REPEATING LINE PATTERN",repeat);

    if(diagnostic){
      let dots="";
      // Fill nearly the complete inner panel with a consistent halftone matrix.
      for(let y=0;y<12;y++)for(let x=0;x<43;x++){
        const r = [0.42,0.62,0.82][(x+y)%3];
        dots+=`<circle cx="${9+x*2.05}" cy="${213+y*2.55}" r="${r}" fill="#111"/>`;
      }
      s += box(5,206,96,44,"HALFTONE / DOT UNIFORMITY",dots);
      let grid="";
      for(let i=0;i<=10;i++){grid+=line(112+i*8,212,112+i*8,239,"#111",.2);grid+=line(112,212+i*2.7,192,212+i*2.7,"#111",.2);}
      s += box(105,206,100,44,"GEOMETRY / REGISTRATION",grid);
      let repeatDefect = "";
      // Repeating marks at fixed intervals act as a drum/roller defect reference.
      for(let row=0;row<3;row++){
        const yy=260+row*8;
        repeatDefect += text(8,yy+1.5,`ROW ${row+1}`,2.2,700,"#555");
        for(let i=0;i<13;i++){
          const xx=27+i*13.2;
          repeatDefect += rect(xx,yy-2.2,2.2,4.4,i%4===0?"#111":"#777");
          repeatDefect += line(xx+5,yy-2.2,xx+5,yy+2.2,"#222",.25);
        }
      }
      repeatDefect += text(8,286,"Banding / spots repeating at equal intervals may indicate roller or drum contamination.",2.45,400,"#444");
      s += box(5,254,200,36,"REPEATING DEFECT TESTER — INTERVAL REFERENCE",repeatDefect);
    } else {
      let edgeTester = "";
      // Practical print targets: thin horizontal/vertical lines, diagonals and edge steps.
      for(let i=0;i<9;i++){
        const yy=218+i*1.75;
        edgeTester += line(9,yy,100,yy,"#111",i%3===0?.35:.12);
      }
      for(let i=0;i<13;i++){
        const xx=112+i*6.8;
        edgeTester += line(xx,215,xx,232,"#111",i%3===0?.35:.12);
      }
      edgeTester += line(9,239,96,215,"#111",.35)+line(9,241,96,217,"#777",.2);
      for(let i=0;i<8;i++) edgeTester += rect(112+i*10.5,237,10.5,Math.max(1.5,10-i*1.1),i%2?"#777":"#111");
      s += box(5,207,200,40,"LINE & EDGE CHECK — PRINT TARGETS",edgeTester);
      s += box(5,251,200,37,"PRINT OBSERVATION",
        text(8,263,"□ Broken lines  □ Jagged edges  □ Smearing  □ Banding  □ Uneven density",2.7)+
        text(8,274,"Check diagonal edges and fine lines at normal viewing distance.",2.7)+
        text(8,283,"Compare left / center / right areas for consistency.",2.7));
    }
    return `<svg xmlns="${NS}" viewBox="0 0 210 304.2" role="img" aria-label="${diagnostic?"Diagnostic":"Basic"} monochrome test pattern">${s}${footer()}</svg>`;
  }

  function color(kind) {
    const diagnostic = kind === "diagnostic-color";
    let s = header(diagnostic ? "DIAGNOSTIC COLOR PATTERN" : "BASIC COLOR TEST PAGE",
      diagnostic ? "Visual diagnostic aid | CMYK, RGB, halftone and registration" : "Basic color quality check | CMYK, RGB and gradients");
    const colors=[ ["CYAN","#00AEEF"],["MAGENTA","#EC008C"],["YELLOW","#FFF200"],["BLACK","#111111"],["RED","#ED1C24"],["GREEN","#00A651"],["BLUE","#21409A"],["GRAY","#808080"] ];
    let blocks="";
    colors.forEach((c,i)=>{const x=8+(i%4)*49.2,y=34+Math.floor(i/4)*29;blocks+=rect(x,y,45,20,c[1],"#777",.15)+text(x,y+24,c[0],2.6,700);});
    s += box(5,27,200,70,"SOLID COLOR BLOCKS",blocks);

    let gradients="";
    const cols=["#00AEEF","#EC008C","#FFF200","#111111"];
    cols.forEach((c,i)=>{const y=106+i*13;gradients+=`<defs><linearGradient id="g${i}" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`+rect(8,y,190,8,`url(#g${i})`,"#777",.15)+text(8,y+11,["CYAN","MAGENTA","YELLOW","BLACK"][i],2.3,700);});
    s += box(5,101,200,66,"INDIVIDUAL COLOR GRADIENTS",gradients);

    // Exact Venn regions are painted as solid fills clipped to the geometric
    // intersection of circles. This avoids browser/driver blend-mode differences.
    const venn = (prefix, x, y, mode) => {
      // Equilateral arrangement: all three circles overlap one another AND
      // share a real central intersection. Earlier geometry used a 40-unit
      // top gap with 18-unit radii, so the top circles never intersected.
      const isRgb = mode === "rgb";
      const c = isRgb
        ? [{id:"a",cx:x+29,cy:y+29,r:25,fill:"#FF0000",label:"R",lx:x+17,ly:y+12},
           {id:"b",cx:x+63,cy:y+29,r:25,fill:"#00FF00",label:"G",lx:x+67,ly:y+12},
           {id:"c",cx:x+46,cy:y+58,r:25,fill:"#0000FF",label:"B",lx:x+44,ly:y+84}]
        : [{id:"a",cx:x+29,cy:y+29,r:25,fill:"#00FFFF",label:"C",lx:x+17,ly:y+12},
           {id:"b",cx:x+63,cy:y+29,r:25,fill:"#FF00FF",label:"M",lx:x+67,ly:y+12},
           {id:"c",cx:x+46,cy:y+58,r:25,fill:"#FFFF00",label:"Y",lx:x+44,ly:y+84}];
      const defs = c.map(o=>`<clipPath id="${prefix}${o.id}" clipPathUnits="userSpaceOnUse"><circle cx="${o.cx}" cy="${o.cy}" r="${o.r}"/></clipPath>`).join("");
      const pair = (a,b,fill) => `<g clip-path="url(#${prefix}${a})"><g clip-path="url(#${prefix}${b})">${rect(x+1,y+1,94,88,fill)}</g></g>`;
      let out = `<defs>${defs}</defs>`;
      // Draw primary discs first, then overwrite each pairwise intersection
      // with its correct secondary colour, and finally the triple intersection.
      c.forEach(o=>{out+=`<circle cx="${o.cx}" cy="${o.cy}" r="${o.r}" fill="${o.fill}"/>`;});
      if(isRgb) {
        out += pair("a","b","#FFFF00"); // R + G = yellow
        out += pair("a","c","#FF00FF"); // R + B = magenta
        out += pair("b","c","#00FFFF"); // G + B = cyan
        out += `<g clip-path="url(#${prefix}a)"><g clip-path="url(#${prefix}b)"><g clip-path="url(#${prefix}c)">${rect(x+1,y+1,94,88,"#FFFFFF")}</g></g></g>`;
      } else {
        out += pair("a","b","#0000FF"); // C + M = blue
        out += pair("a","c","#00A000"); // C + Y = green
        out += pair("b","c","#FF0000"); // M + Y = red
        out += `<g clip-path="url(#${prefix}a)"><g clip-path="url(#${prefix}b)"><g clip-path="url(#${prefix}c)">${rect(x+1,y+1,94,88,"#000000")}</g></g></g>`;
      }
      c.forEach(o=>{out+=text(o.lx,o.ly,o.label,3.1,700,"#111111");});
      return out;
    };
    // More breathing room inside each frame prevents the circle edges touching
    // or appearing cut by the surrounding rectangular border.
    s += box(5,171,96,88,"RGB ADDITIVE — CAHAYA",venn("rgb",6,172,"rgb"));
    s += box(105,171,100,88,"CMY SUBTRACTIVE — TINTA",venn("cmy",108,172,"cmy") + rect(184,247,12,5,"#111111","#555",.15) + text(188,245,"K",2.5,700));

    if(diagnostic){
      // Keep all diagnostic dots clipped to their own lower-page panel.
      // Explicit coordinates prevent the pattern from escaping to page origin.
      const dotClipId = "diagnosticHalftoneClip";
      let halftone = `<defs><clipPath id="${dotClipId}" clipPathUnits="userSpaceOnUse"><rect x="7" y="269" width="196" height="17"/></clipPath></defs><g clip-path="url(#${dotClipId})">`;
      const ink = ["#00AEEF","#EC008C","#FFF200","#111111"];
      // Airy, clearly separated round dots: spacing exceeds dot diameter
      // in both directions so the pattern cannot read as bars or skewers.
      ink.forEach((color,index)=>{
        for(let row=0;row<4;row++) for(let col=0;col<8;col++) {
          const cx = 13 + index*48.5 + col*4.25;
          const cy = 271 + row*3.9;
          halftone += `<circle cx="${cx}" cy="${cy}" r="0.9" fill="${color}"/>`;
        }
      });
      halftone += "</g>";
      s += box(5,263,200,27,"CMYK HALFTONE / DOT PATTERN — FULL WIDTH",halftone);
    } else {
      s += box(5,263,200,27,"COLOR OBSERVATION",
        text(8,276,"□ Missing color  □ Uneven fill  □ Banding  □ Unexpected color cast",2.7)+
        text(8,285,"Compare solid blocks, gradients and overlap areas.",2.7));
    }
    return `<svg xmlns="${NS}" viewBox="0 0 210 304.2" role="img" aria-label="${diagnostic?"Diagnostic":"Basic"} color test pattern">${s}${footer()}</svg>`;
  }

  const configs = {
    "basic-mono": ["Basic Mono Test", mono],
    "basic-color": ["Basic Color Test", color],
    "diagnostic-mono": ["Diagnostic Mono", mono],
    "diagnostic-color": ["Diagnostic Color", color]
  };
  document.querySelectorAll("[data-test]").forEach(btn => btn.addEventListener("click", () => {
    const key = btn.dataset.test, config = configs[key];
    if (!config) return;
    title.textContent = config[0];
    canvas.innerHTML = config[1](key);
    panel.hidden = false;
    panel.scrollIntoView({behavior:"smooth",block:"start"});
  }));
  document.getElementById("closePreview")?.addEventListener("click",()=>{panel.hidden=true;canvas.innerHTML="";});
  document.getElementById("printButton")?.addEventListener("click",()=>{if(!canvas.innerHTML)return;window.print();});
})();

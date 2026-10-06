(function(){"use strict";function k(n){const e=window.innerWidth,t=window.innerHeight,i=Math.max(0,n.x),o=Math.max(0,n.y),r=Math.min(e,n.x+n.width),a=Math.min(t,n.y+n.height),c={x:i,y:o,width:Math.max(0,r-i),height:Math.max(0,a-o)},u=n.x<0||n.y<0||n.x+n.width>e+1||n.y+n.height>t+1;return{rect:c,clipped:u}}function C(n){const e=n.tagName.toLowerCase(),t=n.id?`#${n.id}`:"",i=typeof n.className=="string"&&n.className.trim()?"."+n.className.trim().split(/\s+/).slice(0,2).join("."):"";return`${e}${t}${i}`}function T(n){if(!n)return!1;if(n===document.documentElement||n===document.body)return!0;const e=n.getBoundingClientRect();return e.width>=2&&e.height>=2}class M{constructor(e,t){this.host=t,this.root=e,this.overlay=document.createElement("div"),this.overlay.className="uxe-overlay",this.box=document.createElement("div"),this.box.className="uxe-box",this.box.style.display="none",this.label=document.createElement("div"),this.label.className="uxe-label",this.label.style.display="none",this.hint=document.createElement("div"),this.hint.className="uxe-hint",this.hint.innerHTML="<span><b>Click</b> element</span><span><b>Drag</b> region</span><span><kbd>↑</kbd><kbd>↓</kbd> parent / child</span><span><kbd>Esc</kbd> cancel</span>"}root;overlay;box;label;hint;hovered=null;descentStack=[];pointer={x:0,y:0};dragStart=null;dragging=!1;resolve;done=!1;start(){return this.root.append(this.overlay,this.box,this.label,this.hint),this.host.dataset.mode="select",this.overlay.addEventListener("mousemove",this.onMove),this.overlay.addEventListener("mousedown",this.onDown),this.overlay.addEventListener("mouseup",this.onUp),this.overlay.addEventListener("contextmenu",this.prevent),window.addEventListener("keydown",this.onKey,!0),window.addEventListener("scroll",this.onScroll,!0),window.addEventListener("resize",this.onScroll),window.addEventListener("blur",this.onBlur),new Promise(e=>{this.resolve=e})}finish(e){this.done||(this.done=!0,this.overlay.removeEventListener("mousemove",this.onMove),this.overlay.removeEventListener("mousedown",this.onDown),this.overlay.removeEventListener("mouseup",this.onUp),this.overlay.removeEventListener("contextmenu",this.prevent),window.removeEventListener("keydown",this.onKey,!0),window.removeEventListener("scroll",this.onScroll,!0),window.removeEventListener("resize",this.onScroll),window.removeEventListener("blur",this.onBlur),this.overlay.remove(),this.box.remove(),this.label.remove(),this.hint.remove(),this.host.dataset.mode="idle",this.resolve(e))}cancel(){this.finish(null)}elementAt(e,t){const i=document.elementsFromPoint(e,t);for(const o of i)if(!(o===this.host||this.host.contains(o))&&T(o))return o;return null}setHovered(e,t=!0){this.hovered=e,t&&(this.descentStack=[]),this.paint()}paint(){if(this.dragging)return;const e=this.hovered;if(!e){this.box.style.display="none",this.label.style.display="none";return}const t=e.getBoundingClientRect();this.drawBox(t.x,t.y,t.width,t.height,!1),this.label.textContent="";const i=document.createElement("b");i.textContent=`${Math.round(t.width)}×${Math.round(t.height)}`,this.label.append(C(e),"  ",i),this.positionLabel(t.x,t.y,t.height)}drawBox(e,t,i,o,r){this.box.style.display="block",this.box.classList.toggle("region",r),this.box.style.left=`${e}px`,this.box.style.top=`${t}px`,this.box.style.width=`${i}px`,this.box.style.height=`${o}px`}positionLabel(e,t,i){this.label.style.display="block";const o=t-26;this.label.style.left=`${Math.max(4,e)}px`,this.label.style.top=`${o>=4?o:Math.min(window.innerHeight-26,t+i+4)}px`}prevent=e=>e.preventDefault();onMove=e=>{if(this.pointer={x:e.clientX,y:e.clientY},this.dragStart){const i=e.clientX-this.dragStart.x,o=e.clientY-this.dragStart.y;if(!this.dragging&&Math.hypot(i,o)>=6&&(this.dragging=!0,this.label.style.display="none"),this.dragging){const r=this.dragRect(e.clientX,e.clientY);this.drawBox(r.x,r.y,r.width,r.height,!0);return}}const t=this.elementAt(e.clientX,e.clientY);t!==this.hovered&&this.setHovered(t)};onScroll=()=>{if(this.dragging)return;const e=this.elementAt(this.pointer.x,this.pointer.y);e!==this.hovered?this.setHovered(e):this.paint()};onDown=e=>{e.button===0&&(e.preventDefault(),this.dragStart={x:e.clientX,y:e.clientY})};onUp=e=>{if(!(e.button!==0||!this.dragStart)){if(e.preventDefault(),this.dragging){const t=this.dragRect(e.clientX,e.clientY);if(this.dragStart=null,this.dragging=!1,t.width<4||t.height<4){this.paint();return}this.finish({rect:k(t).rect,mode:"region",clipped:!1});return}this.dragStart=null,this.captureHovered()}};dragRect(e,t){const i=this.dragStart;return{x:Math.min(i.x,e),y:Math.min(i.y,t),width:Math.abs(e-i.x),height:Math.abs(t-i.y)}}onKey=e=>{switch(e.key){case"Escape":e.preventDefault(),e.stopPropagation(),this.finish(null);return;case"Enter":e.preventDefault(),e.stopPropagation(),this.captureHovered();return;case"ArrowUp":{if(!this.hovered)return;e.preventDefault(),e.stopPropagation();const t=this.hovered.parentElement;t&&t!==document.documentElement&&(this.descentStack.push(this.hovered),this.setHovered(t,!1));return}case"ArrowDown":{const t=this.descentStack.pop();if(!t)return;e.preventDefault(),e.stopPropagation(),this.setHovered(t,!1);return}default:return}};onBlur=()=>{this.dragStart=null,this.dragging=!1,this.paint()};captureHovered(){if(!this.hovered)return;const{rect:e,clipped:t}=k(this.hovered.getBoundingClientRect());e.width<2||e.height<2||this.finish({rect:e,mode:"element",clipped:t})}}const E=["Navigation","Hero","Product Page","Checkout","CTA","Form","Search","Content","Social Proof","Pricing","Mobile UX","Accessibility","CRO","Interaction","Other"];function L(n){return typeof n=="string"&&E.includes(n)}function S(n){const e=new Set,t=[];for(const i of n){const o=i.trim().replace(/^#/,"").slice(0,32);if(!o)continue;const r=o.toLowerCase();e.has(r)||(e.add(r),t.push(o))}return t.slice(0,12)}const I=8;function P(n){switch(n){case"Product page":return"Product Page";case"Checkout":case"Cart":return"Checkout";case"Pricing":return"Pricing";case"Search results":return"Search";case"Homepage":return"Hero";case"Account / auth":return"Form";case"Article":return"Content";default:return"Other"}}function s(n,e,t){const i=document.createElement(n);return e&&(i.className=e),t!==void 0&&(i.textContent=t),i}function w(n,e=14){const t=document.createElementNS("http://www.w3.org/2000/svg","svg");return t.setAttribute("width",String(e)),t.setAttribute("height",String(e)),t.setAttribute("viewBox","0 0 24 24"),t.setAttribute("fill","none"),t.setAttribute("stroke","currentColor"),t.setAttribute("stroke-width","2.2"),t.setAttribute("stroke-linecap","round"),t.setAttribute("stroke-linejoin","round"),t.innerHTML=n,t}const $='<path d="M18 6 6 18M6 6l12 12"/>',B='<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',H='<polyline points="9 18 15 12 9 6"/>';class R{constructor(e,t,i,o){this.root=e,this.host=t,this.draft=i,this.knownTags=o}scrim=s("div","uxe-scrim");tags=[];resolve;settled=!1;category;observation;why;notes;tagInput;tagWrap;suggestWrap;saveBtn;obsError;open(){return this.build(),this.root.append(this.scrim),this.host.dataset.mode="form",window.addEventListener("keydown",this.onKey,!0),requestAnimationFrame(()=>this.observation.focus()),new Promise(e=>{this.resolve=e})}close(e){this.settled||(this.settled=!0,window.removeEventListener("keydown",this.onKey,!0),this.scrim.remove(),this.host.dataset.mode="idle",this.resolve(e))}setBusy(e){this.saveBtn.disabled=e,this.saveBtn.textContent=e?"Saving…":"Save Evidence"}reopen(){return this.settled=!1,this.root.append(this.scrim),this.host.dataset.mode="form",window.addEventListener("keydown",this.onKey,!0),this.setBusy(!1),new Promise(e=>{this.resolve=e})}build(){const e=s("div","uxe-panel");e.setAttribute("role","dialog"),e.setAttribute("aria-label","Save UX evidence");const t=s("div","uxe-head"),i=s("div");i.append(s("h2",void 0,"Save evidence"));const o=s("div","uxe-source");o.textContent=`${this.draft.context.domain} · ${this.draft.context.pageTitle||this.draft.context.url}`,o.title=this.draft.context.url,i.append(o);const r=s("button","uxe-iconbtn");r.type="button",r.setAttribute("aria-label","Cancel"),r.append(w($,16)),r.addEventListener("click",()=>this.cancel()),t.append(i,r);const a=s("div","uxe-body"),c=s("div","uxe-preview"),u=s("img");if(u.src=this.draft.previewUrl,u.alt="Captured screenshot",c.append(u,s("span","uxe-dim",`${this.draft.previewWidth}×${this.draft.previewHeight}`)),a.append(c),this.draft.clipped){const v=s("div","uxe-clipped");v.append(w(B,14),s("span",void 0,"The element extends beyond the visible area. Only the visible part was captured.")),a.append(v)}this.category=s("select","uxe-select");for(const v of E){const A=s("option",void 0,v);A.value=v,this.category.append(A)}const y=P(this.draft.context.pageType);this.category.value=L(y)?y:"Other",a.append(this.field("Category",this.category)),this.observation=s("input","uxe-input"),this.observation.type="text",this.observation.placeholder="What did you notice?",this.observation.maxLength=200,this.observation.addEventListener("input",()=>this.clearError()),this.obsError=s("div","uxe-error"),this.obsError.style.display="none";const p=this.field("Observation",this.observation);p.append(this.obsError),a.append(p),this.why=s("input","uxe-input"),this.why.type="text",this.why.placeholder="Why is this useful?",this.why.maxLength=300,a.append(this.field("Why it matters",this.why,!0)),this.tagWrap=s("div","uxe-tags"),this.tagInput=s("input"),this.tagInput.type="text",this.tagInput.placeholder="Add tag, press Enter",this.tagInput.setAttribute("aria-label","Add tag"),this.tagInput.addEventListener("keydown",this.onTagKey),this.tagInput.addEventListener("blur",()=>this.commitTag()),this.tagWrap.addEventListener("click",()=>this.tagInput.focus()),this.tagWrap.append(this.tagInput),this.suggestWrap=s("div","uxe-suggest");const d=this.field("Tags",this.tagWrap,!0);d.append(this.suggestWrap),a.append(d),this.renderTags(),this.notes=s("textarea","uxe-textarea"),this.notes.placeholder="Additional context…",this.notes.rows=3;const l=this.field("Notes",this.notes,!0);l.style.display="none";const g=s("button","uxe-toggle");g.type="button",g.append(w(H,12),s("span",void 0,"Add notes"));const h=s("div","uxe-field");h.append(g),g.addEventListener("click",()=>{h.remove(),l.style.display="",this.notes.focus()}),a.append(h,l);const b=s("div","uxe-foot"),x=s("span","uxe-shortcut"),m=/Mac|iPhone|iPad/.test(navigator.platform);x.textContent=`${m?"⌘":"Ctrl"}+↩ to save`;const f=s("button","uxe-btn ghost","Cancel");f.type="button",f.addEventListener("click",()=>this.cancel()),this.saveBtn=s("button","uxe-btn primary","Save Evidence"),this.saveBtn.type="button",this.saveBtn.addEventListener("click",()=>this.submit()),b.append(x,f,this.saveBtn),e.append(t,a,b),this.scrim.append(e)}field(e,t,i=!1){const o=s("div","uxe-field"),r=s("div","uxe-label-row"),a=s("label",void 0,e);if(t instanceof HTMLInputElement||t instanceof HTMLSelectElement||t instanceof HTMLTextAreaElement){const c=`uxe-${e.toLowerCase().replace(/\W+/g,"-")}`;t.id=c,a.htmlFor=c}return r.append(a),i&&r.append(s("span","uxe-opt","optional")),o.append(r,t),o}onTagKey=e=>{if(e.key==="Enter"||e.key===","||e.key==="Tab"){if(e.key==="Tab"&&!this.tagInput.value.trim()||e.key==="Enter"&&(e.metaKey||e.ctrlKey))return;e.preventDefault(),this.commitTag()}else e.key==="Backspace"&&!this.tagInput.value&&this.tags.length&&(this.tags.pop(),this.renderTags())};commitTag(){const e=this.tagInput.value;e.trim()&&(this.tags=S([...this.tags,...e.split(",")]),this.tagInput.value="",this.renderTags())}renderTags(){this.tagWrap.querySelectorAll(".uxe-chip").forEach(i=>i.remove());for(const i of this.tags){const o=s("span","uxe-chip",i),r=s("button",void 0,"×");r.type="button",r.setAttribute("aria-label",`Remove tag ${i}`),r.addEventListener("click",a=>{a.stopPropagation(),this.tags=this.tags.filter(c=>c!==i),this.renderTags(),this.tagInput.focus()}),o.append(r),this.tagWrap.insertBefore(o,this.tagInput)}this.suggestWrap.textContent="";const e=new Set(this.tags.map(i=>i.toLowerCase())),t=this.knownTags.filter(i=>!e.has(i.toLowerCase())).slice(0,I);for(const i of t){const o=s("button",void 0,`+ ${i}`);o.type="button",o.addEventListener("click",()=>{this.tags=S([...this.tags,i]),this.renderTags()}),this.suggestWrap.append(o)}}onKey=e=>{e.key==="Escape"?(e.preventDefault(),e.stopPropagation(),this.cancel()):e.key==="Enter"&&(e.metaKey||e.ctrlKey)?(e.preventDefault(),e.stopPropagation(),this.submit()):e.stopPropagation()};clearError(){this.observation.classList.remove("invalid"),this.obsError.style.display="none"}submit(){this.commitTag();const e=this.observation.value.trim();if(!e){this.observation.classList.add("invalid"),this.obsError.textContent="Add a short observation so you can find this later.",this.obsError.style.display="",this.observation.focus();return}const t=this.category.value;this.close({action:"save",fields:{category:L(t)?t:"Other",observation:e,whyItMatters:this.why.value,notes:this.notes.value,tags:this.tags}})}cancel(){this.close({action:"cancel",fields:{category:"Other",observation:"",whyItMatters:"",notes:"",tags:[]}})}}const D=[[/\/(checkout|payment|kasse|zahlung)(\/|$|\?)/i,"Checkout"],[/\/(cart|basket|bag|warenkorb)(\/|$|\?)/i,"Cart"],[/\/(products?|produkt|item|p|dp)\//i,"Product page"],[/\/(collections?|category|categories|kategorie|shop|c)\//i,"Category page"],[/\/(pricing|preise|plans)(\/|$|\?)/i,"Pricing"],[/\/(search|suche|s)(\/|$|\?)/i,"Search results"],[/\/(login|signin|sign-in|register|signup|sign-up|account)(\/|$|\?)/i,"Account / auth"],[/\/(blog|articles?|news|magazin|journal)(\/|$)/i,"Article"],[/\/(about|ueber-uns|uber-uns|team)(\/|$)/i,"About"],[/\/(contact|kontakt|support|help|hilfe)(\/|$)/i,"Support"]];function N(n){const e=document.querySelector('meta[property="og:type"]')?.content;if(e&&/product/i.test(e))return"Product page";if(e&&/article/i.test(e))return"Article";const t=n.pathname;for(const[i,o]of D)if(i.test(t))return o;return t==="/"||t===""?"Homepage":""}function W(){const n=new URL(location.href);return{url:n.href,domain:n.hostname.replace(/^www\./,""),pageTitle:document.title.trim().slice(0,200),viewport:{width:window.innerWidth,height:window.innerHeight},pageType:N(n)}}const z=`
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #111113;
    -webkit-font-smoothing: antialiased;
  }
  :host([data-mode="idle"]) { pointer-events: none; }

  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; color: inherit; }

  /* ---------- Selection overlay ---------- */
  .uxe-overlay {
    position: fixed;
    inset: 0;
    cursor: crosshair;
    background: transparent;
  }
  .uxe-box {
    position: fixed;
    pointer-events: none;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.08);
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.6) inset;
    transition: top 40ms linear, left 40ms linear, width 40ms linear, height 40ms linear;
  }
  .uxe-box.region { transition: none; border-style: dashed; }
  .uxe-label {
    position: fixed;
    pointer-events: none;
    background: #111113;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 7px;
    border-radius: 4px;
    white-space: nowrap;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }
  .uxe-label b { font-weight: 600; color: #93c5fd; }

  .uxe-hint {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    background: #111113;
    color: #e5e7eb;
    padding: 9px 14px;
    border-radius: 999px;
    display: flex;
    gap: 14px;
    align-items: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    white-space: nowrap;
    pointer-events: none;
  }
  .uxe-hint span { display: inline-flex; align-items: center; gap: 6px; }
  .uxe-hint kbd {
    font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #2a2a2e;
    border: 1px solid #3b3b40;
    border-bottom-width: 2px;
    color: #fff;
    padding: 3px 5px;
    border-radius: 4px;
  }

  /* ---------- Evidence form ---------- */
  .uxe-scrim {
    position: fixed;
    inset: 0;
    background: rgba(17, 17, 19, 0.35);
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 16px;
  }
  .uxe-panel {
    width: 400px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: uxe-in 140ms ease-out;
  }
  @keyframes uxe-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

  .uxe-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #ececef;
  }
  .uxe-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .uxe-head .uxe-source {
    font-size: 11px;
    color: #6b6b73;
    margin-top: 1px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .uxe-iconbtn {
    appearance: none; border: 0; background: transparent; width: 28px; height: 28px;
    border-radius: 6px; display: grid; place-items: center; cursor: pointer; color: #6b6b73;
  }
  .uxe-iconbtn:hover { background: #f3f3f5; color: #111113; }

  .uxe-body { overflow-y: auto; padding: 14px 16px 4px; }

  .uxe-preview {
    position: relative;
    border: 1px solid #e5e5ea;
    border-radius: 8px;
    overflow: hidden;
    background: repeating-conic-gradient(#f6f6f8 0 25%, #fff 0 50%) 0 0 / 16px 16px;
    margin-bottom: 12px;
  }
  .uxe-preview img { display: block; width: 100%; height: auto; max-height: 220px; object-fit: contain; }
  .uxe-preview .uxe-dim {
    position: absolute; right: 6px; bottom: 6px;
    font-size: 10px; background: rgba(17,17,19,0.75); color: #fff; padding: 2px 6px; border-radius: 4px;
  }
  .uxe-clipped {
    display: flex; gap: 8px; align-items: flex-start;
    background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa;
    border-radius: 6px; padding: 8px 10px; font-size: 12px; margin-bottom: 12px;
  }

  .uxe-field { margin-bottom: 12px; }
  .uxe-label-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
  .uxe-field label { font-size: 12px; font-weight: 500; color: #3f3f46; }
  .uxe-field .uxe-opt { font-size: 11px; color: #9a9aa3; }
  .uxe-input, .uxe-select, .uxe-textarea {
    width: 100%;
    border: 1px solid #d9d9df;
    border-radius: 6px;
    padding: 8px 10px;
    background: #fff;
    outline: none;
    transition: border-color 80ms, box-shadow 80ms;
  }
  .uxe-input:focus, .uxe-select:focus, .uxe-textarea:focus, .uxe-tags:focus-within {
    border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
  }
  .uxe-input.invalid { border-color: #dc2626; }
  .uxe-textarea { resize: vertical; min-height: 60px; }
  .uxe-select {
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b73' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
    background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px;
  }
  .uxe-error { color: #dc2626; font-size: 11px; margin-top: 4px; }

  .uxe-tags {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    border: 1px solid #d9d9df; border-radius: 6px; padding: 6px 8px; min-height: 36px; cursor: text;
  }
  .uxe-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 500;
    padding: 2px 4px 2px 8px; border-radius: 999px;
  }
  .uxe-chip button {
    appearance: none; border: 0; background: transparent; width: 16px; height: 16px; border-radius: 50%;
    display: grid; place-items: center; cursor: pointer; color: #6366f1; font-size: 12px; line-height: 1;
  }
  .uxe-chip button:hover { background: #c7d2fe; color: #1e1b4b; }
  .uxe-tags input { flex: 1; min-width: 80px; border: 0; outline: 0; padding: 3px 2px; background: transparent; }
  .uxe-suggest { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .uxe-suggest button {
    appearance: none; border: 1px dashed #d9d9df; background: #fff; color: #6b6b73;
    font-size: 11px; padding: 2px 8px; border-radius: 999px; cursor: pointer;
  }
  .uxe-suggest button:hover { border-color: #2563eb; color: #2563eb; }

  .uxe-toggle {
    appearance: none; border: 0; background: transparent; padding: 0; cursor: pointer;
    color: #6b6b73; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;
  }
  .uxe-toggle:hover { color: #111113; }

  .uxe-foot {
    display: flex; gap: 8px; justify-content: flex-end; align-items: center;
    padding: 12px 16px; border-top: 1px solid #ececef; background: #fafafa;
  }
  .uxe-foot .uxe-shortcut { margin-right: auto; font-size: 11px; color: #9a9aa3; }
  .uxe-btn {
    appearance: none; border: 1px solid transparent; border-radius: 7px; padding: 8px 14px;
    font-weight: 500; cursor: pointer; transition: background 80ms;
  }
  .uxe-btn.primary { background: #111113; color: #fff; }
  .uxe-btn.primary:hover { background: #2a2a2e; }
  .uxe-btn.primary:disabled { opacity: 0.6; cursor: default; }
  .uxe-btn.ghost { background: transparent; border-color: #d9d9df; color: #3f3f46; }
  .uxe-btn.ghost:hover { background: #f3f3f5; }

  /* ---------- Toast ---------- */
  .uxe-toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    background: #111113;
    color: #fff;
    padding: 10px 14px;
    border-radius: 8px;
    display: flex; align-items: center; gap: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    animation: uxe-in 140ms ease-out;
    pointer-events: none;
  }
  .uxe-toast.error { background: #b91c1c; }
  .uxe-toast svg { flex: none; }
`;window.__uxEvidenceLoaded||(window.__uxEvidenceLoaded=!0,_());function _(){const n=document.createElement("ux-evidence-collector");n.dataset.mode="idle";const e=n.attachShadow({mode:"closed"}),t=document.createElement("style");t.textContent=z,e.append(t),(document.documentElement??document.body).append(n);let i=!1;async function o(p){try{return await chrome.runtime.sendMessage(p)??{ok:!1,error:"The extension did not respond. Reload the page and try again."}}catch{return{ok:!1,error:"The extension was reloaded. Reload this page and try again."}}}function r(p,d="ok"){const l=document.createElement("div");l.className=`uxe-toast${d==="error"?" error":""}`,l.setAttribute("role","status"),l.innerHTML=d==="ok"?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5eead4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',l.append(document.createTextNode(p)),e.append(l),setTimeout(()=>l.remove(),d==="ok"?1800:4e3)}function a(){return new Promise(p=>requestAnimationFrame(()=>requestAnimationFrame(()=>p())))}async function c(p,d,l){n.style.display="none",await a();const g=W(),h=await o({type:"CAPTURE_AREA",rect:p,mode:d,context:g,clipped:l});if(n.style.display="",!h.ok){r(h.error,"error");return}const b=await o({type:"GET_KNOWN_TAGS"}),x=new R(e,n,h.data,b.ok?b.data:[]);let m=await x.open();for(;m.action==="save";){x.setBusy(!0);const f=await o({type:"SAVE_EVIDENCE",draftId:h.data.draftId,fields:m.fields});if(f.ok){r("Evidence saved.");return}r(f.error,"error"),m=await x.reopen()}o({type:"DISCARD_DRAFT",draftId:h.data.draftId})}async function u(){if(!i){i=!0;try{const d=await new M(e,n).start();if(!d)return;await c(d.rect,d.mode,d.clipped)}finally{i=!1}}}async function y(){if(!i){i=!0;try{await c(null,"visible",!1)}finally{i=!1}}}chrome.runtime.onMessage.addListener((p,d,l)=>(p.type==="ENTER_CAPTURE_MODE"?(u(),l({ok:!0,data:null})):p.type==="CAPTURE_VISIBLE"&&(y(),l({ok:!0,data:null})),!1))}})();

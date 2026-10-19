/**
 * Spotify 1.3.5+ Rspack & Spicetify Compatibility Patcher
 * By Harilowji (https://github.com/Harilowji)
 *
 * Automatically fixes:
 * 1. Missing Spicetify helper scripts in index.html (stripped by Spicetify on 1.3.5).
 * 2. Missing Rspack vendor chunks causing React Invariant #306 and 'r.render is not a function'.
 * 3. Uncaught ChunkLoadError crashing client into Error Boundary ("Tải lại trang").
 * 4. Spicetify wrapper DOM readiness race condition and safe player state access.
 */

const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
const xpuiDir = path.join(appData, 'Spotify', 'Apps', 'xpui');

if (!fs.existsSync(xpuiDir)) {
    console.log('[INFO] Spotify xpui directory not found at:', xpuiDir);
    process.exit(0);
}

console.log('[*] Checking Spotify 1.3.5+ compatibility patches in:', xpuiDir);

// 1. Patch helper/spicetifyWrapper.js
const wrapperPath = path.join(xpuiDir, 'helper', 'spicetifyWrapper.js');
if (fs.existsSync(wrapperPath)) {
    let wrap = fs.readFileSync(wrapperPath, 'utf8');
    let wrapChanged = false;

    // 1a. Safe MutationObserver attaching after document.body exists
    const targetObs = 'var lt=new MutationObserver(ct);lt.observe(document.body,{childList:!0,subtree:!0,attributes:!1});';
    const safeObs = 'var lt=new MutationObserver(ct);if(document.body){lt.observe(document.body,{childList:!0,subtree:!0,attributes:!1});}else{window.addEventListener("DOMContentLoaded",()=>{lt.observe(document.body,{childList:!0,subtree:!0,attributes:!1});});}';
    if (wrap.includes(targetObs)) {
        wrap = wrap.replace(targetObs, safeObs);
        wrapChanged = true;
        console.log('[PATCHED] spicetifyWrapper.js: MutationObserver DOM readiness guard');
    }

    // 1b. Safe string serializer function d
    const targetD = 'var d=e=>{try{return e.toString()}catch{try{return Function.prototype.toString.call(e)}catch{return""}}};';
    const safeD = 'var d=e=>{if(!e)return"";try{var s=e.toString();return typeof s=="string"?s:""}catch{try{var s=Function.prototype.toString.call(e);return typeof s=="string"?s:""}catch{return""}}};';
    if (wrap.includes(targetD)) {
        wrap = wrap.replace(targetD, safeD);
        wrapChanged = true;
        console.log('[PATCHED] spicetifyWrapper.js: Safe string serializer');
    }

    // 1c. Safe isPlaying check
    const targetPlay = 'isPlaying:()=>!Spicetify.Player.origin._state.isPaused';
    const safePlay = 'isPlaying:()=>Boolean(Spicetify.Player.origin?._state&&!Spicetify.Player.origin._state.isPaused)';
    if (wrap.includes(targetPlay)) {
        wrap = wrap.replace(targetPlay, safePlay);
        wrapChanged = true;
        console.log('[PATCHED] spicetifyWrapper.js: Safe isPlaying guard');
    }

    if (wrapChanged) {
        fs.writeFileSync(wrapperPath, wrap, 'utf8');
    }
}

// 2. Patch xpui-snapshot.js
const snapPath = path.join(xpuiDir, 'xpui-snapshot.js');
if (fs.existsSync(snapPath)) {
    let snap = fs.readFileSync(snapPath, 'utf8');
    let snapChanged = false;

    // 2a. Bulletproof Proxy Fallback for function n(e)
    const bulletproofN = `function n(e){var t=p[e];if(void 0!==t)return t.exports;var o=p[e]={exports:{}};if(!__webpack_modules__||!__webpack_modules__[e]){var D=function(){return null};D.displayName="DummyFallback";D.prototype={isReactComponent:{},render:function(){return null}};var P=new Proxy(D,{get:function(t,k){if(k==="then")return undefined;if(k==="__esModule")return true;if(k==="default")return D;if(k==="toString")return function(){return"function DummyFallback(){return null}"};if(k==="render")return function(){return null};if(k==="isReactComponent")return{};if(k==="prototype")return D.prototype;if(k===Symbol.toPrimitive)return function(){return""};return P;},apply:function(){return null;},construct:function(){return{render:function(){return null}};}});o.exports=P;return o.exports;}return __webpack_modules__[e].call(o.exports,o,o.exports,n),o.exports;}`;

    const nRegex = /function n\(e\)\{var t=p\[e\];[\s\S]*?__webpack_modules__\[e\]\.call\(o\.exports,o,o\.exports,n\),o\.exports;?\}/;
    if (nRegex.test(snap) && !snap.includes('DummyFallback')) {
        snap = snap.replace(nRegex, bulletproofN);
        snapChanged = true;
        console.log('[PATCHED] xpui-snapshot.js: Bulletproof Proxy fallback for missing modules');
    }

    // 2b. Safe ChunkLoadError resolution to prevent unhandled rejection
    const origErr = 's.message="Loading chunk "+e+" failed.\\n("+r+": "+u+")",s.name="ChunkLoadError",s.type=r,s.request=u,o[1](s)';
    const safeErr = 's.message="Loading chunk "+e+" failed.\\n("+r+": "+u+")",s.name="ChunkLoadError",s.type=r,s.request=u,console.warn(s.message),i[e]=0,o[0]()';
    if (snap.includes(origErr)) {
        snap = snap.replace(origErr, safeErr);
        snapChanged = true;
        console.log('[PATCHED] xpui-snapshot.js: Safe chunk load resolution');
    }

    if (snapChanged) {
        fs.writeFileSync(snapPath, snap, 'utf8');
    }
}

// 3. Patch index.html
const indexPath = path.join(xpuiDir, 'index.html');
if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    let indexChanged = false;

    if (!indexHtml.includes('helper/spicetifyWrapper.js')) {
        const spicetifyHeader = `
<script src='helper/spicetifyWrapper.js'></script>
<script defer src='helper/expFeatures.js'></script>
<script>
  Spicetify.Config = {
    version: "2.45.3",
    current_theme: "TransparentTheme",
    color_scheme: "",
    extensions: ["we-sync.js"],
    custom_apps: ["marketplace"],
    check_spicetify_update: true
  };
</script>
`;
        indexHtml = indexHtml.replace('</head>', `${spicetifyHeader}</head>`);
        indexChanged = true;
        console.log('[PATCHED] index.html: Injected Spicetify wrapper & config');
    }

    if (indexHtml.includes('src="/xpui-snapshot.js"') && !indexHtml.includes('src="/xpui-modules.js"')) {
        indexHtml = indexHtml.replace(
            '<script defer="defer" src="/xpui-snapshot.js"></script>',
            '<script defer="defer" src="/xpui-modules.js"></script><script defer="defer" src="/xpui-snapshot.js"></script>'
        );
        indexChanged = true;
        console.log('[PATCHED] index.html: Injected xpui-modules.js before xpui-snapshot.js');
    }

    if (indexChanged) {
        fs.writeFileSync(indexPath, indexHtml, 'utf8');
    }
}

console.log('[OK] All Spotify 1.3.5+ compatibility checks completed.');

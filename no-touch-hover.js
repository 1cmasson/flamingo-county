/* Gate every :hover rule behind a real pointer, so touch taps don't leave stuck hover states. */
(function () {
  var WRAP = '@media (hover:hover) and (pointer:fine){';
  var HOVER = /:hover\b/;

  var proto = window.CSSStyleSheet && CSSStyleSheet.prototype;
  if (proto && !proto.__ntHoverPatched) {
    proto.__ntHoverPatched = true;
    var orig = proto.insertRule;
    proto.insertRule = function (rule, index) {
      if (typeof rule === 'string' && HOVER.test(rule) && !/^\s*@/.test(rule)) {
        rule = WRAP + rule + '}';
      }
      return orig.call(this, rule, index);
    };
  }

  function fixSheet(sheet) {
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.type !== 1 || !r.selectorText || !HOVER.test(r.selectorText)) continue;
      var text = r.cssText;
      try {
        sheet.deleteRule(i);
        sheet.insertRule(WRAP + text + '}', i);
      } catch (e) { /* leave as-is */ }
    }
  }

  function scan() {
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) fixSheet(sheets[i]);
  }

  scan();
  var ticks = 0;
  (function loop() {
    scan();
    if (++ticks < 120) requestAnimationFrame(loop);
  })();
  window.addEventListener('load', scan);
})();

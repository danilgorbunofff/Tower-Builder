/* probe-batch.js — verifies the hold-to-charge batch order:
   holding counts floors, releasing commits ONE payment for N floors. */
(async function(){
  var out = {};
  var sleep = function(ms){ return new Promise(function(r){ window.setTimeout(r, ms); }); };
  var btn   = document.getElementById("order");
  var bar   = document.getElementById("orderBar");
  var price = document.getElementById("orderPrice");
  var text  = document.getElementById("orderText");
  var meter = document.querySelector(".order-meter");

  var topFloor = function(){
    var ns = document.querySelectorAll(".floor .no");
    var top = 0;
    for(var i = 0; i < ns.length; i++){
      var v = parseInt(ns[i].textContent, 10);
      if(v > top){ top = v; }
    }
    return top;
  };
  var label = function(){
    return {
      price:    price.textContent,
      text:     text.textContent,
      charging: btn.classList.contains("is-charging"),
      aria:     btn.getAttribute("aria-label"),
      barW:     Math.round(bar.getBoundingClientRect().width * 10) / 10,
      meterOp:  Math.round(parseFloat(getComputedStyle(meter).opacity) * 100) / 100,
      barBg:    getComputedStyle(bar).backgroundColor
    };
  };
  var pd = function(){
    btn.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true
    }));
  };
  var pu = function(target){
    (target || document.body).dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true
    }));
  };

  /* 0 — geometry of the meter must not disturb the button */
  var br = btn.getBoundingClientRect();
  var mr = meter.getBoundingClientRect();
  out.meterInsideBtn = {
    btnH:    Math.round(br.height),
    meterIn: mr.left >= br.left - 1 && mr.right <= br.right + 1 &&
             mr.top >= br.top - 1 && mr.bottom <= br.bottom + 1,
    idleOpacity: label().meterOp,
    overflow: Math.round(br.height) === Math.round(btn.offsetHeight)
  };

  /* 1 — a plain tap still buys exactly one floor */
  var before = topFloor();
  btn.click();
  await sleep(260);
  out.tapAddsOne = { from: before, to: topFloor(), ok: topFloor() === before + 1 };

  /* 2 — hold: the order counts up, nothing is bought yet */
  var base = topFloor();
  pd();
  await sleep(900);
  var charging = label();
  var peeking = topFloor();
  out.holdCounts = {
    label:      charging,
    builtYet:   peeking - base,
    grew:       charging.text.indexOf("BUILD") === 0 && charging.charging === true,
    promise:    charging.price === "$" + (charging.text.match(/\d+/) || ["1"])[0],
    barFilled:  charging.barW
  };
  var promised = parseInt((charging.text.match(/\d+/) || ["1"])[0], 10);

  /* 3 — release anywhere commits the whole batch */
  pu(document.body);
  await sleep(200);
  var midBuild = topFloor();
  await sleep(promised * 130 + 500);
  var after = label();
  out.releaseCommitsBatch = {
    promised:   promised,
    base:       base,
    halfway:    midBuild - base,
    built:      topFloor() - base,
    ok:         topFloor() === base + promised,
    labelBack:  after.price === "$1" && after.text === "BUILD A FLOOR" && after.charging === false,
    ariaBack:   after.aria,
    staggerSel: midBuild > base && midBuild < base + promised
  };

  /* 4 — the dangling suppress flag from the synthetic release is consumed by the
         next click, exactly as a real browser does, so the tap after a hold works */
  var s1 = topFloor();
  btn.click();
  var s2 = topFloor();
  btn.click();
  await sleep(300);
  out.postHoldTap = { eaten: s2 === s1, thenAdds: topFloor() === s2 + 1 };

  /* 5 — keyboard: queue with arrows, commit with Enter, one order */
  var k0 = topFloor();
  var key = function(k){
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  };
  key("ArrowUp"); key("ArrowUp"); key("ArrowUp");
  var queued = label();
  key("Enter");
  await sleep(3 * 130 + 500);
  out.kbdBatch = {
    queuedPrice: queued.price,
    queuedText:  queued.text,
    built:       topFloor() - k0,
    ok:          topFloor() === k0 + 3 && queued.price === "$3"
  };
  var afterKbd = label();
  out.kbdReset = { price: afterKbd.price, text: afterKbd.text };

  /* 6 — cancelling a charge buys nothing and leaves no residue */
  var c0 = topFloor();
  pd();
  await sleep(700);
  var chargingNow = label().charging;
  window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
  await sleep(500);
  var afterCancel = label();
  out.cancelAborts = {
    charged:  chargingNow,
    built:    topFloor() - c0,
    ok:       topFloor() === c0 && afterCancel.charging === false && afterCancel.price === "$1"
  };

  /* 7 — long-press context menu is suppressed */
  var cm = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  btn.dispatchEvent(cm);
  out.contextMenuPrevented = cm.defaultPrevented;

  out.errs  = window.__errs || [];
  out.floors = document.querySelectorAll(".floor").length;
  return out;
})()

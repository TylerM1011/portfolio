// The projects page's blueprint sheets (see Blueprint.tsx and the
// .blueprints rules in globals.css) gather into a pile behind the
// emergency phone while its dial is open, and fan back out to their places
// when it closes. YardScene, the only scene with sheets over it, calls
// stackSheets with the dial's state.
//
// Each sheet's travel is set as custom properties on its list item and
// played by CSS transitions on the individual `translate`, `rotate` and
// `scale` properties, so it composes with the sheets' own fall-in animation
// (on `transform`) and runs backwards from wherever it is if the dial closes
// mid-way.

// The pile's look: each sheet's final turn in turn, and how far each lies
// from the one under it, in px.
const PILE_TURNS = [-4, 2.5, -1, 5];
const PILE_STEP = { x: 7, y: -5 };
// How much of the housing the pile covers, and where it sits: a little up
// and to the left of centre, so a corner of paper peeks out from behind.
const PILE_COVER = 0.92;
const PILE_SHIFT = { x: -0.14, y: -0.12 };

// Where an element lies, in viewport px, by layout alone: unlike
// getBoundingClientRect, this ignores transforms, so it finds where the
// dial's housing will rest while it is still growing out of the phone.
function layoutRect(element: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft - (node === element ? 0 : node.scrollLeft);
    y += node.offsetTop - (node === element ? 0 : node.scrollTop);
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

// The px values of a computed `translate` ("none", "12px" or "12px 34px").
function translation(value: string) {
  if (!value || value === "none") return [0, 0];
  const [x = "0", y = "0"] = value.split(" ");
  return [parseFloat(x), parseFloat(y)];
}

export function stackSheets(open: boolean) {
  const list = document.querySelector<HTMLElement>(".blueprints");
  if (!list) return () => {};
  const sheets = [...list.querySelectorAll<HTMLElement>(".blueprint-wrap")];

  if (!open) {
    list.removeAttribute("data-stacked");
    list.inert = false;
    // Once every sheet is home, the phones' sideways strip scrolls again,
    // exactly where it was (see below).
    const settle = () => {
      if (list.hasAttribute("data-stacked")) return;
      const scroll = Number(list.dataset.scroll ?? 0);
      list.style.translate = "";
      list.removeAttribute("data-lifted");
      list.scrollLeft = scroll;
    };
    const moving = sheets.flatMap((sheet) => sheet.getAnimations().filter((a) => a instanceof CSSTransition));
    if (moving.length) void Promise.allSettled(moving.map((a) => a.finished)).then(settle);
    else settle();
    return () => {};
  }

  const housing = document.querySelector<HTMLElement>("[data-phone-housing]");
  if (!housing) return () => {};

  function gather() {
    // Sheets still falling in land at once, so none is caught halfway.
    for (const animation of list!.getAnimations({ subtree: true })) if (!(animation instanceof CSSTransition)) animation.finish();
    // On phones the sheets lie in a sideways-scrolling strip that would clip
    // them on their way down to the pile. It stops clipping while they are
    // away, and is shifted by its scroll so nothing moves when it does.
    if (!list!.hasAttribute("data-lifted")) {
      list!.dataset.scroll = String(list!.scrollLeft);
      list!.style.translate = `${-list!.scrollLeft}px 0`;
      list!.setAttribute("data-lifted", "");
    }
    const target = layoutRect(housing!);
    const centre = {
      x: target.x + target.width * (0.5 + PILE_SHIFT.x),
      y: target.y + target.height * (0.5 + PILE_SHIFT.y),
    };
    // The list may be zoomed down on short screens (see globals.css): px
    // set on a sheet move it by this much on screen.
    const zoom = list!.getBoundingClientRect().width / parseFloat(getComputedStyle(list!).width) || 1;
    sheets.forEach((sheet, i) => {
      const rect = sheet.getBoundingClientRect();
      const style = getComputedStyle(sheet);
      // Where the sheet rests, without any travel it is part-way through.
      const [tx, ty] = translation(style.translate);
      const restX = rect.left + rect.width / 2 - tx * zoom;
      const restY = rect.top + rect.height / 2 - ty * zoom;
      const step = i - (sheets.length - 1) / 2;
      const dx = centre.x + step * PILE_STEP.x - restX;
      const dy = centre.y + step * PILE_STEP.y - restY;
      const turn = parseFloat(getComputedStyle(sheet.querySelector(".blueprint")!).getPropertyValue("--turn")) || 0;
      const scale = Math.min(1, (target.width * PILE_COVER) / (parseFloat(style.width) * zoom));
      sheet.style.setProperty("--stack-x", `${dx / zoom}px`);
      sheet.style.setProperty("--stack-y", `${dy / zoom}px`);
      sheet.style.setProperty("--stack-turn", `${PILE_TURNS[i % PILE_TURNS.length] - turn}deg`);
      sheet.style.setProperty("--stack-scale", String(scale));
    });
    list!.setAttribute("data-stacked", "");
  }

  gather();
  // Neither keyboard nor screen reader reaches the sheets behind the dial.
  list.inert = true;
  window.addEventListener("resize", gather);
  return () => window.removeEventListener("resize", gather);
}

// App HTML and sizing are shared by the live app and the fixture-backed mock.
for (const image of document.querySelectorAll<HTMLImageElement>("[data-logo]")) {
  image.src = `${import.meta.env.BASE_URL}logo/${image.dataset.logo}`;
}
const stage = document.querySelector<HTMLElement>(".stage")!;
const mapNav = document.querySelector<HTMLElement>(".map-nav")!;
const messageLog = document.querySelector<HTMLElement>("#messages")!;
function fitMap(): void {
  const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
  const height = stage.clientHeight - mapNav.offsetHeight - messageLog.offsetHeight - gap * 2;
  document.body.style.setProperty("--map-w", `${Math.max(0, Math.floor(height * 16 / 9))}px`);
}
const fitter = new ResizeObserver(fitMap);
for (const element of [stage, mapNav, messageLog]) fitter.observe(element);

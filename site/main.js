const towns = {
  town: ["01", "草原の村", "緑に包まれた、はじまりの風景。噴水のある広場を勇者が歩き、次の依頼を待っています。"],
  port: ["02", "海辺の港町", "帆船と桟橋、海風が通り抜ける町。青い水辺を背景に、勇者たちの仕事を見守ります。"],
  snow: ["03", "雪国の町", "白い屋根と静かに降る雪。暖かな灯りのそばで、次のクエストの支度を。"],
  desert: ["04", "砂漠のオアシス", "砂の大地にひらけた、水と緑の憩いの場所。見慣れたプロジェクトを、少し違う景色に。"],
  volcano: ["05", "火山の町", "赤い大地に火の粉が舞う、力強い風景。どの町でも、仕事を任せる流れは同じです。"],
};
for (const button of document.querySelectorAll("[data-town]")) {
  button.addEventListener("click", () => {
    const key = button.dataset.town;
    const [number, title, description] = towns[key];
    for (const item of document.querySelectorAll("[data-town]")) item.setAttribute("aria-pressed", String(item === button));
    document.querySelector("#town-image").src = `assets/${key}.png`;
    document.querySelector("#town-image").alt = `${title}のデモ画面`;
    document.querySelector("#town-number").textContent = `TOWN / ${number}`;
    document.querySelector("#town-title").textContent = title;
    document.querySelector("#town-description").textContent = description;
  });
}
const copy = document.querySelector("#copy-command");
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#install-command").textContent);
    copy.textContent = "コピーしました";
    document.querySelector("#copy-status").textContent = "起動コマンドをコピーしました。";
    setTimeout(() => { copy.textContent = "コピー"; }, 2500);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#install-command"));
    selection.removeAllRanges();
    selection.addRange(range);
    document.querySelector("#copy-status").textContent = "コピーできませんでした。選択したコマンドを手動でコピーしてください。";
    copy.textContent = "選択済み・手動コピー";
  }
});

(async function () {
  await window.FulianTaskStore?.ready;
  const id = new URLSearchParams(location.search).get("case");
  const task = window.FulianTaskStore?.all().find(item => item.id === id);
  if (task?.type !== "renewal") return;
  const main = document.querySelector("main");
  if (!main) return;
  const paragraph = document.createElement("p");
  const link = document.createElement("a");
  link.href = `renewal-foundations.html?case=${encodeURIComponent(id)}`;
  link.textContent = "續約有約定地基？查看或建立後續追蹤 →";
  paragraph.append(link);
  main.prepend(paragraph);
})();

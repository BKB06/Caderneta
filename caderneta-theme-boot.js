(function () {
  const key = "caderneta.theme";
  const html = document.documentElement;
  const saved = localStorage.getItem(key);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = (saved === "dark" || saved === "light" || saved === "light-azulado" || saved === "light-bege")
    ? saved
    : (preferredDark ? "dark" : "light-azulado");

  html.classList.remove("light", "dark", "light-azulado", "light-bege");
  html.classList.add(theme);
})();

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const [html, css, javascript] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("app.js", root), "utf8")
]);

const posterPaths = [
  "./assets/posters/wuxia.webp",
  "./assets/posters/fantasy-blue.webp",
  "./assets/posters/mystery.webp",
  "./assets/posters/historical-romance.webp",
  "./assets/posters/legal-drama.webp",
  "./assets/posters/fantasy-jade.webp"
];

let bundledJavascript = javascript;
for (const posterPath of posterPaths) {
  const poster = await readFile(new URL(posterPath.slice(2), root));
  const dataUrl = "data:image/webp;base64," + poster.toString("base64");
  bundledJavascript = bundledJavascript.replaceAll(posterPath, dataUrl);
}

const output = html
  .replace('<link rel="stylesheet" href="./styles.css" />', "<style>\n" + css + "\n</style>")
  .replace('<script src="./app.js"></script>', "<script>\n" + bundledJavascript + "\n</script>");

await writeFile(new URL("wp-resource-search-demo.html", root), output);

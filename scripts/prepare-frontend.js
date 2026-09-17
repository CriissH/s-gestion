const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const destination = path.join(root, "dist");
const files = ["index.html", "styles.css", "app.js", "version.json"];

fs.mkdirSync(destination, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(destination, file));
}

console.log(`Frontend preparado en ${path.relative(root, destination)}`);

import fs from "node:fs";

const HOTELS_PATH = "data/hotels.json";

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const hotels = JSON.parse(fs.readFileSync(HOTELS_PATH, "utf8"));
const seen = new Map();
let added = 0;
let kept = 0;

for (const hotel of hotels) {
  let id = typeof hotel.id === "string" && hotel.id.trim() ? hotel.id.trim() : "";
  if (id) {
    kept += 1;
  } else {
    id = slugify(hotel.name) || "hotel";
    added += 1;
  }

  const base = id;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.set(id, hotel.name);
  hotel.id = id;
}

const invalid = hotels.filter((hotel) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hotel.id));

if (invalid.length > 0) {
  console.error("Invalid hotel ids:");
  for (const hotel of invalid) console.error(`  ${hotel.name}: ${hotel.id}`);
  process.exit(1);
}

fs.writeFileSync(HOTELS_PATH, `${JSON.stringify(hotels, null, 2)}\n`);

console.log(`Hotels: ${hotels.length}`);
console.log(`Added ids: ${added}; kept existing: ${kept}`);
console.log(`Unique ids: ${seen.size}`);
console.log("Sample:");
for (const hotel of hotels.slice(0, 5)) {
  console.log(`  ${hotel.id}  <-  ${hotel.name}`);
}

const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const chalk = require('chalk');
const { PNG } = require('pngjs');
const logger = require('./logger');

/**
 * 3MF file parser utility
 * Parses 3MF files to extract object information
 */
class ThreeMFParser {
    constructor() {
        this.zip = null;
        this.metadata = null;
        this.sliceInfo = null;
        this.plateData = null;
        // Predefined colors for objects
        this.colors = [
            chalk.red,
            chalk.green,
            chalk.blue,
            chalk.yellow,
            chalk.magenta,
            chalk.cyan,
            chalk.white,
            chalk.gray,
            chalk.redBright,
            chalk.greenBright,
            chalk.blueBright,
            chalk.yellowBright,
            chalk.magentaBright,
            chalk.cyanBright
        ];
    }

    /**
     * Parse 3MF file from buffer
     * @param {Buffer} buffer - 3MF file content as buffer
     * @returns {Promise<Object>} Parsed object information
     */
    async parseFromBuffer(buffer) {
        try {
            // Load 3MF as ZIP
            this.zip = new JSZip();
            await this.zip.loadAsync(buffer);

            const fileNames = Object.keys(this.zip.files);
            logger.debug("3MF contents", { fileNames });

            const plateJsonFiles = fileNames.filter(name => name.includes('plate') && name.endsWith('.json'));
            const sliceFiles = fileNames.filter(name => name.includes('slice') || name.includes('Slice'));

            // Parse plate JSON file (this is the main data we need)
            if (plateJsonFiles.length > 0) {
                await this.parsePlateJsonFile(plateJsonFiles[0]);
            } else {
                throw new Error('No plate JSON file found in 3MF');
            }

            // Parse slice info if available
            if (sliceFiles.length > 0) {
                await this.parseSliceInfoFile(sliceFiles[0]);
            }

            const info = this.getObjectInfo();
            await this._reconcileInstancesAgainstPickPng(info);
            return info;
        } catch (error) {
            throw new Error(`Failed to parse 3MF file: ${error.message}`);
        }
    }

    /**
     * Newer OrcaSlicer (2.4+) lists only the source object in slice_info.config but
     * the pick PNG encodes EVERY printed instance with a unique identify_id (the
     * id channel pattern `id = r | g<<8 | b<<16` — see renderShapeAscii). When the
     * pick PNG has more distinct instance ids than slice_info reports, fill in
     * the gap so `skip` and the diagram see all of them. Each synthesized instance
     * inherits the name (and best-effort metadata) of its source — the source
     * being the largest-id slice_info object whose id <= the new id, or simply
     * the first slice_info object when ids don't sort cleanly.
     */
    async _reconcileInstancesAgainstPickPng(info) {
        if (!info || !info.objects || info.objects.length === 0) return;
        let plate;
        try {
            plate = await this.extractPlatePng(info.plateIndex);
        } catch {
            return;
        }
        if (!plate || plate.kind !== "pick") return;

        const { png } = plate;
        const { width: pw, height: ph, data } = png;
        const counts = new Map(); // id -> pixel count
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 16) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r < 16 && g < 16 && b < 16) continue;
            const id = r | (g << 8) | (b << 16);
            counts.set(id, (counts.get(id) || 0) + 1);
        }
        const minCount = Math.max(50, Math.floor(pw * ph * 0.0005));
        const pngIds = [...counts.entries()]
            .filter(([, c]) => c >= minCount)
            .map(([id]) => id);
        if (pngIds.length === 0) return;

        const knownIds = new Set();
        for (const o of info.objects) {
            const n = typeof o.id === "string" ? parseInt(o.id, 10) : o.id;
            if (Number.isFinite(n)) knownIds.add(n);
        }
        const missing = pngIds.filter((id) => !knownIds.has(id));
        if (missing.length === 0) return;

        // Pick a name source per missing id: largest known id <= missing id;
        // falls back to the first known object if no such predecessor exists.
        const sortedKnown = [...info.objects]
            .map((o) => ({ obj: o, n: typeof o.id === "string" ? parseInt(o.id, 10) : o.id }))
            .filter((x) => Number.isFinite(x.n))
            .sort((a, b) => a.n - b.n);
        const nameFor = (id) => {
            let pick = sortedKnown[0]?.obj;
            for (const k of sortedKnown) {
                if (k.n <= id) pick = k.obj;
                else break;
            }
            return pick;
        };

        for (const id of missing.sort((a, b) => a - b)) {
            const src = nameFor(id);
            info.objects.push({
                id: String(id),
                name: src ? src.name : `Object_${id}`,
                boundingBox: null,
                area: null,
                layer_height: null,
            });
        }
        info.totalObjects = info.objects.length;
    }

    /**
     * Parse plate JSON file
     * @param {string} plateJsonFile - Plate JSON file name
     */
    async parsePlateJsonFile(plateJsonFile) {
        const content = await this.zip.file(plateJsonFile).async('string');
        this.plateData = JSON.parse(content);
        
        // Extract plate index from filename (e.g., "plate_3.json" -> 3)
        const match = plateJsonFile.match(/plate_(\d+)\.json/);
        const plateIndex = match ? parseInt(match[1]) : 0;
        
        // Create basic metadata
        this.metadata = {
            filename: 'Unknown',
            plate_index: plateIndex
        };
    }

    /**
     * Parse slice info file
     * @param {string} sliceInfoFile - Slice info file name
     */
    async parseSliceInfoFile(sliceInfoFile) {
        const content = await this.zip.file(sliceInfoFile).async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        this.sliceInfo = this.parseXMLToObject(xmlDoc);
    }

    /**
     * Extract object information from parsed data
     * @returns {Object} Object information
     */
    getObjectInfo() {
        const objects = [];
        let bboxMap = {};

        // Build a map of bounding boxes from plate JSON (if available)
        if (this.plateData && this.plateData.bbox_objects) {
            this.plateData.bbox_objects.forEach((obj) => {
                const bbox = obj.bbox || [0, 0, 0, 0];
                const min = [bbox[0], bbox[1]];
                const max = [bbox[2], bbox[3]];
                bboxMap[obj.id] = {
                    min: min,
                    max: max,
                    size: [bbox[2] - bbox[0], bbox[3] - bbox[1]],
                    area: obj.area,
                    layer_height: obj.layer_height
                };
            });
        }

        // Extract objects from slice info (prioritize these IDs)
        if (this.sliceInfo && this.sliceInfo.config && this.sliceInfo.config.plate && this.sliceInfo.config.plate.object) {
            const plateObjects = Array.isArray(this.sliceInfo.config.plate.object) 
                ? this.sliceInfo.config.plate.object 
                : [this.sliceInfo.config.plate.object];
            
            // When the slicer's "instances" feature is used, the plate JSON has a SINGLE
            // bbox_objects entry (the merged area of all instances) while slice_info lists
            // every instance. Detect that case so we don't misattribute the combined bbox
            // to whichever instance happens to be first in the list.
            const bboxIds = Object.keys(bboxMap);
            const looksLikeInstanceMerge =
                bboxIds.length > 0 &&
                bboxIds.length < plateObjects.length &&
                !plateObjects.some((o) => bboxMap[o['@identify_id']]);

            plateObjects.forEach((obj, index) => {
                const sliceId = obj['@identify_id'];
                let bboxData = bboxMap[sliceId];
                // Only use the index fallback when bbox count matches instance count — i.e.
                // the slicer wasn't using the instances copy feature.
                if (!bboxData && !looksLikeInstanceMerge) {
                    bboxData = bboxMap[bboxIds[index]] || null;
                }

                objects.push({
                    id: sliceId,
                    name: obj['@name'] || `Object_${index}`,
                    boundingBox: bboxData ? {
                        min: bboxData.min,
                        max: bboxData.max,
                        size: bboxData.size
                    } : null,
                    area: bboxData ? bboxData.area : null,
                    layer_height: bboxData ? bboxData.layer_height : null
                });
            });
        }

        // Fallback: if no slice info, use plate JSON data
        if (objects.length === 0 && this.plateData && this.plateData.bbox_objects) {
            this.plateData.bbox_objects.forEach((obj, index) => {
                const bbox = obj.bbox || [0, 0, 0, 0];
                const min = [bbox[0], bbox[1]];
                const max = [bbox[2], bbox[3]];
                objects.push({
                    id: obj.id,
                    name: obj.name || `Object_${index}`,
                    boundingBox: {
                        min: min,
                        max: max,
                        size: [bbox[2] - bbox[0], bbox[3] - bbox[1]]
                    },
                    area: obj.area,
                    layer_height: obj.layer_height
                });
            });
        }

        return {
            filename: this.metadata.filename || 'Unknown',
            plateIndex: this.metadata.plate_index || 0,
            objects: objects,
            totalObjects: objects.length,
            metadata: this.metadata,
            sliceInfo: this.sliceInfo
        };
    }

    /**
     * Extract bounding box from object data
     * @param {Object} obj - Object data
     * @returns {Object} Bounding box coordinates
     */
    extractBoundingBox(obj) {
        if (obj.bounding_box) {
            return {
                min: obj.bounding_box.min || [0, 0, 0],
                max: obj.bounding_box.max || [0, 0, 0],
                size: obj.bounding_box.size || [0, 0, 0]
            };
        }
        return null;
    }

    /**
     * Extract coordinates from object data
     * @param {Object} obj - Object data
     * @returns {Array} Coordinates array
     */
    extractCoordinates(obj) {
        if (obj.coordinates) {
            return obj.coordinates;
        }
        if (obj.bounding_box) {
            // If no explicit coordinates, use bounding box center
            const min = obj.bounding_box.min || [0, 0, 0];
            const max = obj.bounding_box.max || [0, 0, 0];
            return [
                (min[0] + max[0]) / 2,
                (min[1] + max[1]) / 2,
                (min[2] + max[2]) / 2
            ];
        }
        return [0, 0, 0];
    }

    /**
     * Generate visual ASCII representation of objects.
     * Colors are always applied via chalk, which auto-disables when NO_COLOR is set
     * (the CLI's global --no-color flag wires that up).
     * @param {Array} objects - Array of objects with bounding boxes
     * @param {number} width - Terminal width (default 80)
     * @param {number} height - Terminal height (default 20)
     * @returns {string} ASCII representation
     */
    generateVisualRepresentation(objects, width = 80, height = 20) {
        if (!objects || objects.length === 0) {
            return "No objects to display";
        }

        // Find the overall bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        objects.forEach(obj => {
            if (obj.boundingBox) {
                minX = Math.min(minX, obj.boundingBox.min[0]);
                minY = Math.min(minY, obj.boundingBox.min[1]);
                maxX = Math.max(maxX, obj.boundingBox.max[0]);
                maxY = Math.max(maxY, obj.boundingBox.max[1]);
            }
        });

        // Files using the slicer's "instances" copy feature have no per-instance bboxes —
        // skip the empty rectangle view and just list the objects.
        if (!isFinite(minX)) {
            let out = `Plate Layout (${objects.length} objects):\n`;
            out += `(no per-object bounding boxes available — drop --borders for the shape view)\n\n`;
            out += '📋 Object List:\n';
            objects.forEach((obj, index) => {
                const colorFn = this.colors[index % this.colors.length];
                out += colorFn(`   ${obj.id}: ${obj.name}`) + '\n';
            });
            return out;
        }

        // Add some padding
        const padding = 5;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const rangeX = maxX - minX;
        const rangeY = maxY - minY;

        // Create the canvas with color information
        const canvas = Array(height).fill().map(() => Array(width).fill({ char: ' ', color: null }));
        
        // Draw objects
        objects.forEach((obj, objIndex) => {
            if (!obj.boundingBox) return;

            const x1 = Math.floor(((obj.boundingBox.min[0] - minX) / rangeX) * (width - 2));
            const y1 = Math.floor(((maxY - obj.boundingBox.max[1]) / rangeY) * (height - 2));
            const x2 = Math.floor(((obj.boundingBox.max[0] - minX) / rangeX) * (width - 2));
            const y2 = Math.floor(((maxY - obj.boundingBox.min[1]) / rangeY) * (height - 2));

            // Ensure bounds
            const startX = Math.max(0, Math.min(x1, x2));
            const endX = Math.min(width - 1, Math.max(x1, x2));
            const startY = Math.max(0, Math.min(y1, y2));
            const endY = Math.min(height - 1, Math.max(y1, y2));

            // Get color for this object (chalk auto-disables when NO_COLOR is set).
            const colorFn = this.colors[objIndex % this.colors.length];

            // Draw rectangle
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    if (y === startY || y === endY || x === startX || x === endX) {
                        canvas[y][x] = {
                            char: '#',
                            color: colorFn
                        };
                    }
                }
            }

            // Add ID and name in the center if there's space
            const centerX = Math.floor((startX + endX) / 2);
            const centerY = Math.floor((startY + endY) / 2);
            const idStr = obj.id.toString();
            const nameStr = obj.name || '';
            
            if (centerY >= 0 && centerY < height && centerX >= 0 && centerX < width) {
                // Try to place the ID on the first line
                for (let i = 0; i < idStr.length && centerX + i < width; i++) {
                    if (canvas[centerY][centerX + i].char === ' ' || canvas[centerY][centerX + i].char === '#') {
                        canvas[centerY][centerX + i] = {
                            char: idStr[i],
                            color: colorFn
                        };
                    }
                }
                
                // Try to place the name on the second line if there's space
                if (centerY + 1 < height && nameStr.length > 0) {
                    const nameStartX = Math.max(0, centerX - Math.floor(nameStr.length / 2));
                    for (let i = 0; i < nameStr.length && nameStartX + i < width; i++) {
                        if (canvas[centerY + 1][nameStartX + i].char === ' ' || canvas[centerY + 1][nameStartX + i].char === '#') {
                            canvas[centerY + 1][nameStartX + i] = {
                                char: nameStr[i],
                                color: colorFn
                            };
                        }
                    }
                }
            }
        });

        // Convert canvas to string
        let result = `Plate Layout (${objects.length} objects):\n`;
        result += '═'.repeat(width) + '\n';
        
        canvas.forEach(row => {
            let line = '│';
            row.forEach(cell => {
                line += cell.color ? cell.color(cell.char) : cell.char;
            });
            line += '│';
            result += line + '\n';
        });

        result += '═'.repeat(width) + '\n';
        result += `Legend: # = Object, Numbers = Object IDs, Text = STL Names\n`;
        result += `Scale: X: ${minX.toFixed(1)} to ${maxX.toFixed(1)} mm, Y: ${minY.toFixed(1)} to ${maxY.toFixed(1)} mm\n`;

        if (objects.length > 0) {
            result += '\n📋 Object List:\n';
            objects.forEach((obj, index) => {
                const colorFn = this.colors[index % this.colors.length];
                result += colorFn(`   ${obj.id}: ${obj.name}`) + '\n';
            });
        }

        return result;
    }

    /**
     * Locate a per-plate top-down PNG inside the loaded 3MF.
     * Prefers `Metadata/pick_<N>.png` (per-object segmentation mask) then falls back
     * to `Metadata/top_<N>.png` (rendered top-down view). Returns null if neither found.
     *
     * @param {number} plateIndex - 1-based plate index from plate JSON
     * @returns {Promise<{name: string, kind: 'pick'|'top', png: import('pngjs').PNG} | null>}
     */
    async extractPlatePng(plateIndex) {
        if (!this.zip) return null;
        const names = Object.keys(this.zip.files);
        const lower = (s) => s.toLowerCase();

        const findOne = (predicate) => names.find((n) => predicate(lower(n)));
        const pickName =
            findOne((n) => n.endsWith(`pick_${plateIndex}.png`)) ||
            findOne((n) => n.endsWith("pick.png"));
        const topName =
            findOne((n) => n.endsWith(`top_${plateIndex}.png`)) ||
            findOne((n) => n.endsWith("top.png"));

        const chosen = pickName ? { name: pickName, kind: "pick" } :
                       topName  ? { name: topName,  kind: "top"  } : null;
        if (!chosen) return null;

        const buf = await this.zip.file(chosen.name).async("nodebuffer");
        const png = PNG.sync.read(buf);
        return { ...chosen, png };
    }

    /**
     * Render an ASCII view of objects using the segmentation/top-down PNG from the 3MF.
     * For `pick` PNGs each distinct color is its own object — we colorize and try to label.
     * For `top` PNGs we just threshold luminance and render silhouettes (no per-object colors).
     */
    renderShapeAscii(objects, plateImage, { width = 60, label = true } = {}) {
        if (!plateImage || !plateImage.png) return null;
        const { png, kind } = plateImage;
        const { width: pw, height: ph, data } = png;

        // Terminal cells are roughly 2:1 (tall:wide), so squash Y by half.
        const cellW = pw / width;
        const cellH = cellW * 2;
        const height = Math.max(1, Math.floor(ph / cellH));

        const isBackground = (r, g, b, a) => a < 16 || (r < 16 && g < 16 && b < 16);

        // Bambu/Orca encodes each printed instance's identify_id directly in the pick PNG's RGB:
        //   id = r | (g << 8) | (b << 16).
        // We use that to map regions → objects exactly, instead of color-quantizing (the old approach
        // collapsed adjacent ids into one region — e.g. ids 83 & 98 both quantized to 0x50/0x60).
        const idFromPixel = (r, g, b) => r | (g << 8) | (b << 16);

        const knownIds = new Set();
        for (const o of objects) {
            const n = typeof o.id === "string" ? parseInt(o.id, 10) : o.id;
            if (Number.isFinite(n)) knownIds.add(n);
        }

        // --- step 1: per-pixel region stats keyed by decoded id (full image, no quantization).
        // Tracks both pixel bbox and centroid so we can place labels and (optionally) derive mm bboxes.
        const idStats = new Map(); // id -> {sumX, sumY, count, minX, minY, maxX, maxY}
        let anyKnownIdsInPng = false;
        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                const i = (y * pw + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                if (isBackground(r, g, b, a)) continue;
                if (kind !== "pick") continue;
                const id = idFromPixel(r, g, b);
                // Ignore AA fringe pixels — only count exact matches against known instance ids.
                if (!knownIds.has(id)) continue;
                anyKnownIdsInPng = true;
                let st = idStats.get(id);
                if (!st) {
                    st = { sumX: 0, sumY: 0, count: 0, minX: x, minY: y, maxX: x, maxY: y };
                    idStats.set(id, st);
                }
                st.sumX += x; st.sumY += y; st.count++;
                if (x < st.minX) st.minX = x;
                if (y < st.minY) st.minY = y;
                if (x > st.maxX) st.maxX = x;
                if (y > st.maxY) st.maxY = y;
            }
        }
        const minCount = Math.max(4, Math.floor(pw * ph * 0.0005));
        const significantIds = [...idStats.entries()].filter(([, s]) => s.count >= minCount);

        // Map id → object for quick lookup during render.
        const idToObject = new Map();
        const objectIndex = new Map(); // object.id (original) → 1-based index for labelling
        objects.forEach((o, i) => {
            objectIndex.set(o.id, i + 1);
            const n = typeof o.id === "string" ? parseInt(o.id, 10) : o.id;
            if (Number.isFinite(n)) idToObject.set(n, o);
        });

        // --- step 2: pick a chalk color per object. Index-based so colors are stable across runs.
        const palette = [
            chalk.red, chalk.green, chalk.blue, chalk.yellow,
            chalk.magenta, chalk.cyan, chalk.redBright, chalk.greenBright,
            chalk.blueBright, chalk.yellowBright, chalk.magentaBright, chalk.cyanBright,
        ];
        const colorForObject = (obj) => {
            const idx = (objectIndex.get(obj.id) || 1) - 1;
            return palette[idx % palette.length];
        };

        // --- step 3: render into a 2D cell buffer so we can overlay labels.
        const cells = new Array(height);
        for (let cy = 0; cy < height; cy++) {
            cells[cy] = new Array(width);
            for (let cx = 0; cx < width; cx++) {
                const px = Math.min(pw - 1, Math.floor((cx + 0.5) * cellW));
                const py = Math.min(ph - 1, Math.floor((cy + 0.5) * cellH));
                const idx = (py * pw + px) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                if (isBackground(r, g, b, a)) {
                    cells[cy][cx] = { ch: " ", fn: null };
                    continue;
                }
                if (kind === "pick") {
                    const id = idFromPixel(r, g, b);
                    const obj = idToObject.get(id);
                    // If the PNG's RGB doesn't decode to any known instance id (non-Bambu
                    // encoding, AA fringe, etc.), still render the silhouette uncolored
                    // rather than dropping the pixel — better degraded view than blank.
                    const fn = obj ? colorForObject(obj) : null;
                    cells[cy][cx] = { ch: "█", fn };
                } else {
                    // top.png: pick a shading char from luminance.
                    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
                    const ch = lum > 0.66 ? "█" : lum > 0.33 ? "▓" : "░";
                    cells[cy][cx] = { ch, fn: null };
                }
            }
        }

        // --- step 4: overlay 1-based index labels at each region's centroid (pick mode only).
        // We use the 1-based index instead of the raw identify_id because identify_ids can be 2–3
        // digits and crowd small regions; the legend below maps index → id → name.
        if (kind === "pick") {
            for (const [id, st] of significantIds) {
                const obj = idToObject.get(id);
                if (!obj) continue;
                const px = st.sumX / st.count;
                const py = st.sumY / st.count;
                const gx = Math.min(width - 1, Math.max(0, Math.floor(px / cellW)));
                const gy = Math.min(height - 1, Math.max(0, Math.floor(py / cellH)));
                const label = String(objectIndex.get(obj.id));
                const startX = Math.max(0, Math.min(width - label.length, gx - Math.floor(label.length / 2)));
                // chalk.inverse swaps fg/bg so digits stand out against the colored block.
                const baseFn = colorForObject(obj);
                const labelFn = (s) => baseFn(chalk.inverse(s));
                for (let i = 0; i < label.length; i++) {
                    cells[gy][startX + i] = { ch: label[i], fn: labelFn };
                }
            }
        }

        const lines = [];
        const top = "┌" + "─".repeat(width) + "┐";
        const bot = "└" + "─".repeat(width) + "┘";
        lines.push(top);
        for (let cy = 0; cy < height; cy++) {
            let row = "│";
            for (let cx = 0; cx < width; cx++) {
                const { ch, fn } = cells[cy][cx];
                row += fn ? fn(ch) : ch;
            }
            row += "│";
            lines.push(row);
        }
        lines.push(bot);

        if (label) {
            lines.push("");
            lines.push(`📋 Object List (${kind} mask${kind === "top" ? ", silhouettes only" : ""}):`);
            for (const obj of objects) {
                const idx = objectIndex.get(obj.id);
                const fn = colorForObject(obj);
                lines.push(fn(`   [${idx}] ${obj.id}: ${obj.name}`));
            }
            if (kind === "pick" && objects.length > 0 && !anyKnownIdsInPng) {
                lines.push(chalk.gray(`   (could not match any object id to pick PNG colors — diagram may be inaccurate)`));
            }
        }

        return lines.join("\n");
    }

    /**
     * Parse XML to object recursively
     * @param {Element} element - XML element
     * @returns {Object} Parsed object
     */
    parseXMLToObject(element) {
        const result = {};
        
        // Handle attributes
        if (element.attributes) {
            for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                result[`@${attr.name}`] = attr.value;
            }
        }

        // Handle child nodes
        for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i];
            
            if (child.nodeType === 1) { // Element node
                const childName = child.nodeName;
                const childValue = this.parseXMLToObject(child);
                
                if (result[childName]) {
                    if (!Array.isArray(result[childName])) {
                        result[childName] = [result[childName]];
                    }
                    result[childName].push(childValue);
                } else {
                    result[childName] = childValue;
                }
            } else if (child.nodeType === 3 && child.textContent.trim()) { // Text node
                result.text = child.textContent.trim();
            }
        }

        return result;
    }
}

module.exports = ThreeMFParser; 
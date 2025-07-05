const JSZip = require('jszip');
const { DOMParser } = require('xmldom');
const chalk = require('chalk');

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

            // First, examine the ZIP structure
            const fileNames = Object.keys(this.zip.files);
            console.log("Files in 3MF:", fileNames);

            // Try to find metadata files
            const metadataFiles = fileNames.filter(name => name.includes('Metadata') || name.includes('metadata'));
            const plateJsonFiles = fileNames.filter(name => name.includes('plate') && name.endsWith('.json'));
            const sliceFiles = fileNames.filter(name => name.includes('slice') || name.includes('Slice'));

            console.log("Metadata files:", metadataFiles);
            console.log("Plate JSON files:", plateJsonFiles);
            console.log("Slice files:", sliceFiles);

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

            return this.getObjectInfo();
        } catch (error) {
            throw new Error(`Failed to parse 3MF file: ${error.message}`);
        }
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
            
            plateObjects.forEach((obj, index) => {
                const sliceId = obj['@identify_id'];
                const bboxData = bboxMap[sliceId] || bboxMap[Object.keys(bboxMap)[index]] || null;
                
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
     * Generate visual ASCII representation of objects
     * @param {Array} objects - Array of objects with bounding boxes
     * @param {number} width - Terminal width (default 80)
     * @param {number} height - Terminal height (default 20)
     * @param {boolean} colored - Whether to use colored output (default false)
     * @returns {string} ASCII representation
     */
    generateVisualRepresentation(objects, width = 80, height = 20, colored = false) {
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

            // Get color for this object
            const colorFn = colored ? this.colors[objIndex % this.colors.length] : null;

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
                if (colored && cell.color) {
                    line += cell.color(cell.char);
                } else {
                    line += cell.char;
                }
            });
            line += '│';
            result += line + '\n';
        });
        
        result += '═'.repeat(width) + '\n';
        result += `Legend: # = Object, Numbers = Object IDs, Text = STL Names\n`;
        if (colored) {
            result += `Colors: Each object has a unique color for better identification\n`;
        }
        result += `Scale: X: ${minX.toFixed(1)} to ${maxX.toFixed(1)} mm, Y: ${minY.toFixed(1)} to ${maxY.toFixed(1)} mm\n`;
        
        // Add object list with colors
        if (objects.length > 0) {
            result += '\n📋 Object List:\n';
            objects.forEach((obj, index) => {
                const colorFn = colored ? this.colors[index % this.colors.length] : null;
                const objectText = `   ${obj.id}: ${obj.name}`;
                
                if (colored && colorFn) {
                    result += colorFn(objectText) + '\n';
                } else {
                    result += objectText + '\n';
                }
            });
        }

        return result;
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
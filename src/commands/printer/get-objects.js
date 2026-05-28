const BaseCommand = require("../base/BaseCommand");
const { getPrinter } = require("../../config/config");
const MqttService = require("../../services/connection/MqttService");
const FtpService = require("../../services/file/FtpService");
const ThreeMFParser = require("../../utils/3mf-parser");
const fs = require("fs");
const path = require("path");
const os = require("os");

class GetObjectsCommand extends BaseCommand {
    constructor() {
        super("get-objects", "Get object information from current print");
        this.mqttService = new MqttService();
        this.ftpService = new FtpService();
        this.parser = new ThreeMFParser();
    }

    async validate(args, options = {}) {
        if (options.file) {
            if (!fs.existsSync(options.file)) {
                throw new Error(`File not found: ${options.file}`);
            }
            return;
        }
        if (!args.printerName) {
            throw new Error("Printer name is required (or pass --file <path> to read a local 3MF)");
        }
        getPrinter(args.printerName);
    }

    async run(args, options = {}) {
        let tempFilePath = null;
        let filename;
        let source;
        let fileBuffer;

        try {
            if (options.file) {
                // Local-file mode: skip MQTT/FTP entirely.
                filename = path.basename(options.file);
                source = options.file;
                this.log("info", `Reading local 3MF: ${options.file}`);
                fileBuffer = fs.readFileSync(options.file);
            } else {
                const config = getPrinter(args.printerName);
                source = args.printerName;
                this.log("info", `Connecting to ${args.printerName} (${config.address})`);
                const status = await this.mqttService.getPrinterStatus(
                    config.address, config.deviceId, config.accessCode
                );
                this.mqttService.closeAllConnections();

                const print = status.print;
                if (!print.gcode_file || print.gcode_state === "IDLE") {
                    throw new Error("No active print job found");
                }
                this.log("info", `Current print file: ${print.gcode_file}`);

                await this.ftpService.connect(config.address, config.accessCode);
                filename = await this._resolveThreeMfPath(print);
                this.log("info", `Downloading 3MF: ${filename}`);
                tempFilePath = path.join(os.tmpdir(), `bambu-cli-${Date.now()}-${path.basename(filename)}`);
                await this.ftpService.downloadFile(filename, tempFilePath);
                fileBuffer = fs.readFileSync(tempFilePath);
            }

            this.log("info", "Parsing 3MF file");
            const objectInfo = await this.parser.parseFromBuffer(fileBuffer);
            this.log("info", `Found ${objectInfo.totalObjects} objects`);

            // Shape rendering is the default. --borders opts into the bounding-box view.
            let plateImage = null;
            if (!options.borders) {
                try {
                    plateImage = await this.parser.extractPlatePng(objectInfo.plateIndex);
                    if (!plateImage) {
                        this.log("warn", "No pick_*.png or top_*.png found in 3MF; falling back to border view");
                    } else {
                        this.log("info", `Using ${plateImage.kind} mask: ${plateImage.name}`);
                    }
                } catch (err) {
                    this.log("warn", `Failed to extract plate PNG: ${err.message}`);
                }
            }

            // Side-channel the decoded PNG so formatResult can use it without polluting --json output.
            this._lastPlateImage = plateImage;

            return {
                source,
                filename,
                objectInfo,
                plateImage: plateImage ? { kind: plateImage.kind, name: plateImage.name } : null,
            };
        } finally {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
            }
            this.mqttService.closeAllConnections();
            if (this.ftpService.isConnected()) this.ftpService.close();
        }
    }

    /**
     * Find the actual .3mf file on the printer's storage.
     *
     * A1-series puts the 3MF basename directly in `print.gcode_file`
     * (e.g. `ur_800_mini.gcode.3mf`), so we can download that path as-is.
     *
     * P2S / OS v3 instead reports the in-archive plate gcode path
     * (e.g. `/data/Metadata/plate_1.gcode`), which is *not* a path on the FTP
     * filesystem. The real 3MF sits at the storage root, named after
     * `print.subtask_name` (e.g. `/ur_800.gcode.3mf`).
     */
    async _resolveThreeMfPath(print) {
        const gcodeFile = print.gcode_file || "";
        const looksLikePlateGcode = /Metadata\/plate_\d+\.gcode$/i.test(gcodeFile) || gcodeFile.startsWith("/data/");

        if (!looksLikePlateGcode) {
            return gcodeFile;
        }

        // Discovery mode: scan likely directories for a .3mf whose basename matches subtask_name.
        const subtask = print.subtask_name;
        if (!subtask) {
            throw new Error(
                `Printer reported an in-archive gcode path (${gcodeFile}) but no subtask_name to locate the source 3MF. Pass --file <path> to bypass this lookup.`
            );
        }

        const candidateDirs = ["/", "/cache"];
        const matches = [];
        for (const dir of candidateDirs) {
            let entries;
            try {
                entries = await this.ftpService.listFiles(dir);
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (entry.type !== "file") continue;
                if (!/\.3mf$/i.test(entry.name)) continue;
                const base = entry.name.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "");
                if (base === subtask) {
                    const full = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
                    matches.push(full);
                }
            }
            if (matches.length) break;
        }

        if (matches.length === 0) {
            throw new Error(
                `Could not locate a 3MF for subtask "${subtask}" on the printer (looked in ${candidateDirs.join(", ")}). Pass --file <path> to read a local copy instead.`
            );
        }
        if (matches.length > 1) {
            this.log("warn", `Multiple 3MF candidates for "${subtask}": ${matches.join(", ")} — using first.`);
        }
        return matches[0];
    }

    formatResult(result, options = {}) {
        if (!result.success) return `❌ Failed to get objects: ${result.error.message}`;

        const { source, filename, objectInfo } = result.data;
        const plateImage = this._lastPlateImage;
        const sep = "═".repeat(60);

        let out = `📦 Objects in ${filename} (from ${source})\n${sep}\n\n`;
        out += `📋 File Information:\n`;
        out += `   Filename: ${objectInfo.filename}\n`;
        out += `   Plate Index: ${objectInfo.plateIndex}\n`;
        out += `   Total Objects: ${objectInfo.totalObjects}\n\n`;

        if (objectInfo.objects.length === 0) {
            out += `   No objects found in the file.\n\n`;
        } else {
            out += `🔍 Object Details:\n`;
            for (const obj of objectInfo.objects) {
                out += `   Object ${obj.id}: ${obj.name}\n`;
                if (obj.boundingBox) {
                    out += `     Bounding Box:\n`;
                    out += `       Min: [${obj.boundingBox.min.join(", ")}]\n`;
                    out += `       Max: [${obj.boundingBox.max.join(", ")}]\n`;
                    out += `       Size: [${obj.boundingBox.size.join(", ")}]\n`;
                }
                if (obj.area) out += `     Area: ${obj.area.toFixed(2)} mm²\n`;
                if (obj.layer_height) out += `     Layer Height: ${obj.layer_height.toFixed(2)} mm\n`;
                out += `\n`;
            }

            // Visual layout — shape view by default; --borders forces the bounding-box view.
            if (!options.borders && plateImage) {
                out += `📐 Visual Layout (${plateImage.kind} from 3MF):\n`;
                out += this.parser.renderShapeAscii(objectInfo.objects, plateImage, {
                    width: 60,
                }) + `\n`;
            } else {
                if (!options.borders) {
                    out += `📐 Visual Layout (bounding-box fallback — no top-down PNG in 3MF):\n`;
                } else {
                    out += `📐 Visual Layout:\n`;
                }
                out += this.parser.generateVisualRepresentation(
                    objectInfo.objects, 60, 15
                ) + `\n`;
            }
        }

        out += `${sep}\n📅 Last Updated: ${new Date().toLocaleString()}\n`;
        return out;
    }
}

module.exports = GetObjectsCommand;

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

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        getPrinter(args.printerName);
    }

    async run(args, options = {}) {
        const config = getPrinter(args.printerName);
        let tempFilePath = null;

        try {
            this.log("info", `Connecting to ${args.printerName} (${config.address})`);
            const status = await this.mqttService.getPrinterStatus(
                config.address, config.deviceId, config.accessCode
            );
            this.mqttService.closeAllConnections();

            const print = status.print;
            if (!print.gcode_file || print.gcode_state === "IDLE") {
                throw new Error("No active print job found");
            }
            const filename = print.gcode_file;
            this.log("info", `Current print file: ${filename}`);

            await this.ftpService.connect(config.address, config.accessCode);
            tempFilePath = path.join(os.tmpdir(), `bambu-cli-${Date.now()}-${path.basename(filename)}`);
            this.log("info", `Downloading 3MF: ${filename}`);
            await this.ftpService.downloadFile(filename, tempFilePath);

            const fileBuffer = fs.readFileSync(tempFilePath);
            this.log("info", "Parsing 3MF file");
            const objectInfo = await this.parser.parseFromBuffer(fileBuffer);
            this.log("info", `Found ${objectInfo.totalObjects} objects`);

            // Optional: extract per-plate PNG for --shape rendering.
            let plateImage = null;
            if (options.shape) {
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
                printer: args.printerName,
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

    formatResult(result, options = {}) {
        if (!result.success) return `❌ Failed to get objects: ${result.error.message}`;

        const { printer, filename, objectInfo } = result.data;
        const plateImage = this._lastPlateImage;
        const sep = "═".repeat(60);

        let out = `📦 Objects in ${filename} on ${printer}\n${sep}\n\n`;
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

            // Visual layout
            if (options.shape && plateImage) {
                out += `📐 Visual Layout (${plateImage.kind} from 3MF):\n`;
                out += this.parser.renderShapeAscii(objectInfo.objects, plateImage, {
                    width: 60,
                    colored: options.colored !== false,
                }) + `\n`;
            } else {
                if (options.shape) {
                    out += `📐 Visual Layout (bounding-box fallback — no top-down PNG in 3MF):\n`;
                } else {
                    out += `📐 Visual Layout:\n`;
                }
                out += this.parser.generateVisualRepresentation(
                    objectInfo.objects, 60, 15, options.colored
                ) + `\n`;
            }
        }

        out += `${sep}\n📅 Last Updated: ${new Date().toLocaleString()}\n`;
        return out;
    }
}

module.exports = GetObjectsCommand;

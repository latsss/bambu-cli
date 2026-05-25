const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

const CA_CERT = fs.readFileSync(path.join(__dirname, "../../utils/mqtt/ca_cert.pem"));

// Shared across all MqttService instances within a process so commands don't
// reset to 0 and collide.
let globalSequenceId = 0;
function nextSequenceId() {
    globalSequenceId = (globalSequenceId + 1) % 1_000_000;
    return globalSequenceId.toString();
}

/**
 * MQTT service for communicating with Bambu Lab printers.
 * Connections are cached per (address, deviceId); call closeAllConnections()
 * before exit instead of calling client.end() inside individual operations.
 */
class MqttService {
    constructor() {
        this.clients = new Map();
    }

    async connect(address, deviceId, accessCode) {
        const key = `${address}:${deviceId}`;
        const cached = this.clients.get(key);
        if (cached && cached.connected) return cached;

        return new Promise((resolve, reject) => {
            const client = mqtt.connect({
                protocol: "mqtts",
                hostname: address,
                port: 8883,
                connectTimeout: 4000,
                clean: true,
                username: "bblp",
                password: accessCode,
                servername: deviceId,
                ca: CA_CERT,
            });

            const onError = (err) => {
                client.removeListener("connect", onConnect);
                reject(err);
            };
            const onConnect = () => {
                client.removeListener("error", onError);
                client.on("close", () => this.clients.delete(key));
                this.clients.set(key, client);
                resolve(client);
            };

            client.once("connect", onConnect);
            client.once("error", onError);
        });
    }

    subscribe(client, topic) {
        return new Promise((resolve, reject) => {
            client.subscribe(topic, (err) => (err ? reject(err) : resolve()));
        });
    }

    publish(client, topic, message) {
        return new Promise((resolve, reject) => {
            const payload = typeof message === "string" ? message : JSON.stringify(message);
            client.publish(topic, payload, (err) => (err ? reject(err) : resolve()));
        });
    }

    /**
     * Wait for the next message on `topic` for which `predicate(payload)` returns truthy.
     * Always removes its listener and clears its timer (no leaks on timeout/resolve).
     */
    waitForMessage(client, topic, predicate, timeout = 10_000) {
        return new Promise((resolve, reject) => {
            const handler = (msgTopic, raw) => {
                if (msgTopic !== topic) return;
                let payload;
                try {
                    payload = JSON.parse(raw.toString());
                } catch {
                    return; // ignore non-JSON
                }
                if (!predicate(payload)) return;
                cleanup();
                resolve(payload);
            };
            const cleanup = () => {
                clearTimeout(timer);
                client.removeListener("message", handler);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout waiting for matching message on ${topic}`));
            }, timeout);
            client.on("message", handler);
        });
    }

    /**
     * Publish a command and wait for its response.
     *
     * Matching strategy (most → least common):
     *   - top-level key (`print`/`info`/`system`) of the request must appear in the response
     *   - if `matchCommand` is set, the inner `command` field must equal it
     *   - if `matchSequence` is true, sequence_id of the request must equal that of the response
     *     (only when the response actually carries one — printers do not always echo it)
     *
     * Default is key-only matching, since most Bambu replies (notably the pushall status
     * broadcast) do NOT echo the request's sequence_id — they carry the printer's own
     * monotonically-increasing counter.
     */
    async sendCommand(client, deviceId, command, opts = {}) {
        const { timeout = 10_000, matchKey, matchCommand, matchSequence = false } = opts;
        const requestTopic = `device/${deviceId}/request`;
        const reportTopic = `device/${deviceId}/report`;
        const expectedKey = matchKey || this.topLevelKey(command);
        const requestSeq = matchSequence ? this.extractSequenceId(command) : null;

        await this.subscribe(client, reportTopic);

        const predicate = (payload) => {
            if (expectedKey && !payload[expectedKey]) return false;
            if (matchCommand && payload[expectedKey].command !== matchCommand) return false;
            if (requestSeq != null) {
                const responseSeq = this.extractSequenceId(payload);
                if (responseSeq != null && String(responseSeq) !== String(requestSeq)) return false;
            }
            return true;
        };

        const wait = this.waitForMessage(client, reportTopic, predicate, timeout);
        await this.publish(client, requestTopic, command);
        return wait;
    }

    /**
     * Subscribe to the report topic and call `onPayload(parsedJson)` for every message.
     * Returns an unsubscribe function.
     */
    async streamReports(client, deviceId, onPayload) {
        const reportTopic = `device/${deviceId}/report`;
        await this.subscribe(client, reportTopic);
        const handler = (msgTopic, raw) => {
            if (msgTopic !== reportTopic) return;
            try {
                onPayload(JSON.parse(raw.toString()));
            } catch {
                // ignore
            }
        };
        client.on("message", handler);
        return () => client.removeListener("message", handler);
    }

    topLevelKey(command) {
        if (!command || typeof command !== "object") return null;
        for (const k of ["print", "info", "system", "pushing"]) {
            if (command[k]) return k === "pushing" ? "print" : k;
        }
        return null;
    }

    extractSequenceId(data) {
        if (!data || typeof data !== "object") return null;
        for (const k of ["info", "print", "system", "pushing"]) {
            if (data[k] && data[k].sequence_id != null) return data[k].sequence_id;
        }
        return data.sequence_id != null ? data.sequence_id : null;
    }

    addSequenceIdIfMissing(command) {
        const out = JSON.parse(JSON.stringify(command));
        for (const k of ["print", "info", "system", "pushing"]) {
            if (out[k] && typeof out[k] === "object" && out[k].sequence_id == null) {
                out[k].sequence_id = nextSequenceId();
                return out;
            }
        }
        return out;
    }

    async getPrinterStatus(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);
        return this.sendCommand(client, deviceId, {
            pushing: {
                sequence_id: nextSequenceId(),
                command: "pushall",
                version: 1,
                push_target: 1,
            },
        });
    }

    async getPrinterVersion(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);
        const response = await this.sendCommand(client, deviceId, {
            info: { sequence_id: nextSequenceId(), command: "get_version" },
        }, { matchCommand: "get_version" });
        return response.info.module[0].sw_ver;
    }

    /**
     * Send a `print` command (start/stop/pause/resume/load_filament/unload_filament/...).
     * `extra` is merged into the print object.
     */
    async sendPrintCommand(address, deviceId, accessCode, command, extra = {}) {
        const client = await this.connect(address, deviceId, accessCode);
        return this.sendCommand(client, deviceId, {
            print: { sequence_id: nextSequenceId(), command, ...extra },
        });
    }

    async startPrint(address, deviceId, accessCode, fileName) {
        return this.sendPrintCommand(address, deviceId, accessCode, "start", { file: fileName });
    }

    async stopPrint(address, deviceId, accessCode) {
        return this.sendPrintCommand(address, deviceId, accessCode, "stop");
    }

    async pausePrint(address, deviceId, accessCode) {
        return this.sendPrintCommand(address, deviceId, accessCode, "pause");
    }

    async resumePrint(address, deviceId, accessCode) {
        return this.sendPrintCommand(address, deviceId, accessCode, "resume");
    }

    async unloadFilament(address, deviceId, accessCode) {
        return this.sendPrintCommand(address, deviceId, accessCode, "unload_filament");
    }

    async skipObjects(address, deviceId, accessCode, objectIds) {
        if (!Array.isArray(objectIds) || objectIds.length === 0) {
            throw new Error("Object IDs array is required and cannot be empty");
        }
        for (const [i, id] of objectIds.entries()) {
            if (typeof id !== "string" && typeof id !== "number") {
                throw new Error(`Invalid object ID at index ${i}: must be string or number`);
            }
        }
        return this.sendPrintCommand(address, deviceId, accessCode, "skip_objects", { obj_list: objectIds });
    }

    /**
     * LED control. node is typically "work_light" or "chamber_light".
     * mode is one of "on" | "off" | "flashing".
     */
    async setLight(address, deviceId, accessCode, node, mode) {
        const client = await this.connect(address, deviceId, accessCode);
        return this.sendCommand(client, deviceId, {
            system: {
                sequence_id: nextSequenceId(),
                command: "ledctrl",
                led_node: node,
                led_mode: mode,
                led_on_time: 500,
                led_off_time: 500,
                loop_times: 0,
                interval_time: 0,
            },
        });
    }

    async sendCustomCommand(address, deviceId, accessCode, command, { validateSequenceId = true, timeout = 10_000 } = {}) {
        const client = await this.connect(address, deviceId, accessCode);
        const withSeq = this.addSequenceIdIfMissing(command);
        logger.debug("Sending custom command", { command: withSeq, deviceId });
        const response = await this.sendCommand(client, deviceId, withSeq, {
            timeout,
            matchSequence: validateSequenceId,
        });
        logger.debug("Custom command response", { response, deviceId });
        return response;
    }

    closeAllConnections() {
        for (const client of this.clients.values()) {
            try {
                client.end(true);
            } catch {
                // ignore
            }
        }
        this.clients.clear();
    }

    isConnected(address, deviceId) {
        const client = this.clients.get(`${address}:${deviceId}`);
        return !!(client && client.connected);
    }
}

module.exports = MqttService;
module.exports.nextSequenceId = nextSequenceId;

const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");

/**
 * MQTT service for communicating with Bambu Lab printers
 * Handles connection management, message publishing, and subscription
 */
class MqttService {
    constructor() {
        this.clients = new Map(); // Store active connections
        this.messageHandlers = new Map(); // Store message handlers
        this.bblCA = fs.readFileSync(
            path.join(__dirname, "../../utils/mqtt/ca_cert.pem")
        );
        this.sequenceId = 0; // Sequence ID counter for tracking requests
    }

    /**
     * Get next sequence ID
     * @returns {string} Next sequence ID as string
     */
    getNextSequenceId() {
        this.sequenceId = (this.sequenceId + 1) % 1000000; // Wrap around at 1M
        return this.sequenceId.toString();
    }

    /**
     * Get current sequence ID (without incrementing)
     * @returns {number} Current sequence ID value
     */
    getCurrentSequenceId() {
        return this.sequenceId;
    }

    /**
     * Reset sequence ID counter
     */
    resetSequenceId() {
        this.sequenceId = 0;
    }

    /**
     * Connect to a printer via MQTT
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} MQTT client instance
     */
    async connect(address, deviceId, accessCode) {
        const connectionKey = `${address}:${deviceId}`;

        // Return existing connection if available
        if (this.clients.has(connectionKey)) {
            const client = this.clients.get(connectionKey);
            if (client.connected) {
                return client;
            }
        }

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
                ca: this.bblCA,
            });

            client.on("connect", () => {
                this.clients.set(connectionKey, client);
                resolve(client);
            });

            client.on("error", (error) => {
                reject(error);
            });

            client.on("close", () => {
                this.clients.delete(connectionKey);
            });
        });
    }

    /**
     * Subscribe to a topic
     * @param {Object} client - MQTT client
     * @param {string} topic - Topic to subscribe to
     * @returns {Promise<void>}
     */
    async subscribe(client, topic) {
        return new Promise((resolve, reject) => {
            client.subscribe(topic, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Publish a message to a topic
     * @param {Object} client - MQTT client
     * @param {string} topic - Topic to publish to
     * @param {Object|string} message - Message to publish
     * @returns {Promise<void>}
     */
    async publish(client, topic, message) {
        return new Promise((resolve, reject) => {
            const payload =
                typeof message === "string" ? message : JSON.stringify(message);
            client.publish(topic, payload, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Wait for a message on a specific topic
     * @param {Object} client - MQTT client
     * @param {string} topic - Topic to listen to
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<string>} Received message
     */
    async waitForMessage(client, topic, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(
                    new Error(`Timeout waiting for message on topic: ${topic}`)
                );
            }, timeout);

            const handler = (msgTopic, message) => {
                if (msgTopic === topic) {
                    clearTimeout(timer);
                    client.removeListener("message", handler);
                    resolve(message.toString());
                }
            };

            client.on("message", handler);
        });
    }

    /**
     * Send a command and wait for response
     * @param {Object} client - MQTT client
     * @param {string} deviceId - Device ID
     * @param {Object} command - Command to send
     * @param {string} responseTopic - Topic to listen for response
     * @param {number} timeout - Timeout in milliseconds
     * @param {boolean} validateSequenceId - Whether to validate response sequence ID
     * @returns {Promise<Object>} Response data
     */
    async sendCommand(
        client,
        deviceId,
        command,
        responseTopic = null,
        timeout = 10000,
        validateSequenceId = false
    ) {
        const requestTopic = `device/${deviceId}/request`;
        const reportTopic = responseTopic || `device/${deviceId}/report`;

        // Extract sequence ID for validation
        const requestSequenceId = this.extractSequenceId(command);

        // Subscribe to response topic
        await this.subscribe(client, reportTopic);

        // Send command
        await this.publish(client, requestTopic, command);

        // Wait for response
        const response = await this.waitForMessage(
            client,
            reportTopic,
            timeout
        );
        const responseData = JSON.parse(response);

        // Validate sequence ID if requested
        if (validateSequenceId && requestSequenceId) {
            const responseSequenceId = this.extractSequenceId(responseData);
            if (requestSequenceId !== responseSequenceId) {
                throw new Error(
                    `Sequence ID mismatch: expected ${requestSequenceId}, got ${responseSequenceId}`
                );
            }
        }

        return responseData;
    }

    /**
     * Extract sequence ID from command or response
     * @param {Object} data - Command or response data
     * @returns {string|null} Sequence ID or null if not found
     */
    extractSequenceId(data) {
        // Check common locations for sequence_id
        if (data.info && data.info.sequence_id) {
            return data.info.sequence_id;
        }
        if (data.print && data.print.sequence_id) {
            return data.print.sequence_id;
        }
        if (data.system && data.system.sequence_id) {
            return data.system.sequence_id;
        }
        
        // Recursively search for sequence_id in any object
        const findSequenceId = (obj) => {
            if (typeof obj !== 'object' || obj === null) {
                return null;
            }
            
            if (obj.sequence_id !== undefined) {
                return obj.sequence_id;
            }
            
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const found = findSequenceId(obj[key]);
                    if (found !== null) {
                        return found;
                    }
                }
            }
            return null;
        };
        
        return findSequenceId(data);
    }

    /**
     * Get comprehensive printer status
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} Printer status
     */
    async getPrinterStatus(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            pushing: {
                sequence_id: this.getNextSequenceId(),
                command: "pushall",
                version: 1,
                push_target: 1
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Get printer version
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<string>} Software version
     */
    async getPrinterVersion(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const sequenceId = this.getNextSequenceId();
        const command = {
            info: {
                sequence_id: sequenceId,
                command: "get_version",
            },
        };

        console.log(
            `🔢 Using sequence ID: ${sequenceId} for get_version command`
        );
        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response.info.module[0].sw_ver;
    }

    /**
     * Start a print job
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @param {string} fileName - Name of the file to print
     * @returns {Promise<Object>} Print start response
     */
    async startPrint(address, deviceId, accessCode, fileName) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "start",
                file: fileName,
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Stop a print job
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} Stop response
     */
    async stopPrint(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "stop",
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Pause a print job
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} Pause response
     */
    async pausePrint(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "pause",
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Resume a print job
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} Resume response
     */
    async resumePrint(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "resume",
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Load filament
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @param {string} target - Target temperature (optional)
     * @returns {Promise<Object>} Load filament response
     */
    async loadFilament(address, deviceId, accessCode, target = null) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "load_filament",
            },
        };

        // Add target temperature if provided
        if (target) {
            command.print.target = target;
        }

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Unload filament
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @returns {Promise<Object>} Unload filament response
     */
    async unloadFilament(address, deviceId, accessCode) {
        const client = await this.connect(address, deviceId, accessCode);

        const command = {
            print: {
                sequence_id: this.getNextSequenceId(),
                command: "unload_filament",
            },
        };

        const response = await this.sendCommand(client, deviceId, command);
        client.end();

        return response;
    }

    /**
     * Skip objects during printing
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @param {Array} objectIds - Array of object IDs to skip
     * @returns {Promise<Object>} Skip objects response
     */
    async skipObjects(address, deviceId, accessCode, objectIds) {
        const client = await this.connect(address, deviceId, accessCode);

        // Validate object IDs
        if (!Array.isArray(objectIds) || objectIds.length === 0) {
            throw new Error("Object IDs array is required and cannot be empty");
        }

        // Validate each object ID
        objectIds.forEach((id, index) => {
            if (typeof id !== 'string' && typeof id !== 'number') {
                throw new Error(`Invalid object ID at index ${index}: must be string or number`);
            }
        });

        const command = {
            print: {
                sequence_id: "0",
                command: "skip_objects",
                obj_list: objectIds
            }
        };

        const response = await this.sendCommand(client, deviceId, command, null, 10000, false);
        client.end();

        return response;
    }

    /**
     * Close all active connections
     */
    closeAllConnections() {
        for (const [key, client] of this.clients) {
            if (client.connected) {
                client.end();
            }
        }
        this.clients.clear();
    }

    /**
     * Get connection status
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @returns {boolean} Connection status
     */
    isConnected(address, deviceId) {
        const connectionKey = `${address}:${deviceId}`;
        const client = this.clients.get(connectionKey);
        return client && client.connected;
    }

    /**
     * Send custom MQTT command to printer
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     * @param {Object} command - Custom command object
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command response
     */
    async sendCustomCommand(address, deviceId, accessCode, command, options = {}) {
        const client = await this.connect(address, deviceId, accessCode);

        // Add sequence ID if not present
        const commandWithSequence = this.addSequenceIdIfMissing(command);
        
        // Log the command being sent
        const logger = require("../../utils/logger");
        logger.info("Sending custom command", {
            command: commandWithSequence,
            deviceId: deviceId
        });

        // Determine if we should validate sequence ID
        const validateSequenceId = options.validateSequenceId !== false; // Default to true unless explicitly disabled

        const response = await this.sendCommand(
            client, 
            deviceId, 
            commandWithSequence,
            null,
            10000,
            validateSequenceId
        );
        
        // Log the response
        logger.info("Received custom command response", {
            response: response,
            deviceId: deviceId
        });
        
        client.end();
        return response;
    }

    /**
     * Add sequence ID to command if missing
     * @param {Object} command - Command object
     * @returns {Object} Command with sequence ID
     */
    addSequenceIdIfMissing(command) {
        // Deep clone the command to avoid modifying the original
        const commandCopy = JSON.parse(JSON.stringify(command));
        
        // Find the first object that has a 'sequence_id' field or should have one
        const addSequenceId = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // Check if this object should have a sequence_id (common command objects)
                    if (key === 'print' || key === 'info' || key === 'system') {
                        if (!obj[key].sequence_id) {
                            obj[key].sequence_id = this.getNextSequenceId();
                        }
                        return true;
                    }
                    // Recursively check nested objects
                    if (addSequenceId(obj[key])) {
                        return true;
                    }
                }
            }
            return false;
        };

        addSequenceId(commandCopy);
        return commandCopy;
    }
}

module.exports = MqttService;

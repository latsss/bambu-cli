const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");
const { getPrinter } = require("../../config/config");

const bblCA = fs.readFileSync(path.join(__dirname, "ca_cert.pem"));

const connectAsync = (address, deviceID, accessCode) => {
    return new Promise((resolve, reject) => {
        const client = mqtt.connect({
            protocol: "mqtts",
            hostname: address,
            port: 8883,
            connectTimeout: 4e3,
            clean: true,
            username: "bblp",
            password: accessCode,
            servername: deviceID,
            ca: bblCA,
        });
        client.on("connect", () => resolve(client));
        client.on("error", reject);
    });
};

const subscribeAsync = (client, topic) => {
    return new Promise((resolve, reject) => {
        client.subscribe(topic, (err) => (err ? reject(err) : resolve()));
    });
};

const publishAsync = (client, topic, message) => {
    return new Promise((resolve, reject) => {
        client.publish(topic, message, (err) =>
            err ? reject(err) : resolve()
        );
    });
};

const waitForMessage = (client, topic) => {
    return new Promise((resolve) => {
        const handler = (msgTopic, message) => {
            if (msgTopic === topic) {
                client.removeListener("message", handler); // Clean up
                resolve(message.toString());
            }
        };
        client.on("message", handler);
    });
};

module.exports.getPrinterVersion = async (printerName) => {
    const { address, deviceId, accessCode } = await getPrinter(printerName);
    const client = await connectAsync(address, deviceId, accessCode);
    await subscribeAsync(client, `device/${deviceId}/report`);

    let message = JSON.stringify({
        info: {
            sequence_id: "0",
            command: "get_version",
        },
    });
    await publishAsync(client, `device/${deviceId}/request`, message);
    const response = await waitForMessage(client, `device/${deviceId}/report`);
    client.end();
    return JSON.parse(response).info.module[0].sw_ver;
};

const mqtt = require('mqtt');
const express = require('express')
const admin = require('firebase-admin')
const serviceAccount = require('./secrets/admin.json');
const bodyParser = require('body-parser')

// Replace with your MQTT broker's URL
const brokerUrl = 'mqtt://20.82.177.27';
const client = mqtt.connect(brokerUrl);

require('dotenv').config()

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

const firestore = admin.firestore();



const app = express();

require("./routes/endpoints")(app)

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


client.on('connect', function () {
    console.log('Connected to MQTT Broker');

    // Subscribe to the desired topic
    client.subscribe('watchdog/#', function (err) {
        if (!err) {
            console.log('Subscribed to watchdog/#');
        } else {
            console.error('Subscription error:', err);
        }
    });
});


client.on('message', function (topic, message) {
    console.log(`Message received on ${topic}: ${message.toString()}`);
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

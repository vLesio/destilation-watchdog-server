const admin = require('firebase-admin');
const bodyParser = require('body-parser')
const e = require("express");
const {InfluxDB, Point} = require('@influxdata/influxdb-client')
const jsonParser = bodyParser.json()
const firestore = admin.firestore();

const crypto = require("./crypto")

const url = 'http://20.82.177.27:8086'
const token = process.env.INFLUXDB_TOKEN;
const influxClient = new InfluxDB({url, token})
influxClient.constructor
let org = `Destilation Watchdog`
let bucket = `test`
let queryClient = influxClient.getQueryApi(org)

module.exports = function (app) {
    app.get('/user', async (req, res) => {
        const idToken = req.headers.authorization || '';

        verifyToken(idToken)
            .then((uid) => {
                firestore.collection('users').doc(uid).get().then(
                    doc => {
                        console.log("Returning user data:")
                        console.log(doc.data())
                        res.status(200).send(doc.data())
                    }
                ).catch((error) => {
                    res.status(404).send({
                        error: "User data not found.",
                        message: "User data could not be found on the server."
                    })
                })
            })
            .catch((error) => {
                res.status(401).send({
                    error: error.code,
                    message: error.message
                });
            });
    })

    app.get('/devices/:deviceId', async (req, res) => {
        const idToken = req.headers.authorization || '';
        verifyToken(idToken).then(uid => {
            const {deviceId} = req.params
            firestore.collection('devices').doc(deviceId).get().then(doc => {
                console.log("Doc:")
                console.log(doc.data())
                res.status(200).send(doc.data())
            }).catch(error => {
                console.log(error)
                res.status(404).send({
                    error: "Undefined error lol",
                    message: "Either not found or something else"
                })
            })
        }).catch(error => {
            res.status(401).send({error: error.code, message: error.message})
        })
    })

    app.get('/debil', async (req, res) => {
        const certRequest = crypto.generateClientCertificate({commonName: 'dwqdwqdqwsadqw'})
        console.log(certRequest.csr)
        console.log(certRequest.privateKey)
        const cert = crypto.signCSR(certRequest.csr)
        console.log(cert)
    })

    app.get('/devices/:deviceId/measurements/:period', async (req, res) => {
        const {deviceId, period} = req.params
        console.log(deviceId + " " + period)
        let fluxQuery = `from(bucket: "temperatures")
                                |> range(start: -${period}m)
                                |> filter(fn: (r) => r._measurement == "temperatures")
                                |> filter(fn: (r) => r.device == "${deviceId}")`
        let measurements = []
        queryClient.queryRows(fluxQuery, {
            next: (row, tableMeta) => {
                const tableObject = tableMeta.toObject(row)
                measurements.push(tableObject)
            },
            error: (error) => {
                res.status(401).send({error: 'Error getting data from influx', message: error})
            },
            complete: () => {
                const groupedData = measurements.reduce((acc, item) => {

                    const key = item._time;

                    if (!acc.has(key)) {
                        acc.set(key, {
                            _time: item._time,
                            temperatureColumn: null,
                            temperatureKeg: null
                        });
                    }

                    const entry = acc.get(key);
                    if (item._field === 'temperatureColumn') {
                        entry.temperatureColumn = item._value;
                    } else if (item._field === 'temperatureKeg') {
                        entry.temperatureKeg = item._value;
                    }

                    return acc;
                }, new Map());

                const resultArray = Array.from(groupedData.values());
                res.status(200).send(resultArray)
            },
        })
    })

    app.post('/devices/:deviceId/addUser/:email', async (req, res) => {
        const idToken = req.headers.authorization || '';
        verifyToken(idToken).then(uid => {
            const {deviceId, email} = req.params
            admin.auth().getUserByEmail(email).then(user => {
                const data = {
                    deviceId: deviceId,
                    isOwner: false
                }
                firestore.collection('users').doc(user.uid).update({
                    devices: admin.firestore.FieldValue.arrayUnion(data)
                }).then(doc => {
                    firestore.collection('devices').doc(deviceId).update({
                        users: admin.firestore.FieldValue.arrayUnion(user.uid)
                    }).then(doc2 => {
                        res.status(201).send({message: "Updated"})
                    }).catch(error => {
                        res.status(401).send({
                            error: "Update failed",
                            message: "Firestore error, could not update devices."
                        })
                    })
                }).catch(error => {
                    res.status(401).send({
                        error: "Update failed",
                        message: "Firestore error, could not update users."
                    })
                })
            }).catch(error => {
                res.status(404).send({error: "Could not get user", message: error.message})
            })
        }).catch(error => {
            res.status(401).send({error: error.code, message: error.message})
        })
    })

    app.post('/devices/register', jsonParser, async (req, res) => {

    })

    app.post('/devices/unregister', jsonParser, async (req, res) => {

    })

    app.post('/register', jsonParser, async (req, res) => {
        if (!req.body) {
            return res.status(400).send('No request body!');
        }

        const {email, password} = req.body;

        admin.auth().createUser({
            email: email,
            password: password
        }).then(user => {
            firestore.collection('users').doc(user.uid).set({devices: []})
            res.status(201).send({message: "User created."})
        }).catch(error => {
            res.status(401).send({error: "Error while registering user", message: error.message})
        })
    })

    function verifyToken(idToken) {
        let token = idToken
        if (token && token.startsWith('Bearer ')) {
            token = token.split(' ')[1];
        }
        return admin.auth().verifyIdToken(token)
            .then((decodedToken) => {
                const uid = decodedToken.uid;
                return uid;
            })
            .catch((error) => {
                throw error;
            });
    }

    async function checkDeviceOwnership(userId, deviceId) {
        firestore.collection('devices').doc(deviceId).get().then(device => {
            const data = device.data()
            if (data && data.users && data.users.contains(userId)) {
                return true
            } else {
                throw new Error("User does no own a device")
            }
        }).catch((error) => {
            throw error
        })
    }
}



const fs = require("fs");
const forge = require('node-forge');

function generateClientCertificate(userDetails) {
    // Generate a keypair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create a new CSR
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{
        name: 'commonName',
        value: userDetails.commonName // Use user-specific details
    },
        // ... you can add more attributes here
    ]);

    // Sign the CSR
    csr.sign(keys.privateKey);

    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const csrPem = forge.pki.certificationRequestToPem(csr);

    return { privateKey: privateKeyPem, csr: csrPem };
}

function signCSR(csrPem) {
    // Load your CA key and certificate
    const caCertPem = fs.readFileSync('/secrets/certs/ca.crt', 'utf8');
    const caKeyPem = fs.readFileSync('/secrets/certs/ca.key', 'utf8');

    const caKeyDec = forge.pki.decryptRsaPrivateKey(caKeyPem, process.env.CA_KEY_PASSWORD);

    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyDec);
    const csr = forge.pki.certificationRequestFromPem(csrPem);

    // Verify CSR
    if (!csr.verify()) {
        throw new Error('Verification of CSR failed.');
    }

    // Create a certificate based on the CSR
    const cert = forge.pki.createCertificate();
    cert.publicKey = csr.publicKey;
    cert.serialNumber = '01'; // should be unique
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1); // 1 year validity
    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(caCert.subject.attributes); // CA's attributes

    // Sign the certificate with the CA's private key
    cert.sign(caKey, forge.md.sha256.create());

    // Convert the certificate to PEM format
    const certPem = forge.pki.certificateToPem(cert);

    return certPem;
}

module.exports = { generateClientCertificate, signCSR };

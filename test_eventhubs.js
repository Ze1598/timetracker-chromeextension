// Configuration for Fabric Eventstream
// Read connection string on event hub details for any missing information
const config = {
    namespaceName: 'redacted',
    eventHubName: 'redacted',
    sasKeyName: 'redacted',
    sasKey: 'redacted',
    apiVersion: '2014-01'
};

async function generateSignature(signatureString, sasKey) {
    // Convert the sasKey and signatureString to Uint8Array
    const encoder = new TextEncoder();
    const keyData = encoder.encode(sasKey);
    const messageData = encoder.encode(signatureString);

    // Import the key
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    // Sign the message
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        messageData
    );

    // Convert the signature to base64
    const signatureArray = Array.from(new Uint8Array(signature));
    const base64Signature = btoa(String.fromCharCode.apply(null, signatureArray));

    return base64Signature;
}

// Function to create a SAS token
async function createSasToken() {
    // Token expires in 1 hour
    const expiry = Math.ceil(Date.now() / 1000) + 3600;

    // URI to sign
    const uri = encodeURIComponent(`https://${config.namespaceName}.servicebus.windows.net/${config.eventHubName}`);

    // String to sign
    const signatureString = uri + '\n' + expiry;

    // Create signature
    const signature = await generateSignature(signatureString, config.sasKey);

    // Construct SAS token
    const sasToken = `SharedAccessSignature sr=${uri}&sig=${encodeURIComponent(signature)}&se=${expiry}&skn=${config.sasKeyName}`;

    return sasToken;
}

// Function to send data to Event Hub
async function sendToEventHub(data) {
    try {
        // Create endpoint URL
        const endpoint = `https://${config.namespaceName}.servicebus.windows.net/${config.eventHubName}/messages`;

        // Get SAS token
        const sasToken = await createSasToken();

        // Prepare the request body
        // Event Hubs expects an array of events, each potentially with different properties
        const events = [data];

        // Make the request
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': sasToken
            },
            body: JSON.stringify(events)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send message. Status: ${response.status}, Error: ${errorText}`);
        }

        console.log('Message sent successfully');
        return true;

    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}


const sampleData = {
    timestamp: new Date().toISOString(),
    website: "test.fabric",
    duration: 0.05,
    closeTime: new Date().toISOString()
};

sendToEventHub(sampleData)
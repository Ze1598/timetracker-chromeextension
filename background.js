let tabData = {};


/////////////////////////// FABRIC //////////////////////////////
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

/////////////////////////// FABRIC //////////////////////////////

// Function to check if a URL should be ignored
function shouldIgnoreUrl(url) {
  if (!url) return true;

  const ignoredUrls = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',  // for Microsoft Edge
    'opera://',  // for Opera
    'vivaldi://',  // for Vivaldi
    'brave://'  // for Brave
  ];

  return ignoredUrls.some(ignoredUrl => url.startsWith(ignoredUrl)) || url === 'about:blank' || url === 'about:newtab';
}

// Function to get the hostname from a URL
function getHostname(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch (e) {
    console.error('Invalid URL:', url);
    return '';
  }
}

// Function to save time entry
async function saveTimeEntry(tabId) {
  if (tabData[tabId]) {
    const endTime = new Date();
    const duration = (endTime - tabData[tabId].startTime) / (1000 * 60); // Convert to minutes
    const timeEntry = {
      timestamp: tabData[tabId].startTime.toISOString(),
      website: tabData[tabId].hostname,
      duration: duration.toFixed(2),
      closeTime: endTime.toISOString()
    };

    chrome.storage.local.get(['timeEntries'], result => {
      const timeEntries = result.timeEntries || [];
      timeEntries.push(timeEntry);
      chrome.storage.local.set({ timeEntries: timeEntries });
    });

    // Push entry into fabric eventhouse via event hub
    await sendToEventHub(timeEntry)

    delete tabData[tabId];
  }
}

// Function to handle tab updates
async function handleTabUpdate(tabId, url) {
  if (!url) return;

  if (!shouldIgnoreUrl(url)) {
    const hostname = getHostname(url);
    if (hostname) {
      if (!tabData[tabId]) {
        tabData[tabId] = {
          startTime: new Date(),
          hostname: hostname
        };
      } else if (hostname !== tabData[tabId].hostname) {
        // If the hostname has changed, save the previous entry and start a new one
        await saveTimeEntry(tabId);
        tabData[tabId] = {
          startTime: new Date(),
          hostname: hostname
        };
      }
    }
  } else if (tabData[tabId]) {
    // If we're navigating to an ignored URL, save the current entry and remove the tab data
    await saveTimeEntry(tabId);
  }
}

// Listen for tab creation
chrome.tabs.onCreated.addListener(async tab => {
  if (tab.url) {
    await handleTabUpdate(tab.id, tab.url);
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await handleTabUpdate(tabId, tab.url);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await saveTimeEntry(tabId);
});

// Handle browser startup
chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(async tab => {
      if (tab.url) {
        await handleTabUpdate(tab.id, tab.url);
      }
    });
  });
});

// Handle extension install or update
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(async tab => {
      if (tab.url) {
        await handleTabUpdate(tab.id, tab.url);
      }
    });
  });
});

// Handle window close
chrome.windows.onRemoved.addListener(() => {
  Object.keys(tabData).forEach(async tabId => {
    await saveTimeEntry(parseInt(tabId));
  });
});
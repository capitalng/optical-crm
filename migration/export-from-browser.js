// Export the live customer data USING THE SHOP DESKTOP'S EXISTING LOGIN.
// No password needed — but it must run in the browser that is still signed in
// to capital.ergroup.info (the customer list loads when you open the site).
//
// HOW TO USE (on the shop's desktop):
//   1. Open capital.ergroup.info/user and confirm customers appear in the list.
//   2. Press F12 to open DevTools, click the "Console" tab.
//   3. Chrome blocks pasting at first: type   allow pasting   and press Enter.
//   4. Copy this ENTIRE file, paste it into the console, press Enter.
//   5. Wait — when the alert says Done, "live-users.json" is in Downloads.
//   6. Get that file to the dev PC at: d:\projects\New folder\optical-crm\migration\live-users.json

(async () => {
  const apiKey = 'AIzaSyAYSU90V1qXd7yYf7qIDfes-dekdnbu3BE';

  // 1. Find the saved login session (Firebase keeps it in localStorage or IndexedDB).
  let userData = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('firebase:authUser:')) {
      userData = JSON.parse(localStorage.getItem(k));
    }
  }
  if (!userData) {
    userData = await new Promise((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const store = req.result
            .transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const row = (getAll.result || []).find(
              (r) => String(r.fbase_key || '').startsWith('firebase:authUser:'),
            );
            resolve(row ? row.value : null);
          };
          getAll.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      };
    });
  }
  if (!userData || !userData.stsTokenManager) {
    alert('No saved login found in this browser. Is this the computer that stays signed in?');
    return;
  }

  // 2. Exchange the saved session for a fresh access token.
  const tokenRes = await fetch('https://securetoken.googleapis.com/v1/token?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(userData.stsTokenManager.refreshToken),
  });
  const tok = await tokenRes.json();
  if (!tok.id_token) {
    alert('The saved session could not be renewed: ' + JSON.stringify(tok));
    return;
  }

  // 3. Download the entire /users database and save it as a file.
  const dataRes = await fetch(
    'https://capital-7c93a.firebaseio.com/users.json?auth=' + tok.id_token,
  );
  if (!dataRes.ok) {
    alert('Download failed: HTTP ' + dataRes.status + ' — ' + (await dataRes.text()));
    return;
  }
  const blob = await dataRes.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'live-users.json';
  a.click();
  alert('Done! live-users.json (' + (blob.size / 1048576).toFixed(1) + ' MB) is in the Downloads folder.');
})();

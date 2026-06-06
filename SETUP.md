# RPCA56 Reunion App — Complete Setup Guide
# Do this once before the party. Takes about 25 minutes.

## What runs where
| What | Where | Cost |
|---|---|---|
| Website + upload handler | Your computer (Flask) | Free |
| Public URL for friends | Cloudflare Tunnel | Free |
| Likes, comments, post data | Firestore (cloud) | Free |
| Photos | Your Google Drive (100 GB) | Free |

---

## STEP 1 — Set up Google Drive service account

This lets the app upload photos to YOUR Google Drive automatically.

### 1a. Create a Google Cloud project
1. Go to https://console.cloud.google.com
2. Click the project dropdown (top left) → "New Project"
3. Name: **rpca56-reunion** → Create

### 1b. Enable Google Drive API
1. Go to "APIs & Services" → "Library"
2. Search: **Google Drive API** → Click it → Enable

### 1c. Create a Service Account
1. Go to "APIs & Services" → "Credentials"
2. Click "+ Create Credentials" → "Service Account"
3. Name: **reunion-uploader** → Create and Continue → Done
4. Click the service account you just created
5. Go to the "Keys" tab → "Add Key" → "Create new key" → JSON → Create
6. A JSON file will download — **keep it safe**

### 1d. Share your Google Drive folder with the service account
1. Open the downloaded JSON file — find the `client_email` field (looks like `reunion-uploader@rpca56-reunion.iam.gserviceaccount.com`)
2. Go to your Google Drive folder:
   https://drive.google.com/drive/folders/1rKBETjUB8N__6kTBKZa-cwOCVDcBKmYP
3. Right-click the folder → Share
4. Paste the `client_email` → give **Editor** access → Send

---

## STEP 2 — Create your .env file

Copy the values from the downloaded JSON file into a new file called `.env` in the `reunion-app` folder:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=reunion-uploader@rpca56-reunion.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=1rKBETjUB8N__6kTBKZa-cwOCVDcBKmYP
PORT=3000
```

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the `client_email` from the JSON file
- `GOOGLE_PRIVATE_KEY` = the `private_key` from the JSON file (keep the quotes and \n)

---

## STEP 3 — Fill in your Firebase config

Open `public/firebase-config.js` and paste your Firebase project settings.

To find them:
1. Go to https://console.firebase.google.com/project/rpca56-reunion/settings/general
2. Scroll down to "Your apps" → click the web app (</> icon)
3. Copy the `firebaseConfig` values into `public/firebase-config.js`

---

## STEP 4 — Set Firestore security rules

1. Go to https://console.firebase.google.com/project/rpca56-reunion/firestore/databases/-default-/rules
2. Replace all the rules with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      match /comments/{commentId} {
        allow read, write: if true;
      }
    }
  }
}
```

3. Click **Publish**

---

## STEP 5 — Install Cloudflare Tunnel (one time)

Open Command Prompt or PowerShell and run:

```
winget install --id Cloudflare.cloudflared
```

If winget is not available, download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

---

## STEP 6 — Run the app (do this on party day)

Open **two** terminal windows in the `reunion-app` folder:

**Terminal 1 — Start the server:**
```
python server.py
```

**Terminal 2 — Start the public tunnel:**
```
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will print a URL like:
```
https://random-words-here.trycloudflare.com
```

**Share that URL with all 300 classmates.** That's it!

---

## STEP 7 — Add your alumni logo (optional)

Place a file named `logo.png` in the `public/` folder.
The app will display it automatically in the header.

---

## How it works on party day

1. Friend opens the URL on their phone
2. They go to "Upload", enter their name, choose up to 10 photos
3. Photos upload to YOUR Google Drive folder
4. Post appears live in everyone's feed (real-time)
5. Everyone can like and comment
6. Leaderboard shows top photos and top senders

When the party is over, just close the terminal windows. The Cloudflare URL stops working automatically.
All photos remain safely in your Google Drive.

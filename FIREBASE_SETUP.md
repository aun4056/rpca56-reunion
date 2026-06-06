# Firebase Setup Guide — RPCA56 Reunion App
# Complete this once. Takes about 20 minutes.

## STEP 1 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click "Add project"
3. Name it: **rpca56-reunion** → Continue
4. Disable Google Analytics (not needed) → Create project
5. Wait ~30 seconds, then click "Continue"

---

## STEP 2 — Enable Firestore Database

1. In the left menu, click **Build → Firestore Database**
2. Click "Create database"
3. Choose **"Start in production mode"** → Next
4. Choose the closest region (e.g. **asia-southeast1** for Thailand) → Enable
5. Wait for it to finish

---

## STEP 3 — Enable Firebase Storage

1. In the left menu, click **Build → Storage**
2. Click "Get started"
3. Choose **"Start in production mode"** → Next
4. Use the same region as Firestore → Done

---

## STEP 4 — Register the Web App & Get Config

1. On the Project Overview page, click the **</>** (Web) icon
2. App nickname: **reunion-web** → Click "Register app"
3. You will see a config block like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "rpca56-reunion.firebaseapp.com",
  projectId: "rpca56-reunion",
  storageBucket: "rpca56-reunion.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

4. Copy ALL these values into `public/firebase-config.js` (replace the placeholders)
5. Click "Continue to console"

---

## STEP 5 — Deploy Security Rules

Open a terminal (Command Prompt or PowerShell) in the `reunion-app` folder.

### Install Firebase CLI (one time only):
```
pip install firebase-tools
```
Or if you have Node.js:
```
npm install -g firebase-tools
```
Or download directly: https://firebase.google.com/docs/cli#install-cli-windows

### Log in and deploy:
```
firebase login
firebase use --add          ← select your project: rpca56-reunion
firebase deploy --only firestore:rules,storage
```

---

## STEP 6 — Deploy the Website

```
firebase deploy --only hosting
```

Firebase will give you a URL like:
**https://rpca56-reunion.web.app**

That's it! Share this URL with all 300 classmates. 🎉

---

## STEP 7 — Update CORS for Storage (if photos don't load)

If uploaded photos appear broken, run this once in Google Cloud Shell
(go to https://console.cloud.google.com → click the terminal icon):

```bash
echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com
```

Replace `YOUR_PROJECT_ID` with your actual project ID.

---

## Free Tier Limits (more than enough for 300 people)

| Resource | Free limit | Expected usage |
|---|---|---|
| Firestore reads | 50,000 / day | ~15,000 (fine) |
| Firestore writes | 20,000 / day | ~3,000 (fine) |
| Storage | 5 GB | ~2 GB for 300 people |
| Hosting bandwidth | 10 GB / month | ~1 GB (fine) |

No credit card required for these limits.

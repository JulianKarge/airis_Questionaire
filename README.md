# AIRIS UX Study — A/B Test Questionnaire

A bilingual (EN/DE) questionnaire for evaluating two UI prototypes using SUS and UEQ.

## Setup Guide

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**, name it (e.g. `airis-ux-study`), follow the wizard
3. In the left sidebar: **Build → Firestore Database**
4. Click **Create database** → choose **Production mode** → pick a region → **Enable**

### 2. Set Firestore Security Rules

In Firestore → **Rules** tab, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /responses/{docId} {
      allow create: if true;          // anyone can submit
      allow read, update, delete: if false; // only via Firebase Console
    }
  }
}
```

Click **Publish**.

### 3. Get Your Firebase Config

1. In Project settings (gear icon) → **General** → scroll to **Your apps**
2. Click **Add app** → Web (`</>`) → register with a nickname
3. Copy the `firebaseConfig` object

### 4. Update `js/firebase-config.js`

Replace the placeholder values with your actual config:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 5. Deploy to GitHub Pages

1. Create a new GitHub repository (public)
2. Push all files to the `main` branch
3. Go to **Settings → Pages**
4. Under **Source** select: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)`
5. Click **Save** — your site will be live at:
   - `https://YOUR_USERNAME.github.io/YOUR_REPO/` — Questionnaire
   - `https://YOUR_USERNAME.github.io/YOUR_REPO/results.html` — Results Dashboard

### 6. Add Your GitHub Pages Domain to Firebase

In Firebase Console → **Build → Authentication → Settings → Authorized domains**
Add: `YOUR_USERNAME.github.io`

---

## Project Structure

```
├── index.html           # Questionnaire (bilingual, all steps)
├── results.html         # Results dashboard (/results)
├── css/
│   ├── styles.css       # HPE Design System styles
│   └── results.css      # Dashboard-specific styles
├── js/
│   ├── firebase-config.js  # ← Update with your credentials
│   ├── app.js           # Questionnaire logic
│   └── results.js       # Results dashboard logic
├── .nojekyll            # Prevents Jekyll processing on GitHub Pages
└── Ressources/
    └── Questions.txt    # Source questions reference
```

## Questionnaire Flow

1. Language selection (EN / DE)
2. Participant details (name, occupation, UX experience)
3. Prototype A intro → SUS (10 items, 1–5) → UEQ (26 items, 1–7)
4. Prototype B intro → SUS (10 items, 1–5) → UEQ (26 items, 1–7)
5. Thank you + optional CSV download

## Results Dashboard Features

- Live data from Firestore
- Filter by language and experience level
- SUS score distribution charts (A vs B)
- SUS per-question comparison
- UEQ item means (horizontal bar chart)
- UEQ radar chart by scale (Attractiveness, Perspicuity, Efficiency, Dependability, Stimulation, Novelty)
- Participants table with SUS grades
- Export all filtered results as CSV
